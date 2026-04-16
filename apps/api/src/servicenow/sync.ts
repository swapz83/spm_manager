/**
 * ServiceNow → PGlite sync.
 *
 * Fetches real data from ServiceNow SPM tables and populates the local
 * PGlite database.  The approach mirrors what spm_update.js does in the
 * browser console, but reads instead of writes:
 *
 *  1. Find my user record (by SN_USER_EMAIL)
 *  2. Find all direct reports  (sys_user where manager = me)
 *  3. Find their resource assignments (sn_plng_att_core_resource_assignment)
 *  4. Find the referenced projects  (pm_project)
 *
 * Field-name mapping (ServiceNow → local schema):
 *  - assignment.user_resource  → resource  (sys_id of the person)
 *  - assignment.task           → project   (sys_id of the pm_project)
 *  - assignment.effort (FTE 0–1) → allocation_pct (1–100, ×100)
 */

import type { PGlite } from '@electric-sql/pglite';
import { ServiceNowClient } from './client.js';

// ── ServiceNow reference field helper ──────────────────────────────────
// SN returns reference fields as { link, value } objects (not plain strings)
// when sysparm_display_value is not set. This extracts the sys_id.

type SnRef = string | { link: string; value: string } | null | undefined;

function ref(field: SnRef): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.value || '';
}

// ── ServiceNow record shapes (only the fields we ask for) ─────────────

interface SnUser {
  sys_id: string;
  user_name: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  department: SnRef;        // reference → cmn_department
  manager: SnRef;           // reference → sys_user
  photo: string;            // relative URL or empty
  active: string;           // "true" / "false"
}

interface SnProject {
  sys_id: string;
  number: string;
  short_description: string;
  description: string;
  state: string;            // numeric when raw; display value when we ask for it
  start_date: string;
  end_date: string;
  project_manager: SnRef;   // reference → sys_user
}

interface SnAssignment {
  sys_id: string;
  user_resource: SnRef;     // reference → sys_user
  task: SnRef;              // reference → pm_project
  effort: string;           // FTE fraction, e.g. "0.5"
  effort_type: string;
  resource_status: string;
  start_date: string;
  end_date: string;
  // Dot-walked fields come back with dot notation in the key
  'task.number'?: string;
  'task.short_description'?: string;
}

// ── Palette for project color chips (we assign based on hash) ──────────

// Warm palette: coral, peach, mustard, terracotta, copper, pumpkin,
// amber, vivid orange, rust, brick.
export const PROJECT_COLORS = [
  '#E76F51', '#F4A261', '#E9C46A', '#D4572A', '#BC6C25',
  '#F48C06', '#FAA307', '#E85D04', '#C13C2E', '#8B2E19',
];
export function pickColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return PROJECT_COLORS[Math.abs(h) % PROJECT_COLORS.length];
}

// ── Main sync function ─────────────────────────────────────────────────

// ── Traced db.query wrapper ────────────────────────────────────────────

const DB_TAG = '[PGlite]';
let querySeq = 0;

async function dbExec(db: PGlite, sql: string, params: any[] = [], label?: string) {
  const seq = ++querySeq;
  const shortSql = sql.replace(/\s+/g, ' ').trim();
  console.log(`${DB_TAG} #${seq} ${label ?? ''}  SQL: ${shortSql}`);
  console.log(`${DB_TAG} #${seq}  params: ${JSON.stringify(params)}`);
  try {
    const result = await db.query(sql, params);
    const rowCount = result?.rows?.length ?? 0;
    console.log(`${DB_TAG} #${seq}  OK — ${rowCount} row(s) returned`);
    return result;
  } catch (err: any) {
    console.error(`${DB_TAG} #${seq}  FAILED — ${err.message}`);
    throw err;
  }
}

// ── Main sync function ─────────────────────────────────────────────────

