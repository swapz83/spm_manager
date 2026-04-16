import type { FastifyInstance } from 'fastify';
import { ServiceNowClient } from '../servicenow/client.js';
import { getSnConfigFromEnv } from '../servicenow/config.js';

/**
 * Build the `breakdowns` payload expected by the SN unassignResources API.
 *
 * Produces a JSON string mapping per-month keys to effort hours, e.g.:
 *   {
 *     "2026-04-01#planned": 88,    // 22 workdays × 8h × 0.5 FTE
 *     "2026-04-01#actuals": 0,
 *     "2026-05-01#planned": 84,
 *     "2026-05-01#actuals": 0
 *   }
 *
 * For effortType="fte": planned_hours = workdays_in_month × 8 × (allocation_pct / 100).
 * Actuals are always 0 for an unassign (we are zeroing the forward plan).
 */
function buildUnassignBreakdowns(
  startDate: string,
  endDate: string,
  allocationPct: number,
): string {
  const out: Record<string, number> = {};
  if (!startDate || !endDate) return JSON.stringify(out);

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return JSON.stringify(out);
  }

  const fteFraction = allocationPct / 100;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const finalMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= finalMonth) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth(); // 0-11
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    let workdays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(Date.UTC(year, month, d));
      if (day < start || day > end) continue;
      const dow = day.getUTCDay(); // 0=Sun, 6=Sat
      if (dow !== 0 && dow !== 6) workdays++;
    }

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    out[`${monthKey}#planned`] = workdays * 8 * fteFraction;
    out[`${monthKey}#actuals`] = 0;

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return JSON.stringify(out);
}

/**
 * Publish route: syncs allocation changes to ServiceNow SPM.
 *
 * All ServiceNow API calls go through ServiceNowClient, which logs
 * every request URL, method, request body, response status, and
 * response body — so you get full visibility in the API console.
 *
 * The changeset format matches what spm_update.js does:
 * 1. End existing overlapping assignments (set end_date to day before start)
 * 2. Create new assignments with effort type FTE
 * 3. Force-approve after business rules run
 */
