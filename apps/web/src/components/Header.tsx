'use client';
import { BarChart3, Settings2, FolderKanban, Cloud, Database, Zap, SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AppMode = 'dashboard' | 'manage' | 'bulk' | 'config';

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

  const navItems: { id: AppMode; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard',         icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'manage',    label: 'Manage Allocations', icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: 'bulk',      label: 'Bulk Allocations',   icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'config',    label: 'Settings',           icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-8 flex items-stretch justify-between h-[60px]">

        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* 2×2 dot logo */}
          <div
            className="w-8 h-8 rounded-lg grid grid-cols-2 gap-[3px] p-[7px]"
            style={{ backgroundColor: '#1A56DB' }}
          >
            <div className="bg-white/85 rounded-[2px]" />
            <div className="bg-white/85 rounded-[2px]" />
            <div className="bg-white/85 rounded-[2px]" />
            <div className="bg-white/85 rounded-[2px]" />
          </div>
          <div>
            <div className="text-[14px] font-700 text-gray-900 leading-tight tracking-tight font-bold">
              Resource Allocation
            </div>
            <div className="text-[10px] text-gray-400 leading-tight">Strategic Portfolio Management</div>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Status badge */}
          {health && (
            <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              isLive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}>
              {isLive ? <Cloud className="w-3 h-3" /> : <Database className="w-3 h-3" />}
              {isLive ? 'ServiceNow Live' : 'Mock Data'}
            </span>
          )}
        </div>

        {/* Tab navigation — underline style */}
        <nav className="flex items-stretch gap-0">
          {navItems.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => onModeChange(id)}
              className={`relative flex items-center gap-2 px-5 text-[13px] font-medium transition-colors border-b-2 ${
                mode === id
                  ? 'border-[#1A56DB] text-[#1A56DB]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              <span className={mode === id ? 'text-[#1A56DB]' : 'text-gray-400'}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
