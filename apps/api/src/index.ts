import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env from project root (two levels up from apps/api/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dbPlugin } from './db/client.js';
import { projectRoutes } from './routes/projects.js';
import { peopleRoutes } from './routes/people.js';
import { assignmentRoutes } from './routes/assignments.js';
import { publishRoutes } from './routes/publish.js';

const fastify = Fastify({ logger: true, pluginTimeout: 60000 });

await fastify.register(cors, { origin: true });
await fastify.register(dbPlugin);
await fastify.register(projectRoutes);
await fastify.register(peopleRoutes);
await fastify.register(assignmentRoutes);
await fastify.register(publishRoutes);

fastify.get('/api/v1/health', async () => ({
  status: 'ok',
  dataSource: fastify.snConnected ? 'servicenow' : 'mock',
}));

try {
  await fastify.listen({ port: 3001, host: '0.0.0.0' });
  console.log('API server running on http://localhost:3001');
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