export async function publishRoutes(fastify: FastifyInstance) {

  fastify.post('/api/v1/publish', async (req, reply) => {
    const { changes, startDate, endDate, endEarly, unassign } = req.body as {
      changes: {
        resource_id: string;
        resource_email: string;
        resource_name: string;
        projects: { project_id: string; project_number: string; project_name: string; allocation_pct: number }[];
      }[];
      startDate: string;
      endDate: string;
      endEarly?: {
        original_sys_id: string; resource_id: string; resource_name: string;
        project_id: string; project_name: string; new_end_date: string;
      }[];
      unassign?: {
        original_sys_id: string; resource_id: string; resource_name: string;
        project_id: string; project_name: string;
      }[];
    };

    const snConfig = getSnConfigFromEnv();

    if (!snConfig) {
      reply.code(500);
      return {
        error: 'ServiceNow credentials not configured. Set SN_INSTANCE and SN_USER_TOKEN in .env',
        details: 'SN_INSTANCE should be your instance URL (e.g., https://mycompany.service-now.com), SN_USER_TOKEN is the g_ck session token.'
      };
    }

    const sn = new ServiceNowClient(snConfig);
    const results: any[] = [];
    const errors: any[] = [];

    for (const change of changes) {
      const userEmail = change.resource_email;
      const userName = change.resource_name;

      // ── 1. Look up user in ServiceNow by email ──────────────────────
      let snUserId: string;
      try {
        const user = await sn.queryOne({
          table: 'sys_user',
          query: `email=${userEmail}`,
          fields: ['sys_id', 'name'],
        });
        if (!user) {
          errors.push({ user: userName, error: `User not found in ServiceNow: ${userEmail}` });
          continue;
        }
        snUserId = user.sys_id;
      } catch (e: any) {
        errors.push({ user: userName, error: `Failed to look up user: ${e.message}` });
        continue;
      }

      // ── 2. End existing overlapping assignments ─────────────────────
      const endPrevious = new Date(startDate);
      endPrevious.setDate(endPrevious.getDate() - 1);
      const endPreviousStr = endPrevious.toISOString().split('T')[0];

      // For "end early" changes, we need to end the existing assignment one day before the new end date
      try {
        const activeAssignments = await sn.query({
          table: 'sn_plng_att_core_resource_assignment',
          query: `user_resource=${snUserId}^start_date<${startDate}^end_date>=${startDate}`,
          fields: ['sys_id', 'task.number', 'end_date'],
        });

        for (const assignment of activeAssignments) {
          // End the assignment
          const endResp = await sn.write({
            table: 'sn_plng_att_core_resource_assignment',
            sysId: assignment.sys_id,
            method: 'PATCH',
            body: { end_date: endPreviousStr, resource_status: 'approved' },
          });

          if (!endResp.ok) {
            errors.push({
              user: userName,
              project: assignment['task.number'],
              error: `Failed to end assignment ${assignment.sys_id}: ${endResp.status} ${endResp.statusText}`,
            });
            continue;
          }

          // Wait for business rules, then re-approve
          await new Promise(resolve => setTimeout(resolve, 500));

          await sn.write({
            table: 'sn_plng_att_core_resource_assignment',
            sysId: assignment.sys_id,
            method: 'PATCH',
            body: { resource_status: 'approved' },
          });
        }
      } catch (e: any) {
        errors.push({ user: userName, error: `Failed to end existing assignments: ${e.message}` });
        // Continue anyway — try to create new ones
      }

      // ── 3. Create new assignments ───────────────────────────────────
      const projectCount = change.projects.length;
      if (projectCount === 0) continue;

      for (const proj of change.projects) {
        // Look up project in ServiceNow
        let snProjectId: string;
        try {
          const project = await sn.queryOne({
            table: 'pm_project',
            query: `number=${proj.project_number}`,
            fields: ['sys_id'],
          });
          if (!project) {
            errors.push({ user: userName, project: proj.project_number, error: 'Project not found in ServiceNow' });
            continue;
          }
          snProjectId = project.sys_id;
        } catch (e: any) {
          errors.push({ user: userName, project: proj.project_number, error: `Failed to look up project: ${e.message}` });
          continue;
        }

        // Create the assignment
        const effort = proj.allocation_pct / 100; // Convert percentage to FTE fraction
        const createResp = await sn.write({
          table: 'sn_plng_att_core_resource_assignment',
          method: 'POST',
          body: {
            task: snProjectId,
            user_resource: snUserId,
            assignment_type: 'user',
            effort_type: 'fte',
            effort: effort,
            start_date: startDate,
            end_date: endDate,
            resource_status: 'approved',
          },
        });

        if (createResp.ok) {
          results.push({
            user: userName,
            project: proj.project_number,
            project_name: proj.project_name,
            allocation_pct: proj.allocation_pct,
            sn_plan_id: createResp.data?.result?.number || createResp.data?.result?.sys_id,
            status: 'success',
          });
        } else {
          errors.push({
            user: userName,
            project: proj.project_number,
            error: createResp.data?.error?.message || `${createResp.status} ${createResp.statusText}`,
          });
        }
      }
    }

    // ── Process explicit unassigns via SN scripted API ──────────────────
    // Uses /api/sn_rm_ws/resource_management_workspace/unassignResources which
    // zeros out the forward-looking plan (the same call the SN UI issues).
    for (const u of unassign || []) {
      try {
        // Fetch original assignment's date range + allocation so we can
        // compute monthly breakdowns. Prefer local DB (fast); fall back to SN.
        let asmtStart: string | null = null;
        let asmtEnd: string | null = null;
        let allocationPct = 0;
        try {
          const rows = await fastify.db.query(
            'SELECT start_date, end_date, allocation_pct FROM sn_plng_att_core_resource_assignment WHERE sys_id = $1',
            [u.original_sys_id]
          );
          const r: any = rows.rows[0];
          if (r) {
            asmtStart = r.start_date ? String(r.start_date).split('T')[0] : null;
            asmtEnd = r.end_date ? String(r.end_date).split('T')[0] : null;
            allocationPct = Number(r.allocation_pct) || 0;
          }
        } catch { /* fall through */ }

        if (!asmtStart || !asmtEnd || allocationPct <= 0) {
          const snRow = await sn.queryOne<{ start_date: string; end_date: string; effort: string }>({
            table: 'sn_plng_att_core_resource_assignment',
            query: `sys_id=${u.original_sys_id}`,
            fields: ['start_date', 'end_date', 'effort'],
          });
          if (snRow) {
            asmtStart = asmtStart || snRow.start_date;
            asmtEnd = asmtEnd || snRow.end_date;
            if (allocationPct <= 0) allocationPct = (Number(snRow.effort) || 0) * 100;
          }
        }

        if (!asmtStart || !asmtEnd || allocationPct <= 0) {
          errors.push({
            user: u.resource_name,
            project: u.project_name,
            error: `Could not resolve assignment dates/allocation for unassign of ${u.original_sys_id}`,
          });
          continue;
        }

        const breakdowns = buildUnassignBreakdowns(asmtStart, asmtEnd, allocationPct);

        const resp = await sn.callApi({
          path: '/api/sn_rm_ws/resource_management_workspace/unassignResources',
          method: 'POST',
          body: {
            asmtId: u.original_sys_id,
            breakdowns,
            timeSpan: 'month',
            effortType: 'fte',
          },
        });

        if (!resp.ok) {
          errors.push({
            user: u.resource_name,
            project: u.project_name,
            error: `unassignResources failed for ${u.original_sys_id}: ${resp.status} ${resp.statusText}`,
          });
          continue;
        }

        // Mirror to local DB
        try {
          await fastify.db.query(
            'DELETE FROM sn_plng_att_core_resource_assignment WHERE sys_id = $1',
            [u.original_sys_id]
          );
        } catch { /* best-effort */ }

        results.push({
          user: u.resource_name,
          project: u.project_name,
          allocation_pct: 0,
          status: 'unassigned',
        });
      } catch (e: any) {
        errors.push({ user: u.resource_name, project: u.project_name, error: `Unassign failed: ${e.message}` });
      }
    }

    // ── Also save to local DB ───────────────────────────────────────────
    for (const change of changes) {
      for (const proj of change.projects) {
        try {
          const existing = await fastify.db.query(
            'SELECT sys_id FROM sn_plng_att_core_resource_assignment WHERE resource = $1 AND project = $2',
            [change.resource_id, proj.project_id]
          );
          if (existing.rows.length > 0) {
            await fastify.db.query(
              `UPDATE sn_plng_att_core_resource_assignment SET allocation_pct = $1, resource_status = 'approved', sys_updated_on = now() WHERE resource = $2 AND project = $3`,
              [proj.allocation_pct, change.resource_id, proj.project_id]
            );
          } else {
            const id = crypto.randomUUID();
            await fastify.db.query(
              `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, resource_status, start_date, end_date)
               VALUES ($1, $2, $3, $4, 'approved', $5, $6)`,
              [id, change.resource_id, proj.project_id, proj.allocation_pct, startDate, endDate]
            );
          }
        } catch { /* local DB save is best-effort */ }
      }
    }

    return {
      success: results.length > 0,
      published: results,
      errors,
      summary: `${results.length} assignments published, ${errors.length} errors`,
    };
  });

  // Dry-run endpoint for review (validates without publishing)
  fastify.post('/api/v1/publish/preview', async (req) => {
    const { changes, startDate, endDate } = req.body as any;

    const warnings: string[] = [];

    if (!getSnConfigFromEnv()) {
      warnings.push('ServiceNow credentials not configured - publish will fail');
    }

    return {
      changes,
      startDate,
      endDate,
      warnings,
      canPublish: warnings.length === 0,
    };
  });
}
