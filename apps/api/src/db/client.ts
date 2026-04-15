import { PGlite } from '@electric-sql/pglite';
import fp from 'fastify-plugin';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { seed } from './seed.js';
import { ServiceNowClient } from '../servicenow/client.js';
import { getSnConfigFromEnv } from '../servicenow/config.js';
import { syncFromServiceNow } from '../servicenow/sync.js';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data/pgdata');

let db: PGlite | null = null;
let snConnected = false;
let snClient: ServiceNowClient | null = null;

export async function getDb(): Promise<PGlite> {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new PGlite(DATA_DIR);

    // Run DDL
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await db.exec(schema);

    // Try ServiceNow live sync first; fall back to mock seed
    const snConfig = getSnConfigFromEnv();
    const userEmail = process.env.SN_USER_EMAIL;

    if (snConfig && userEmail) {
      const sn = new ServiceNowClient(snConfig);

      console.log('[DB] ServiceNow credentials detected — testing connection...');
      const ok = await sn.testConnection();

      if (ok) {
        console.log('[DB] ServiceNow connection OK — syncing live data...');
        try {
          await syncFromServiceNow(db, sn, userEmail);
          console.log('[DB] Live data loaded from ServiceNow');
          snConnected = true;
          snClient = sn;
          return db;
        } catch (err: any) {
          console.error('[DB] ServiceNow sync failed, falling back to mock data:', err.message);
        }
      } else {
        console.warn('[DB] ServiceNow connection failed (token expired?) — falling back to mock data');
      }
    } else {
      console.log('[DB] No ServiceNow credentials in env — using mock seed data');
    }

    // Fallback: mock seed (only inserts if tables are empty)
    await seed(db);
  }
  return db;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: PGlite;
    snConnected: boolean;
    snClient: ServiceNowClient | null;
  }
}

export const dbPlugin = fp(async (fastify: FastifyInstance) => {
  const database = await getDb();
  fastify.decorate('db', database);
  fastify.decorate('snConnected', snConnected);
  fastify.decorate('snClient', snClient);
});
