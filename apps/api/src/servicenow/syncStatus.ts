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
}

let _status: SyncStatus = { state: 'idle', progress: 0, step: '' };

export function getSyncStatus(): SyncStatus {
  return { ..._status };
}

export function setSyncStatus(partial: Partial<SyncStatus>) {
  _status = { ..._status, ...partial };
}

export function resetSyncStatus() {
  _status = { state: 'idle', progress: 0, step: '' };
}
