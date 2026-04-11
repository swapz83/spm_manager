import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { MAX_PROJECTS_PER_PERSON, MAX_ALLOCATION_PCT } from '@spm/shared';

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
    const { resource, project, allocation_pct, role } = req.body as any;

    // Validate max projects
    const projectCount = await fastify.db.query(
      'SELECT COUNT(*) as cnt FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [resource]
    );
    if (Number((projectCount.rows[0] as any).cnt) >= MAX_PROJECTS_PER_PERSON) {
      reply.code(400);
      return { error: `Person cannot be assigned to more than ${MAX_PROJECTS_PER_PERSON} projects` };
    }

    // Validate total allocation
    const totalAlloc = await fastify.db.query(
      'SELECT COALESCE(SUM(allocation_pct), 0)::int as total FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [resource]
    );
    if (Number((totalAlloc.rows[0] as any).total) + allocation_pct > MAX_ALLOCATION_PCT) {
      reply.code(400);
      return { error: `Total allocation would exceed ${MAX_ALLOCATION_PCT}%` };
    }

    // Check duplicate
    const dup = await fastify.db.query(
      'SELECT sys_id FROM sn_plng_att_core_resource_assignment WHERE resource = $1 AND project = $2', [resource, project]
    );
    if (dup.rows.length > 0) {
      reply.code(409);
      return { error: 'Person is already assigned to this project' };
    }

    const id = randomUUID();
    await fastify.db.query(
      `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, role)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, resource, project, allocation_pct, role || null]
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
    const { project, resources } = req.body as { project: string; resources: { resource: string; allocation_pct: number; role?: string }[] };
    const results: any[] = [];
    const errors: any[] = [];

    for (const r of resources) {
      // Validate
      const projectCount = await fastify.db.query(
        'SELECT COUNT(*) as cnt FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [r.resource]
      );
      if (Number((projectCount.rows[0] as any).cnt) >= MAX_PROJECTS_PER_PERSON) {
        errors.push({ resource: r.resource, error: 'Max projects exceeded' });
        continue;
      }
      const totalAlloc = await fastify.db.query(
        'SELECT COALESCE(SUM(allocation_pct), 0)::int as total FROM sn_plng_att_core_resource_assignment WHERE resource = $1', [r.resource]
      );
      if (Number((totalAlloc.rows[0] as any).total) + r.allocation_pct > MAX_ALLOCATION_PCT) {
        errors.push({ resource: r.resource, error: 'Allocation would exceed 100%' });
        continue;
      }
      const dup = await fastify.db.query(
        'SELECT sys_id FROM sn_plng_att_core_resource_assignment WHERE resource = $1 AND project = $2', [r.resource, project]
      );
      if (dup.rows.length > 0) {
        errors.push({ resource: r.resource, error: 'Already assigned' });
        continue;
      }

      const id = randomUUID();
      await fastify.db.query(
        `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, role) VALUES ($1,$2,$3,$4,$5)`,
        [id, r.resource, project, r.allocation_pct, r.role || null]
      );
      results.push({ sys_id: id, resource: r.resource, project, allocation_pct: r.allocation_pct });
    }

    reply.code(results.length > 0 ? 201 : 400);
    return { created: results, errors };
  });

  fastify.put('/api/v1/assignments/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { allocation_pct, resource_status, role } = req.body as any;

    if (allocation_pct !== undefined) {
      const current = await fastify.db.query(
        'SELECT resource, allocation_pct FROM sn_plng_att_core_resource_assignment WHERE sys_id = $1', [id]
      );
      if (current.rows.length) {
        const row = current.rows[0] as any;
        const totalAlloc = await fastify.db.query(
          'SELECT COALESCE(SUM(allocation_pct), 0)::int as total FROM sn_plng_att_core_resource_assignment WHERE resource = $1 AND sys_id != $2',
          [row.resource, id]
        );
        if (Number((totalAlloc.rows[0] as any).total) + allocation_pct > MAX_ALLOCATION_PCT) {
          return { error: 'Total allocation would exceed 100%' };
        }
      }
    }

    await fastify.db.query(
      `UPDATE sn_plng_att_core_resource_assignment SET
       allocation_pct=COALESCE($2,allocation_pct), resource_status=COALESCE($3,resource_status),
       role=COALESCE($4,role), sys_updated_on=now() WHERE sys_id=$1`,
      [id, allocation_pct, resource_status, role]
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
