/**
 * In-memory ServiceNow runtime configuration.
 *
 * Initialized from environment variables at startup (keeps existing behaviour),
 * but can be overridden at runtime via the /api/v1/config/servicenow endpoint
 * without redeploying the app.
 */

export interface SnRuntimeConfig {
  instance: string;    // e.g. "https://mycompany.service-now.com"
  userEmail: string;   // e.g. "you@company.com"
  userToken: string;   // X-UserToken value
  cookie: string;      // Raw Cookie header value
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _config: SnRuntimeConfig = {
  instance:  process.env.SN_INSTANCE   ?? '',
  userEmail: process.env.SN_USER_EMAIL ?? '',
  userToken: process.env.SN_USER_TOKEN ?? '',
  cookie:    process.env.SN_COOKIE     ?? '',
};

/** Return the current runtime config (possibly partially empty). */
export function getRuntimeConfig(): SnRuntimeConfig {
  return { ..._config };
}

/**
 * Merge partial values into the runtime config.
 * Only non-undefined, non-empty-string fields are updated so you can
 * omit fields you don't want to change.
 */
export function setRuntimeConfig(partial: Partial<SnRuntimeConfig>): void {
  _config = { ..._config, ...partial };
}

/** True when all required fields are present. */
export function isFullyConfigured(): boolean {
  return Boolean(_config.instance && _config.userEmail && _config.userToken && _config.cookie);
}
