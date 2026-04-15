import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { MAX_PROJECTS_PER_PERSON, MAX_ALLOCATION_PCT } from '@spm/shared';

/**
 * Check if a new assignment (with given dates) would cause over-allocation
 * during any month it overlaps with existing assignments.
 * Returns the peak monthly allocation INCLUDING the new one.
 */
async function peakAllocationWithNew(
  db: any,
  resource: string,
  newPct: number,
  newStart: string | null,
  newEnd: string | null,
  excludeSysId?: string,
): Promise<number> {
  // Fetch all existing assignments for this resource
  const excludeClause = excludeSysId ? ` AND sys_id != '${excludeSysId}'` : '';
  const existing = await db.query(
    `SELECT allocation_pct, start_date, end_date FROM sn_plng_att_core_resource_assignment WHERE resource = $1${excludeClause}`,
    [resource]
  );
  const assignments = [
    ...(existing.rows as any[]),
    { allocation_pct: newPct, start_date: newStart, end_date: newEnd },
  ];

  // Collect all unique month boundaries
  const months = new Set<string>();
  for (const a of assignments) {
    const s = a.start_date ? new Date(a.start_date) : new Date('2020-01-01');
    const e = a.end_date ? new Date(a.end_date) : new Date('2030-12-31');
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      months.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // For each month, sum allocations of assignments active in that month
  let peak = 0;
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    const monthStart = new Date(y, mo - 1, 1);
    const monthEnd = new Date(y, mo, 0); // last day of month

    let monthTotal = 0;
    for (const a of assignments) {
      const aStart = a.start_date ? new Date(a.start_date) : new Date('2020-01-01');
      const aEnd = a.end_date ? new Date(a.end_date) : new Date('2030-12-31');
      // Assignment overlaps this month?
      if (aStart <= monthEnd && aEnd >= monthStart) {
        monthTotal += a.allocation_pct;
      }
    }
    peak = Math.max(peak, monthTotal);
  }

  return peak;
}

export async function assignmentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/assignments', async (req) => {
    const { project, resource } = req.query as { project?: string; resource?: string };
    let query = `
      SELECT a.*, u.first_name || ' ' || u.last_name as resource_name,
        u.title as resource_title, u.avatar_url as resource_avatar,
        p.short_description as project_name, p.color as project_color
      FROM sn_plng_att_core_resource_assignment a
      JOIN sys_user u ON u.sys_id = a.resource
      JOIN pm_project p ON p.sys_id = a.project
    `;
    const conditions: string[] = [];
    const params: string[] = [];
    if (project) { conditions.push(`a.project = $${params.length + 1}`); params.push(project); }
    if (resource) { conditions.push(`a.resource = $${params.length + 1}`); params.push(resource); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY u.last_name';
    const result = await fastify.db.query(query, params);
    return result.rows;
  });

  fastify.post('/api/v1/assignments', async (req, reply) => {
    const { resource, project, allocation_pct, role, start_date, end_date } = req.body as any;

    // Validate max projects
    const projectCount = await fastify.db.query(
      'SELECT COUNT(*) as cnt FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [resource]
    );
    if (Number((projectCount.rows[0] as any).cnt) >= MAX_PROJECTS_PER_PERSON) {
      reply.code(400);
      return { error: `Person cannot be assigned to more than ${MAX_PROJECTS_PER_PERSON} projects` };
    }

    // Validate total allocation — date-aware: check peak monthly allocation
    const peak = await peakAllocationWithNew(
      fastify.db, resource, allocation_pct, start_date || null, end_date || null
    );
    if (peak > MAX_ALLOCATION_PCT) {
      reply.code(400);
      return { error: `Total allocation would reach ${peak}% in at least one month (max ${MAX_ALLOCATION_PCT}%)` };
    }

    const id = randomUUID();
    await fastify.db.query(
      `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, role, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, resource, project, allocation_pct, role || null, start_date || null, end_date || null]
    );
    reply.code(201);
    const result = await fastify.db.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as resource_name,
        u.title as resource_title, u.avatar_url as resource_avatar,
        p.short_description as project_name, p.color as project_color
      FROM sn_plng_att_core_resource_assignment a
      JOIN sys_user u ON u.sys_id = a.resource
      JOIN pm_project p ON p.sys_id = a.project
      WHERE a.sys_id = $1`, [id]
    );
    return result.rows[0];
  });

  fastify.post('/api/v1/assignments/bulk', async (req, reply) => {
    const { project, resources, start_date, end_date } = req.body as {
      project: string;
      resources: { resource: string; allocation_pct: number; role?: string }[];
      start_date?: string;
      end_date?: string;
    };
    const results: any[] = [];
    const errors: any[] = [];

    for (const r of resources) {
      // Validate max projects
      const projectCount = await fastify.db.query(
        'SELECT COUNT(*) as cnt FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [r.resource]
      );
      if (Number((projectCount.rows[0] as any).cnt) >= MAX_PROJECTS_PER_PERSON) {
        errors.push({ resource: r.resource, error: 'Max projects exceeded' });
        continue;
      }

      // Validate date-aware allocation
      const peak = await peakAllocationWithNew(
        fastify.db, r.resource, r.allocation_pct, start_date || null, end_date || null
      );
      if (peak > MAX_ALLOCATION_PCT) {
        errors.push({ resource: r.resource, error: `Allocation would reach ${peak}% in at least one month` });
        continue;
      }

      const id = randomUUID();
      await fastify.db.query(
        `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, role, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, r.resource, project, r.allocation_pct, r.role || null, start_date || null, end_date || null]
      );
      results.push({ sys_id: id, resource: r.resource, project, allocation_pct: r.allocation_pct });
    }

    reply.code(results.length > 0 ? 201 : 400);
    return { created: results, errors };
  });

  fastify.put('/api/v1/assignments/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { allocation_pct, resource_status, role, start_date, end_date } = req.body as any;

    if (allocation_pct !== undefined) {
      const current = await fastify.db.query(
        'SELECT resource, start_date, end_date FROM sn_plng_att_core_resource_assignment WHERE sys_id = $1', [id]
      );
      if (current.rows.length) {
        const row = current.rows[0] as any;
        const peak = await peakAllocationWithNew(
          fastify.db, row.resource, allocation_pct,
          start_date ?? row.start_date, end_date ?? row.end_date, id
        );
        if (peak > MAX_ALLOCATION_PCT) {
          return { error: `Total allocation would reach ${peak}% in at least one month` };
        }
      }
    }

    await fastify.db.query(
      `UPDATE sn_plng_att_core_resource_assignment SET
       allocation_pct=COALESCE($2,allocation_pct), resource_status=COALESCE($3,resource_status),
       role=COALESCE($4,role), start_date=COALESCE($5,start_date), end_date=COALESCE($6,end_date),
       sys_updated_on=now() WHERE sys_id=$1`,
      [id, allocation_pct, resource_status, role, start_date, end_date]
    );
    const result = await fastify.db.query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as resource_name,
        u.title as resource_title, u.avatar_url as resource_avatar,
        p.short_description as project_name, p.color as project_color
      FROM sn_plng_att_core_resource_assignment a
      JOIN sys_user u ON u.sys_id = a.resource
      JOIN pm_project p ON p.sys_id = a.project
      WHERE a.sys_id = $1`, [id]
    );
    return result.rows[0];
  });

  fastify.delete('/api/v1/assignments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await fastify.db.query('DELETE FROM sn_plng_att_core_resource_assignment WHERE sys_id = $1', [id]);
    reply.code(204);
  });
}
