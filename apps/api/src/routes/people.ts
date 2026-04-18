import type { FastifyInstance } from 'fastify';
import type { PGlite } from '@electric-sql/pglite';

// Subquery that identifies managers (users who have at least one direct report)
const IS_MANAGER_SUBQUERY = `EXISTS (SELECT 1 FROM sys_user dr WHERE dr.manager = u.sys_id)`;
const IS_NOT_MANAGER = `NOT ${IS_MANAGER_SUBQUERY}`;

/**
 * Date-overlap filter for assignments.
 * An assignment overlaps with a date range when:
 *   assignment.start_date <= range_end  AND  assignment.end_date >= range_start
 * NULLs are treated as open-ended (no bound).
 */
function dateOverlapCondition(alias: string, startParam: string, endParam: string): string {
  return `(${alias}.start_date IS NULL OR ${alias}.start_date <= ${endParam})
      AND (${alias}.end_date IS NULL OR ${alias}.end_date >= ${startParam})`;
}

/** Returns current month boundaries: first day and last day */
function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Expand a manager id to either [managerId, ...directReports] or the full
 * transitive sub-org (manager + all descendants) when includeSubOrgs is true.
 * Uses a recursive CTE on sys_user.manager.
 */
async function expandManagerScope(db: PGlite, managerId: string, includeSubOrgs: boolean): Promise<string[]> {
  if (!includeSubOrgs) {
    const r = await db.query(
      `SELECT sys_id FROM sys_user WHERE sys_id = $1 OR manager = $1`,
      [managerId]
    );
    return (r.rows as any[]).map(x => x.sys_id);
  }
  const r = await db.query(
    `WITH RECURSIVE org(sys_id) AS (
       SELECT sys_id FROM sys_user WHERE sys_id = $1
       UNION
       SELECT u.sys_id FROM sys_user u JOIN org o ON u.manager = o.sys_id
     )
     SELECT sys_id FROM org`,
    [managerId]
  );
  return (r.rows as any[]).map(x => x.sys_id);
}

