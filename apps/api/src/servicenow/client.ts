/**
 * ServiceNow Table API client.
 *
 * Mirrors the fetch patterns used in spm_update.js:
 *   - Base URL: {SN_INSTANCE}/api/now/table/{table}
 *   - Auth: X-UserToken header with g_ck session token
 *   - Query: sysparm_query encoded query string
 *   - Fields: sysparm_fields comma-separated list
 *
 * Every request and response is logged so you can see exactly what
 * happens at the ServiceNow API layer.
 *
 * When OAuth 2.0 tokens are ready, swap X-UserToken for Bearer auth here.
 */

export interface SnConfig {
  instance: string;   // e.g. https://company.service-now.com
  token: string;      // g_ck session token
  cookie?: string;    // Raw Cookie header value from browser (dev-only)
}

export interface SnQueryOptions {
  table: string;
  query?: string;
  fields?: string[];
  limit?: number;
  displayValue?: 'true' | 'false' | 'all';
}

export interface SnWriteOptions {
  table: string;
  sysId?: string;       // for PATCH / DELETE — the record's sys_id
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, any>;
}

const TAG = '[SN API]';

function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + `… (${s.length} chars total)` : s;
}

export class ServiceNowClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: SnConfig) {
    this.baseUrl = config.instance.replace(/\/+$/, '');

    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-UserToken': config.token,
    };

    if (config.cookie) {
      this.headers['Cookie'] = config.cookie;
      // Log which cookie keys are present (values redacted)
      const keys = config.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean);
      console.log(`${TAG} Cookie header configured with keys: ${keys.join(', ')}`);
    }
  }

  // ── READ ──────────────────────────────────────────────────────────────

  /**
   * Query a ServiceNow table. Returns the `result` array from the response.
   * Throws on HTTP errors or if the response shape is unexpected.
   */
  async query<T = Record<string, any>>(opts: SnQueryOptions): Promise<T[]> {
    const params = new URLSearchParams();
    if (opts.query) params.set('sysparm_query', opts.query);
    if (opts.fields?.length) params.set('sysparm_fields', opts.fields.join(','));
    if (opts.limit) params.set('sysparm_limit', String(opts.limit));
    if (opts.displayValue) params.set('sysparm_display_value', opts.displayValue);

    const url = `${this.baseUrl}/api/now/table/${opts.table}?${params.toString()}`;
    const start = Date.now();

    console.log(`${TAG} → GET ${url}`);

    const resp = await fetch(url, { method: 'GET', headers: this.headers });
    const elapsed = Date.now() - start;
    const bodyText = await resp.text();

    console.log(`${TAG} ← ${resp.status} ${resp.statusText}  (${elapsed}ms)  table=${opts.table}  rows=${'-'}`);
    console.log(`${TAG}   response: ${truncate(bodyText)}`);

    if (!resp.ok) {
      throw new Error(
        `ServiceNow API error: ${resp.status} ${resp.statusText} — ${opts.table} — ${truncate(bodyText, 300)}`
      );
    }

    let json: any;
    try {
      json = JSON.parse(bodyText);
    } catch {
      throw new Error(`ServiceNow returned non-JSON for ${opts.table}: ${truncate(bodyText, 200)}`);
    }

    if (!json.result) {
      throw new Error(`Unexpected ServiceNow response shape for ${opts.table}: missing "result" key`);
    }

    const rows = json.result as T[];
    console.log(`${TAG}   parsed ${rows.length} row(s) from ${opts.table}`);
    return rows;
  }

  /**
   * Convenience: query and return the first result, or null.
   */
  async queryOne<T = Record<string, any>>(opts: SnQueryOptions): Promise<T | null> {
    const rows = await this.query<T>({ ...opts, limit: 1 });
    return rows[0] ?? null;
  }

  // ── WRITE ─────────────────────────────────────────────────────────────

  /**
   * POST or PATCH a ServiceNow table record.
   * Returns the full parsed JSON response (including `.result`).
   */
  async write(opts: SnWriteOptions): Promise<{ ok: boolean; status: number; statusText: string; data: any }> {
    const url = opts.sysId
      ? `${this.baseUrl}/api/now/table/${opts.table}/${opts.sysId}`
      : `${this.baseUrl}/api/now/table/${opts.table}`;

    const bodyJson = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const start = Date.now();

    console.log(`${TAG} → ${opts.method} ${url}`);
    if (bodyJson !== undefined) console.log(`${TAG}   request body: ${truncate(bodyJson)}`);

    const resp = await fetch(url, {
      method: opts.method,
      headers: this.headers,
      body: bodyJson,
    });

    const elapsed = Date.now() - start;
    const bodyText = await resp.text();

    console.log(`${TAG} ← ${resp.status} ${resp.statusText}  (${elapsed}ms)  ${opts.method} ${opts.table}`);
    console.log(`${TAG}   response: ${truncate(bodyText)}`);

    let data: any = null;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = { _raw: bodyText };
    }

    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data };
  }

  // ── CONNECTIVITY CHECK ────────────────────────────────────────────────

  /**
   * Quick connectivity / auth check — fetches a single sys_user row.
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`${TAG} Testing connection to ${this.baseUrl}...`);
      await this.query({ table: 'sys_user', limit: 1, fields: ['sys_id'] });
      console.log(`${TAG} Connection OK`);
      return true;
    } catch (err: any) {
      console.error(`${TAG} Connection FAILED: ${err.message}`);
      return false;
    }
  }
}
