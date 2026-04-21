import { PGlite } from '@electric-sql/pglite';
import fp from 'fastify-plugin';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { seed } from './seed.js';
import { ServiceNowClient } from '../servicenow/client.js';
import { getRuntimeConfig, isFullyConfigured } from '../servicenow/runtimeConfig.js';
import { syncFromServiceNow } from '../servicenow/sync.js';
import { setSyncStatus } from '../servicenow/syncStatus.js';
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
    // runtimeConfig is initialised from env vars at module load time
    const cfg = getRuntimeConfig();
    const userEmail = cfg.userEmail;

    if (isFullyConfigured() && userEmail) {
      const sn = new ServiceNowClient({
        instance: cfg.instance,
        token:    cfg.userToken,
        cookie:   cfg.cookie,
      });

      console.log('[DB] ServiceNow credentials detected — testing connection...');
      setSyncStatus({ state: 'syncing', progress: 0, step: 'Testing connection…' });
      const ok = await sn.testConnection();

      if (ok) {
        console.log('[DB] ServiceNow connection OK — clearing stale data before sync...');
        try {
          // Truncate SN-synced tables so deleted/changed records don't linger.
          // Mock seed data will re-populate if SN sync fails below.
          await db.exec(`
            TRUNCATE sn_plng_att_core_resource_assignment;
            TRUNCATE pm_project;
            TRUNCATE sys_user;
          `);
          console.log('[DB] Tables cleared — syncing live data...');
          await syncFromServiceNow(db, sn, userEmail, cfg.instance);
          console.log('[DB] Live data loaded from ServiceNow');
          snConnected = true;
          snClient = sn;
          return db;
        } catch (err: any) {
          console.error('[DB] ServiceNow sync failed, falling back to mock data:', err.message);
          setSyncStatus({ state: 'error', progress: 0, step: '', error: err.message });
        }
      } else {
        console.warn('[DB] ServiceNow connection failed (token expired?) — falling back to mock data');
        setSyncStatus({ state: 'idle', progress: 0, step: '' });
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