function parseBool(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

export async function peopleRoutes(fastify: FastifyInstance) {
  // List all managers (users who have direct reports)
  fastify.get('/api/v1/managers', async () => {
    const result = await fastify.db.query(`
      SELECT DISTINCT m.sys_id, m.first_name, m.last_name, m.email, m.title, m.department, m.avatar_url,
        COUNT(u.sys_id)::int as direct_report_count
      FROM sys_user m
      JOIN sys_user u ON u.manager = m.sys_id
      WHERE m.active = true
      GROUP BY m.sys_id
      ORDER BY m.last_name, m.first_name
    `);
    return result.rows;
  });

  // List people with optional manager filter and date-range-aware allocation
  fastify.get('/api/v1/people', async (req) => {
    const { manager, start_date, end_date, include_sub_orgs } = req.query as {
      manager?: string;
      start_date?: string;
      end_date?: string;
      include_sub_orgs?: string;
    };
    const includeSubOrgs = parseBool(include_sub_orgs);

    // Default to current month if no dates provided
    const range = (start_date && end_date)
      ? { start: start_date, end: end_date }
      : currentMonthRange();

    let whereClause = 'WHERE u.active = true';
    const params: any[] = [];
    if (manager) {
      const ids = await expandManagerScope(fastify.db, manager, includeSubOrgs);
      if (ids.length === 0) {
        // No one in scope — return empty list immediately
        return [];
      }
      const placeholders = ids.map((_, i) => `$${params.length + i + 1}`).join(',');
      params.push(...ids);
      whereClause += ` AND u.sys_id IN (${placeholders})`;
    }

    // Params for date filtering
    const startIdx = params.length + 1;
    const endIdx = params.length + 2;
    params.push(range.start, range.end);

    // total_allocation: only SUM assignments whose dates overlap with the range
    // assignments: return ALL assignments (with their date info) so the UI shows everything
    const result = await fastify.db.query(`
      SELECT u.*,
        COALESCE((
          SELECT SUM(a2.allocation_pct)
          FROM sn_plng_att_core_resource_assignment a2
          WHERE a2.resource = u.sys_id
            AND ${dateOverlapCondition('a2', `$${startIdx}`, `$${endIdx}`)}
        ), 0)::int as total_allocation,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'start_date', a.start_date, 'end_date', a.end_date,
          'project_name', p.short_description, 'project_color', p.color, 'project_number', p.number
        ) ORDER BY a.allocation_pct DESC) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM sys_user u
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.resource = u.sys_id
      LEFT JOIN pm_project p ON p.sys_id = a.project
      ${whereClause}
      GROUP BY u.sys_id
      ORDER BY u.last_name, u.first_name
    `, params);
    return result.rows.map((r: any) => ({ ...r, assignments: r.assignments || [] }));
  });

  fastify.get('/api/v1/people/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };

    const range = (start_date && end_date)
      ? { start: start_date, end: end_date }
      : currentMonthRange();

    const result = await fastify.db.query(`
      SELECT u.*,
        COALESCE((
          SELECT SUM(a2.allocation_pct)
          FROM sn_plng_att_core_resource_assignment a2
          WHERE a2.resource = u.sys_id
            AND ${dateOverlapCondition('a2', '$2', '$3')}
        ), 0)::int as total_allocation,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'start_date', a.start_date, 'end_date', a.end_date,
          'project_name', p.short_description, 'project_color', p.color, 'project_number', p.number
        ) ORDER BY a.allocation_pct DESC) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM sys_user u
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.resource = u.sys_id
      LEFT JOIN pm_project p ON p.sys_id = a.project
      WHERE u.sys_id = $1
      GROUP BY u.sys_id
    `, [id, range.start, range.end]);
    return result.rows[0] ? { ...result.rows[0] as any, assignments: (result.rows[0] as any).assignments || [] } : null;
  });

  // Dashboard summary endpoint — accepts optional manager, start_date, end_date filters
  fastify.get('/api/v1/dashboard/summary', async (req) => {
    const { manager, start_date, end_date, include_sub_orgs } = req.query as {
      manager?: string;
      start_date?: string;
      end_date?: string;
      include_sub_orgs?: string;
    };
    const includeSubOrgs = parseBool(include_sub_orgs);

    const range = (start_date && end_date)
      ? { start: start_date, end: end_date }
      : currentMonthRange();

    // When filtering by manager, restrict to their direct reports (or include manager themselves,
    // plus transitive descendants when include_sub_orgs is true).
    // Otherwise, show all individual contributors (non-managers).
    const orgIds = manager ? await expandManagerScope(fastify.db, manager, includeSubOrgs) : null;

    // Build params: [range.start, range.end, ...orgIds?]
    const params: any[] = [range.start, range.end];
    let orgInList = '';
    if (orgIds && orgIds.length > 0) {
      const placeholders = orgIds.map((_, i) => `$${params.length + i + 1}`).join(',');
      params.push(...orgIds);
      orgInList = `u.sys_id IN (${placeholders})`;
    }

    const managerFilter = orgIds && orgIds.length > 0 ? orgInList : IS_NOT_MANAGER;
    const icFilter = `u.active = true AND ${managerFilter}`;

    // Same id list, but aliased to u2 for project-team EXISTS check
    const orgInListU2 = orgIds && orgIds.length > 0
      ? `u2.sys_id IN (${orgIds.map((_, i) => `$${i + 3}`).join(',')})`
      : '';

    // Project filter — include only projects with at least one assignment
    // that overlaps the date window (and, when a manager is set, from that team/sub-org).
    const projectTeamFilter = orgIds && orgIds.length > 0
      ? `WHERE EXISTS (
          SELECT 1 FROM sn_plng_att_core_resource_assignment a2
          JOIN sys_user u2 ON u2.sys_id = a2.resource
          WHERE a2.project = p.sys_id
            AND ${orgInListU2}
            AND ${dateOverlapCondition('a2', '$1', '$2')}
        )`
      : `WHERE EXISTS (
          SELECT 1 FROM sn_plng_att_core_resource_assignment a2
          WHERE a2.project = p.sys_id
            AND ${dateOverlapCondition('a2', '$1', '$2')}
        )`;

    // Utilization distribution — date-aware
    const utilization = await fastify.db.query(`
      SELECT u.sys_id, u.first_name, u.last_name, u.title, u.department,
        COALESCE((
          SELECT SUM(a2.allocation_pct)
          FROM sn_plng_att_core_resource_assignment a2
          WHERE a2.resource = u.sys_id
            AND ${dateOverlapCondition('a2', '$1', '$2')}
        ), 0)::int as total_allocation,
        COUNT(DISTINCT a.project)::int as project_count
      FROM sys_user u
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.resource = u.sys_id
        AND ${dateOverlapCondition('a', '$1', '$2')}
      WHERE ${icFilter}
      GROUP BY u.sys_id
      ORDER BY total_allocation DESC
    `, params);

    // Per-project headcount and total allocation — date-aware
    const projectStats = await fastify.db.query(`
      SELECT p.sys_id, p.short_description, p.number, p.state, p.color,
        COUNT(DISTINCT a.resource)::int as headcount,
        COALESCE(SUM(a.allocation_pct), 0)::int as total_fte_pct
      FROM pm_project p
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.project = p.sys_id
        AND ${dateOverlapCondition('a', '$1', '$2')}
      ${projectTeamFilter}
      GROUP BY p.sys_id
      ORDER BY headcount DESC
    `, params);

    // By department — date-aware
    // Use department_name (human-readable) if available, fall back to department (may be sys_id for SN data)
    const byDepartment = await fastify.db.query(`
      SELECT COALESCE(NULLIF(u.department_name, ''), NULLIF(u.department, ''), 'Unknown') as department,
        COUNT(DISTINCT u.sys_id)::int as people_count,
        COALESCE(AVG(sub.total_alloc), 0)::int as avg_utilization
      FROM sys_user u
      LEFT JOIN (
        SELECT resource, SUM(allocation_pct) as total_alloc
        FROM sn_plng_att_core_resource_assignment
        WHERE ${dateOverlapCondition('sn_plng_att_core_resource_assignment', '$1', '$2')}
        GROUP BY resource
      ) sub ON sub.resource = u.sys_id
      WHERE ${icFilter}
      GROUP BY COALESCE(NULLIF(u.department_name, ''), NULLIF(u.department, ''), 'Unknown')
      ORDER BY avg_utilization DESC
    `, params);

    // By skill/title — date-aware
    const byTitle = await fastify.db.query(`
      SELECT u.title,
        COUNT(DISTINCT u.sys_id)::int as people_count,
        COALESCE(AVG(sub.total_alloc), 0)::int as avg_utilization
      FROM sys_user u
      LEFT JOIN (
        SELECT resource, SUM(allocation_pct) as total_alloc
        FROM sn_plng_att_core_resource_assignment
        WHERE ${dateOverlapCondition('sn_plng_att_core_resource_assignment', '$1', '$2')}
        GROUP BY resource
      ) sub ON sub.resource = u.sys_id
      WHERE ${icFilter}
      GROUP BY u.title
      ORDER BY people_count DESC
    `, params);

    // Overall stats — scoped to same filters (manager + date window)
    const overall = await fastify.db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM sys_user u WHERE ${icFilter}) as total_people,
        (SELECT COUNT(*)::int FROM pm_project p ${projectTeamFilter}) as total_projects,
        (SELECT COUNT(*)::int FROM sn_plng_att_core_resource_assignment a
          WHERE ${dateOverlapCondition('a', '$1', '$2')}) as total_assignments
    `, params);

    return {
      utilization: utilization.rows,
      projectStats: projectStats.rows,
      byDepartment: byDepartment.rows,
      byTitle: byTitle.rows,
      overall: overall.rows[0],
    };
  });
}
