import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getRuntimeConfig, setRuntimeConfig, isFullyConfigured, type SnRuntimeConfig } from '../servicenow/runtimeConfig.js';
import { ServiceNowClient } from '../servicenow/client.js';
import { syncFromServiceNow } from '../servicenow/sync.js';
import { getSyncStatus, setSyncStatus } from '../servicenow/syncStatus.js';

export const configRoutes = fp(async (fastify: FastifyInstance) => {

  /** GET /api/v1/sync/status — poll sync progress */
  fastify.get('/api/v1/sync/status', async () => getSyncStatus());

  /** GET /api/v1/config/servicenow — return current config status + masked credentials */
  fastify.get('/api/v1/config/servicenow', async () => {
    const cfg = getRuntimeConfig();
    return {
      configured: isFullyConfigured(),
      connected: fastify.snConnected,
      instance:   cfg.instance  || null,
      userEmail:  cfg.userEmail || null,
      // Never return the real token/cookie — return a boolean presence flag only
      hasUserToken: Boolean(cfg.userToken),
      hasCookie:    Boolean(cfg.cookie),
    };
  });

  /** POST /api/v1/config/servicenow — update credentials, test, then resync */
  fastify.post<{ Body: Partial<SnRuntimeConfig> }>('/api/v1/config/servicenow', async (request, reply) => {
    const { instance, userEmail, userToken, cookie } = request.body ?? {};

    // Apply only the fields that were provided and non-empty
    const update: Partial<SnRuntimeConfig> = {};
    if (instance)   update.instance   = instance;
    if (userEmail)  update.userEmail  = userEmail;
    if (userToken)  update.userToken  = userToken;
    if (cookie)     update.cookie     = cookie;

    if (Object.keys(update).length === 0) {
      return reply.status(400).send({ error: 'No fields provided' });
    }

    setRuntimeConfig(update);

    const cfg = getRuntimeConfig();

    if (!isFullyConfigured()) {
      // Config is partially set; return updated status without connecting
      return {
        configured: false,
        connected: false,
        instance:  cfg.instance  || null,
        userEmail: cfg.userEmail || null,
        hasUserToken: Boolean(cfg.userToken),
        hasCookie:    Boolean(cfg.cookie),
        message: 'Configuration saved. Fill in all fields to enable ServiceNow sync.',
      };
    }

    // ── Test connection ────────────────────────────────────────────────────
    const sn = new ServiceNowClient({
      instance:  cfg.instance,
      token:     cfg.userToken,
      cookie:    cfg.cookie,
    });

    const ok = await sn.testConnection();
    fastify.snConnected = ok;

    if (!ok) {
      fastify.snClient = null;
      return reply.status(200).send({
        configured: true,
        connected: false,
        instance:  cfg.instance,
        userEmail: cfg.userEmail,
        hasUserToken: true,
        hasCookie: true,
        message: 'Credentials saved but ServiceNow connection test failed. Check token / cookie.',
      });
    }

    fastify.snClient = sn;

    // ── Clear all previous data synchronously before responding ──────────
    // This ensures the frontend never sees stale/mock data after a config change.
    console.log('[Config] Credentials changed & verified — clearing all previous data...');
    await fastify.db.exec(`
      TRUNCATE sn_plng_att_core_resource_assignment;
      TRUNCATE pm_project;
      TRUNCATE sys_user;
    `);
    console.log('[Config] All tables cleared (including staged assignments).');

    // ── Background resync (fire-and-forget so the HTTP response returns immediately) ─
    setSyncStatus({ state: 'syncing', progress: 0, step: 'Starting sync…' });
    (async () => {
      try {
        console.log('[Config] Starting live resync...');
        await syncFromServiceNow(fastify.db, sn, cfg.userEmail, cfg.instance);
        console.log('[Config] Background resync complete');
      } catch (err: any) {
        console.error('[Config] Background resync failed:', err.message);
        setSyncStatus({ state: 'error', progress: 0, step: '', error: err.message });
      }
    })();

    return {
      configured: true,
      connected: true,
      instance:  cfg.instance,
      userEmail: cfg.userEmail,
      hasUserToken: true,
      hasCookie: true,
      message: 'Connected. Previous data cleared — ServiceNow sync started in background.',
    };
  });
});