export async function syncFromServiceNow(db: PGlite, sn: ServiceNowClient, userEmail: string): Promise<void> {
  querySeq = 0; // reset sequence for each sync run

  // ---- 1. Find myself ------------------------------------------------
  console.log(`[SN Sync] Looking up user by email: ${userEmail}`);

  const me = await sn.queryOne<SnUser>({
    table: 'sys_user',
    query: `email=${userEmail}`,
    fields: ['sys_id', 'user_name', 'first_name', 'last_name', 'email', 'title', 'department', 'manager', 'photo', 'active'],
  });

  if (!me) {
    throw new Error(`[SN Sync] Could not find a sys_user with email=${userEmail}`);
  }
  console.log(`[SN Sync] Found myself: ${me.first_name} ${me.last_name} (${me.sys_id})`);

  // ---- 2. Find my org (BFS up to 4 levels deep) ----------------------
  console.log('[SN Sync] Fetching org hierarchy (up to 4 levels)...');

  const MAX_DEPTH = 4;
  const allReports: SnUser[] = [];
  const seen = new Set<string>([me.sys_id]);
  let frontier: string[] = [me.sys_id];

  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const nextLevel: SnUser[] = [];

    // Batch the IN clause to stay under SN's URL length limit (~40 ids per call)
    for (let i = 0; i < frontier.length; i += 40) {
      const batch = frontier.slice(i, i + 40);
      const rows = await sn.query<SnUser>({
        table: 'sys_user',
        query: `managerIN${batch.join(',')}^active=true`,
        fields: ['sys_id', 'user_name', 'first_name', 'last_name', 'email',
                 'title', 'department', 'manager', 'photo', 'active'],
        limit: 1000,
      });
      for (const u of rows) {
        if (!seen.has(u.sys_id)) {
          seen.add(u.sys_id);
          nextLevel.push(u);
        }
      }
    }

    console.log(`[SN Sync] Level ${depth}: ${nextLevel.length} reports`);
    allReports.push(...nextLevel);
    frontier = nextLevel.map(u => u.sys_id);
  }

  // All people we care about: me (as manager) + all reports across levels
  const allUsers = [me, ...allReports];
  const userSysIds = allReports.map(u => u.sys_id);
  console.log(`[SN Sync] Total org size: ${userSysIds.length} people`);

  if (userSysIds.length === 0) {
    console.warn('[SN Sync] No direct reports found — loading manager record only');
  }

  // ---- 3. Find assignments for all direct reports --------------------
  console.log('[SN Sync] Fetching resource assignments...');

  // ServiceNow encoded query: user_resource IN list
  // The IN operator uses the caret-separated syntax: user_resourceINid1,id2,id3
  let assignments: SnAssignment[] = [];
  if (userSysIds.length > 0) {
    // SN has a URL length limit, so batch into groups of 40
    const batches: string[][] = [];
    for (let i = 0; i < userSysIds.length; i += 40) {
      batches.push(userSysIds.slice(i, i + 40));
    }

    for (const batch of batches) {
      const batchAssignments = await sn.query<SnAssignment>({
        table: 'sn_plng_att_core_resource_assignment',
        query: `user_resourceIN${batch.join(',')}`,
        fields: [
          'sys_id', 'user_resource', 'task', 'effort', 'effort_type',
          'resource_status', 'start_date', 'end_date',
          'task.number', 'task.short_description',
        ],
        limit: 500,
      });
      assignments.push(...batchAssignments);
    }
  }
  console.log(`[SN Sync] Found ${assignments.length} assignments`);

  // ---- 4. Collect unique project sys_ids and fetch project details ----
  // a.task is a reference field (object with .value = sys_id); extract with ref()
  const projectSysIds = [...new Set(assignments.map(a => ref(a.task)).filter(Boolean))];
  let projects: SnProject[] = [];

  if (projectSysIds.length > 0) {
    console.log(`[SN Sync] Fetching ${projectSysIds.length} referenced projects by sys_id...`);

    // Batch into groups of 40 to avoid URL length limits
    const batches: string[][] = [];
    for (let i = 0; i < projectSysIds.length; i += 40) {
      batches.push(projectSysIds.slice(i, i + 40));
    }

    for (const batch of batches) {
      const batchProjects = await sn.query<SnProject>({
        table: 'pm_project',
        query: `sys_idIN${batch.join(',')}`,
        fields: [
          'sys_id', 'number', 'short_description', 'description',
          'state', 'start_date', 'end_date', 'project_manager',
        ],
        limit: 200,
      });
      projects.push(...batchProjects);
    }

    console.log(`[SN Sync] Fetched ${projects.length} projects`);
  }

  // ---- 5. Write everything into PGlite --------------------------------
  console.log('[SN Sync] Populating local database...');

  // -- Users --
  for (const u of allUsers) {
    const avatarUrl = u.photo
      ? `${process.env.SN_INSTANCE}/${u.photo}`.replace(/([^:])\/\//g, '$1/')
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(u.first_name + ' ' + u.last_name)}&background=random&size=128`;

    await dbExec(db,
      `INSERT INTO sys_user (sys_id, user_name, first_name, last_name, email, title, department, manager, avatar_url, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (sys_id) DO UPDATE SET
         user_name=EXCLUDED.user_name, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         email=EXCLUDED.email, title=EXCLUDED.title, department=EXCLUDED.department,
         manager=EXCLUDED.manager, avatar_url=EXCLUDED.avatar_url, active=EXCLUDED.active,
         sys_updated_on=now()`,
      [
        u.sys_id,
        u.user_name || u.email.split('@')[0],
        u.first_name || '',
        u.last_name || '',
        u.email || '',
        u.title || null,
        ref(u.department) || null,
        ref(u.manager) || null,
        avatarUrl,
        u.active !== 'false',
      ],
      `UPSERT sys_user: ${u.first_name} ${u.last_name} (${u.sys_id})`
    );
  }
  console.log('[SN Sync] Populating Users DONE');

  // -- Projects --
  for (const p of projects) {
    // Map SN state values to our simplified states
    const stateMap: Record<string, string> = {
      '-5': 'planning', 'pending': 'planning',
      '1': 'active', 'open': 'active', 'work_in_progress': 'active', 'work in progress': 'active',
      '3': 'closed', 'closed': 'closed', 'complete': 'closed', 'cancelled': 'closed',
    };
    const state = stateMap[p.state?.toLowerCase()] || (p.state ? 'active' : 'planning');

    await dbExec(db,
      `INSERT INTO pm_project (sys_id, number, short_description, description, state, start_date, end_date, project_manager, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (sys_id) DO UPDATE SET
         number=EXCLUDED.number, short_description=EXCLUDED.short_description, description=EXCLUDED.description,
         state=EXCLUDED.state, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
         project_manager=EXCLUDED.project_manager, color=EXCLUDED.color,
         sys_updated_on=now()`,
      [
        p.sys_id,
        p.number || `PRJ-${p.sys_id.slice(0, 8)}`,
        p.short_description || '(untitled)',
        p.description || null,
        state,
        p.start_date || null,
        p.end_date || null,
        ref(p.project_manager) || null,
        pickColor(p.number || p.sys_id),
      ],
      `UPSERT pm_project: ${p.number} "${p.short_description}" (${p.sys_id})`
    );
  }
  console.log('[SN Sync] Populating Projects DONE');


  // Also ensure there's a unique constraint-safe number on pm_project
  // (ServiceNow guarantees uniqueness on number, but just in case)

  // -- Assignments --
  // SN stores effort as FTE fraction (0.0–1.0); our schema uses allocation_pct (1–100).
  // Some SN instances use whole numbers (50 meaning 50%) if effort_type is "percentage".
  const fetchedProjectIds = new Set(projects.map(p => p.sys_id));
  for (const a of assignments) {
    // Skip assignments referencing projects we didn't fetch (orphans)
    const taskId = ref(a.task);
    const resourceId = ref(a.user_resource);
    if (!taskId || !resourceId) {
      console.log(`[SN Sync] Skipping assignment ${a.sys_id} — missing task or user_resource`);
      continue;
    }
    if (!fetchedProjectIds.has(taskId)) {
      console.log(`[SN Sync] Skipping assignment ${a.sys_id} — project ${taskId} not found in fetched projects`);
      continue;
    }

    let pct: number;
    const rawEffort = parseFloat(a.effort || '0');
    if (a.effort_type === 'fte' || rawEffort <= 1.0) {
      // FTE fraction → percentage:  0.5 → 50
      pct = Math.round(rawEffort * 100);
    } else {
      // Already a percentage value
      pct = Math.round(rawEffort);
    }
    // Clamp to 1–100
    pct = Math.max(1, Math.min(100, pct || 1));

    // Map SN resource_status to our simplified values
    const statusMap: Record<string, string> = {
      'approved': 'approved',
      'pending': 'requested',
      'requested': 'requested',
      'rejected': 'rejected',
    };
    const status = statusMap[a.resource_status?.toLowerCase()] || 'requested';

    try {
      await dbExec(db,
        `INSERT INTO sn_plng_att_core_resource_assignment
           (sys_id, resource, project, allocation_pct, resource_status, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (sys_id) DO UPDATE SET
           resource=EXCLUDED.resource, project=EXCLUDED.project,
           allocation_pct=EXCLUDED.allocation_pct, resource_status=EXCLUDED.resource_status,
           start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
           sys_updated_on=now()`,
        [
          a.sys_id,
          resourceId,
          taskId,
          pct,
          status,
          a.start_date || null,
          a.end_date || null,
        ],
        `UPSERT assignment: user=${resourceId} → project=${taskId} (${pct}%, ${status})`
      );
    } catch (err: any) {
      console.error(`[SN Sync] Failed to upsert assignment ${a.sys_id}: ${err.message}`);
    }
  }
  console.log('[SN Sync] Populating Assignments DONE');

  console.log(`[SN Sync] Done — ${allUsers.length} users, ${projects.length} projects, ${assignments.length} assignments`);
}
