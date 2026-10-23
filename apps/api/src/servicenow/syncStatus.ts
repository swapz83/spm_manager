/**
 * Lightweight in-memory sync status tracker.
 *
 * The background sync in config.ts reports progress here;
 * the frontend polls GET /api/v1/sync/status to drive the progress bar.
 */

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'done' | 'error';
  /** 0–100 */
  progress: number;
  /** Human-readable label for the current step */
  step: string;
  /** Error message when state === 'error' */
  error?: string;
  /** ISO timestamp set when the sync reaches a terminal state (done / error) */
  completedAt?: string;
}

let _status: SyncStatus = { state: 'idle', progress: 0, step: '' };

export function getSyncStatus(): SyncStatus {
  return { ..._status };
}

export function setSyncStatus(partial: Partial<SyncStatus>) {
  _status = { ..._status, ...partial };
  // Stamp completion time whenever we transition into a terminal state,
  // unless the caller supplied one explicitly.
  if ((partial.state === 'done' || partial.state === 'error') && partial.completedAt === undefined) {
    _status.completedAt = new Date().toISOString();
  }
  // A fresh sync run clears any previous completion timestamp.
  if (partial.state === 'syncing' && partial.completedAt === undefined) {
    _status.completedAt = undefined;
  }
}

export function resetSyncStatus() {
  _status = { state: 'idle', progress: 0, step: '' };
}
