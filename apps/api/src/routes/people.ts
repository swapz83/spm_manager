import type { FastifyInstance } from 'fastify';

export async function peopleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/people', async () => {
    const result = await fastify.db.query(`
      SELECT u.*,
        COALESCE(SUM(a.allocation_pct), 0)::int as total_allocation,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'project_name', p.short_description, 'project_color', p.color
        ) ORDER BY a.allocation_pct DESC) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM sys_user u
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.resource = u.sys_id
      LEFT JOIN pm_project p ON p.sys_id = a.project
      WHERE u.active = true
      GROUP BY u.sys_id
      ORDER BY u.last_name, u.first_name
    `);
    return result.rows.map((r: any) => ({ ...r, assignments: r.assignments || [] }));
  });

  fastify.get('/api/v1/people/:id', async (req) => {
    const { id } = req.params as { id: string };
    const result = await fastify.db.query(`
      SELECT u.*,
        COALESCE(SUM(a.allocation_pct), 0)::int as total_allocation,
        json_agg(json_build_object(
          'sys_id', a.sys_id, 'resource', a.resource, 'project', a.project,
          'allocation_pct', a.allocation_pct, 'resource_status', a.resource_status, 'role', a.role,
          'project_name', p.short_description, 'project_color', p.color
        ) ORDER BY a.allocation_pct DESC) FILTER (WHERE a.sys_id IS NOT NULL) as assignments
      FROM sys_user u
      LEFT JOIN sn_plng_att_core_resource_assignment a ON a.resource = u.sys_id
      LEFT JOIN pm_project p ON p.sys_id = a.project
      WHERE u.sys_id = $1
      GROUP BY u.sys_id
    `, [id]);
    return result.rows[0] ? { ...result.rows[0] as any, assignments: (result.rows[0] as any).assignments || [] } : null;
  });
}
