import { PGlite } from '@electric-sql/pglite';
import fp from 'fastify-plugin';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { seed } from './seed.js';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data/pgdata');

let db: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new PGlite(DATA_DIR);
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await db.exec(schema);
    await seed(db);
  }
  return db;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: PGlite;
  }
}

export const dbPlugin = fp(async (fastify: FastifyInstance) => {
  const db = await getDb();
  fastify.decorate('db', db);
});
