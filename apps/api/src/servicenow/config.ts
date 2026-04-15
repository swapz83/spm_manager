import type { SnConfig } from './client.js';

/**
 * Build an SnConfig from environment variables.
 * Returns null if the required vars (SN_INSTANCE, SN_USER_TOKEN) are missing.
 *
 * SN_COOKIE is optional — paste the raw Cookie header value from your
 * browser's DevTools to replay your session (dev-only, ~1 hour lifespan).
 */
export function getSnConfigFromEnv(): SnConfig | null {
  const instance = process.env.SN_INSTANCE;
  const token = process.env.SN_USER_TOKEN;
  const cookie = process.env.SN_COOKIE;
  if (!instance || !token || !cookie) return null;

  return {
    instance,
    token,
    cookie,
  };
}
