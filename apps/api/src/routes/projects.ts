import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { pickColor } from '../servicenow/sync.js';

export async function projectRoutes(fastify: FastifyInstance) {

  // Shared state-code mapping used by both search and import.
  const SN_STATE_MAP: Record<string, string> = {
    '-5': 'planning', 'pending': 'planning',
    '1': 'active', 'open': 'active', 'work_in_progress': 'active', 'work in progress': 'active',
    '2': 'active',
    '3': 'closed', 'closed': 'closed', 'complete': 'closed', 'cancelled': 'closed',
  };

  function normalizeSnProject(p: any) {
    const pmRef = p.project_manager;
    const pmId = typeof pmRef === 'object' && pmRef ? pmRef.value : (pmRef || null);
    const state = SN_STATE_MAP[String(p.state)?.toLowerCase()] || (p.state ? 'active' : 'planning');
    const color = pickColor(p.number || p.sys_id);
    return {
      sys_id: p.sys_id,
      number: p.number,
      short_description: p.short_description || '(untitled)',
      description: p.description || null,
      state,
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      project_manager: pmId,
      color,
    };
  }

  // ── Search ServiceNow for projects by number or name ─────────────────
  // Read-only: does NOT import results into PGlite. Callers import explicitly
  // via POST /api/v1/projects/import once the user picks a specific result.
  fastify.get('/api/v1/projects/search', async (req, reply) => {
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return [];
    }

    const term = q.trim();

    // Always search local DB first
    const localResult = await fastify.db.query(
      `SELECT sys_id, number, short_description, description, state, start_date, end_date, project_manager, color
       FROM pm_project
       WHERE number ILIKE $1 OR short_description ILIKE $1
       ORDER BY number
       LIMIT 20`,
      [`%${term}%`]
    );
    const localProjects = localResult.rows as any[];

    // If ServiceNow is connected, also search there and merge in any
    // projects not already present locally. We do NOT upsert into PGlite here —
    // that only happens when the user explicitly picks a result.
    if (fastify.snClient) {
      try {
        const snProjects = await fastify.snClient.query<{
          sys_id: string; number: string; short_description: string; description: string;
          state: string; start_date: string; end_date: string;
          project_manager: { link: string; value: string } | string;
        }>({
          table: 'pm_project',
          query: `numberLIKE${term}^ORshort_descriptionLIKE${term}`,
          fields: ['sys_id', 'number', 'short_description', 'description', 'state', 'start_date', 'end_date', 'project_manager'],
          limit: 20,
        });

        const localIds = new Set(localProjects.map((p: any) => p.sys_id));
        for (const p of snProjects) {
          if (localIds.has(p.sys_id)) continue;
          localProjects.push({ ...normalizeSnProject(p), source: 'servicenow' });
        }
      } catch (err: any) {
        console.error(`[Projects Search] ServiceNow search failed: ${err.message}`);
        // Return local results only — don't fail the request
      }
    }

    return localProjects;
  });

  // ── Import a single ServiceNow project into PGlite ───────────────────
  // Called by the Add Project dialog when the user picks a specific search
  // result. Upserts just that one project — nothing else.
  fastify.post('/api/v1/projects/import', async (req, reply) => {
    const body = req.body as { sys_id?: string };
    const snSysId = body?.sys_id?.trim();
    if (!snSysId) {
      reply.code(400);
      return { error: 'sys_id is required' };
    }

    // If it's already local, just return it — no SN round-trip needed.
    const existing = await fastify.db.query(
      `SELECT sys_id, number, short_description, description, state, start_date, end_date, project_manager, color
       FROM pm_project WHERE sys_id = $1`,
      [snSysId]
    );
    if (existing.rows.length > 0) return existing.rows[0];

    if (!fastify.snClient) {
      reply.code(400);
      return { error: 'ServiceNow client not configured and project not found locally' };
    }

    const snRow = await fastify.snClient.queryOne<any>({
      table: 'pm_project',
      query: `sys_id=${snSysId}`,
      fields: ['sys_id', 'number', 'short_description', 'description', 'state', 'start_date', 'end_date', 'project_manager'],
    });
    if (!snRow) {
      reply.code(404);
      return { error: `Project ${snSysId} not found in ServiceNow` };
    }

    const n = normalizeSnProject(snRow);
    await fastify.db.query(
      `INSERT INTO pm_project (sys_id, number, short_description, description, state, start_date, end_date, project_manager, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (sys_id) DO UPDATE SET
         number=EXCLUDED.number, short_description=EXCLUDED.short_description, description=EXCLUDED.description,
         state=EXCLUDED.state, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
         project_manager=EXCLUDED.project_manager, color=EXCLUDED.color, sys_updated_on=now()`,
      [n.sys_id, n.number, n.short_description, n.description, n.state, n.start_date, n.end_date, n.project_manager, n.color]
    );

    reply.code(201);
    return n;
  });

  fastify.get('/api/v1/projects', async (req, reply) => {
    const { state, manager, start_date, end_date, include_sub_orgs } = req.query as {
      state?: string; manager?: string; start_date?: string; end_date?: string;
      include_sub_orgs?: string;
    };
    const includeSubOrgs = (() => {
      const s = String(include_sub_orgs ?? '').toLowerCase();
      return s === '1' || s === 'true' || s === 'yes';
    })();

    // If a manager is provided, optionally expand to the whole sub-org via recursive CTE
    let managerIds: string[] | null = null;
    if (manager) {
      if (includeSubOrgs) {
        const r = await fastify.db.query(
          `WITH RECURSIVE org(sys_id) AS (
             SELECT sys_id FROM sys_user WHERE sys_id = $1
             UNION
             SELECT u.sys_id FROM sys_user u JOIN org o ON u.manager = o.sys_id
           )
           SELECT sys_id FROM org`,
          [manager]
        );
        managerIds = (r.rows as any[]).map(x => x.sys_id);
      } else {
        const r = await fastify.db.query(
          `SELECT sys_id FROM sys_user WHERE sys_id = $1 OR manager = $1`,
          [manager]
        );
        managerIds = (r.rows as any[]).map(x => x.sys_id);
      }
    }

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    if (state) {
      params.push(state);
      conditions.push(`p.state = $${params.length}`);
    }

    // Push managerIds as an explicit IN-list (JS arrays don't reliably bind to
    // Postgres array params in PGlite). We keep the placeholder list so we can
    // reuse the same scope both in the EXISTS check AND in the LEFT JOIN that
    // builds the aggregated assignments array.
    let managerInList = '';          // e.g. "$2,$3,$4" — used as `IN (${managerInList})`
    if (managerIds && managerIds.length > 0) {
      const placeholders = managerIds.map((_, i) => `$${params.length + i + 1}`).join(',');
      params.push(...managerIds);
      managerInList = placeholders;
    }

    // Date overlap filter: only include projects with at least one assignment
    // that overlaps the requested window. NULL date bounds are treated as open-ended.
    let dateOverlap = '';
    if (start_date && end_date) {
      params.push(start_date);
      const startParam = `$${params.length}`;
      params.push(end_date);
      const endParam = `$${params.length}`;
      dateOverlap = `
        (a_chk.start_date IS NULL OR a_chk.start_date <= ${endParam})
        AND (a_chk.end_date IS NULL OR a_chk.end_date >= ${startParam})
      `;
    }

    // Manager + date filter: either
    //   (a) the project has at least one overlapping assignment from that team, OR
    //   (b) the project has NO assignments at all (freshly added, ready for allocation)
    // This keeps newly-added projects visible while still scoping existing ones to the team/window.
    if (managerInList || dateOverlap) {
      const existsConditions: string[] = [`a_chk.project = p.sys_id`];
      if (managerInList) {
        existsConditions.push(`u_chk.sys_id IN (${managerInList})`);
      }
      if (dateOverlap) existsConditions.push(dateOverlap);

      conditions.push(`(
        EXISTS (
          SELECT 1 FROM sn_plng_att_core_resource_assignment a_chk
          JOIN sys_user u_chk ON u_chk.sys_id = a_chk.resource
          WHERE ${existsConditions.join(' AND ')}
        )
        OR NOT EXISTS (
          SELECT 1 FROM sn_plng_att_core_resource_assignment a_any
          WHERE a_any.project = p.sys_id
        )
      )`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // The aggregated assignments array is also filtered to the date window so
    // clients don't see rows outside the filter range.
    const assignmentDateFilter = (start_date && end_date)
      ? `AND (a.start_date IS NULL OR a.start_date <= '${end_date}')
         AND (a.end_date IS NULL OR a.end_date >= '${start_date}')`
      : '';

    // Also scope the aggregated assignments array to the chosen manager/sub-org,
    // so project cards only display people from that team.
    const assignmentManagerFilter = managerInList
      ? `AND a.resource IN (${managerInList})`
      : '';

    const query = `
      SELECT p.*,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'start_date', a.start_date, 'end_date', a.end_date,
          'resource_name', u.first_name || ' ' || u.last_name,
          'resource_title', u.title, 'resource_avatar', u.avatar_url
        ) ORDER BY u.last_name) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM pm_project p
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.project = p.sys_id
        ${assignmentDateFilter}
        ${assignmentManagerFilter}
      LEFT JOIN sys_user u ON u.sys_id = a.resource
      ${whereClause}
      GROUP BY p.sys_id ORDER BY p.short_description
    `;
    const result = await fastify.db.query(query, params);
    return result.rows.map((r: any) => ({ ...r, assignments: r.assignments || [] }));
  });

  fastify.post('/api/v1/projects', async (req, reply) => {
    const { short_description, description, state, start_date, end_date, color } = req.body as any;
    const id = randomUUID();
    const count = await fastify.db.query('SELECT COUNT(*) as cnt FROM pm_project');
    const num = `PRJ${String(Number((count.rows[0] as any).cnt) + 1001).padStart(7, '0')}`;
    await fastify.db.query(
      `INSERT INTO pm_project (sys_id, number, short_description, description, state, start_date, end_date, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, num, short_description, description || null, state || 'planning', start_date || null, end_date || null, color || null]
    );
    const result = await fastify.db.query('SELECT * FROM pm_project WHERE sys_id = $1', [id]);
    reply.code(201);
    return result.rows[0];
  });

  fastify.put('/api/v1/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { short_description, description, state, start_date, end_date, color } = req.body as any;
    await fastify.db.query(
      `UPDATE pm_project SET short_description=COALESCE($2,short_description), description=COALESCE($3,description),
       state=COALESCE($4,state), start_date=COALESCE($5,start_date), end_date=COALESCE($6,end_date),
       color=COALESCE($7,color), sys_updated_on=now() WHERE sys_id=$1`,
      [id, short_description, description, state, start_date, end_date, color]
    );
    const result = await fastify.db.query('SELECT * FROM pm_project WHERE sys_id = $1', [id]);
    return result.rows[0];
  });

  fastify.delete('/api/v1/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await fastify.db.query('DELETE FROM sn_plng_att_core_resource_assignment WHERE project = $1', [id]);
    await fastify.db.query('DELETE FROM pm_project WHERE sys_id = $1', [id]);
    reply.code(204);
  });
}
