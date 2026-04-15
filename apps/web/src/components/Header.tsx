'use client';
import { BarChart3, Settings2, FolderKanban, Cloud, Database, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AppMode = 'dashboard' | 'manage' | 'bulk';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function Header({ mode, onModeChange }: HeaderProps) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    staleTime: 60_000,
  });

  const isLive = health?.dataSource === 'servicenow';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-7 h-7 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">Resource Allocation</h1>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">SPM</span>
          {health && (
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              isLive
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>
              {isLive ? <Cloud className="w-3 h-3" /> : <Database className="w-3 h-3" />}
              {isLive ? 'ServiceNow' : 'Mock Data'}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => onModeChange('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => onModeChange('manage')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'manage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Manage Allocations
          </button>
          <button
            onClick={() => onModeChange('bulk')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            Bulk Allocations
          </button>
        </nav>
      </div>
    </header>
  );
}
