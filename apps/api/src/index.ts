import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dbPlugin } from './db/client.js';
import { projectRoutes } from './routes/projects.js';
import { peopleRoutes } from './routes/people.js';
import { assignmentRoutes } from './routes/assignments.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(dbPlugin);
await fastify.register(projectRoutes);
await fastify.register(peopleRoutes);
await fastify.register(assignmentRoutes);

fastify.get('/api/v1/health', async () => ({ status: 'ok' }));

try {
  await fastify.listen({ port: 3001, host: '0.0.0.0' });
  console.log('API server running on http://localhost:3001');
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
