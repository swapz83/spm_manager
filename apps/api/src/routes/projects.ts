import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/projects', async (req, reply) => {
    const { state } = req.query as { state?: string };
    let query = `
      SELECT p.*,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'resource_name', u.first_name || ' ' || u.last_name,
          'resource_title', u.title, 'resource_avatar', u.avatar_url
        ) ORDER BY u.last_name) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM pm_project p
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.project = p.sys_id
      LEFT JOIN sys_user u ON u.sys_id = a.resource
    `;
    const params: string[] = [];
    if (state) {
      query += ' WHERE p.state = $1';
      params.push(state);
    }
    query += ' GROUP BY p.sys_id ORDER BY p.short_description';
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
