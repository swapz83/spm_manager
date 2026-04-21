'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SyncBar() {
  const queryClient = useQueryClient();
  const prevState = useRef<string>('idle');

  const { data } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.sync.status(),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === 'syncing') return 1000;  // poll every 1s while syncing
      return false;                           // stop polling when idle/done/error
    },
  });

  // When sync transitions to 'done', invalidate all data caches so views refresh
  useEffect(() => {
    if (!data) return;
    if (prevState.current === 'syncing' && data.state === 'done') {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['managers'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    }
    prevState.current = data.state;
  }, [data, queryClient]);

  if (!data || data.state === 'idle') return null;

  const isSyncing = data.state === 'syncing';
  const isDone = data.state === 'done';
  const isError = data.state === 'error';

  return (
    <div className={cn(
      'w-full px-4 py-2 flex items-center gap-3 text-[12px] font-medium transition-colors',
      isSyncing && 'bg-blue-50 text-blue-700 border-b border-blue-100',
      isDone    && 'bg-emerald-50 text-emerald-700 border-b border-emerald-100',
      isError   && 'bg-red-50 text-red-700 border-b border-red-100',
    )}>
      {/* Icon */}
      {isSyncing && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
      {isDone    && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
      {isError   && <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}

      {/* Label */}
      <span className="flex-shrink-0">
        {isSyncing && 'Syncing from ServiceNow'}
        {isDone    && 'Sync complete'}
        {isError   && 'Sync failed'}
      </span>

      {/* Progress bar (syncing only) */}
      {isSyncing && (
        <div className="flex-1 max-w-xs h-1.5 bg-blue-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${data.progress}%` }}
          />
        </div>
      )}

      {/* Step label */}
      <span className="text-[11px] opacity-75 truncate">
        {data.step}
      </span>

      {/* Done badge */}
      {isDone && (
        <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
          Done
        </span>
      )}

      {/* Error detail */}
      {isError && data.error && (
        <span className="ml-auto flex-shrink-0 text-[11px] text-red-500 truncate max-w-xs">
          {data.error}
        </span>
      )}
    </div>
  );
}
