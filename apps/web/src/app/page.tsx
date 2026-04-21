'use client';
import { useState } from 'react';
import { Header, type AppMode } from '@/components/Header';
import { SyncBar } from '@/components/SyncBar';
import { DashboardView } from '@/components/DashboardView';
import { ManageView } from '@/components/ManageView';
import { BulkAllocationsView } from '@/components/BulkAllocationsView';
import { ConfigView } from '@/components/ConfigView';

export default function App() {
  const [mode, setMode] = useState<AppMode>('dashboard');

  return (
    <div className="min-h-screen">
      <Header mode={mode} onModeChange={setMode} />
      <SyncBar />
      {mode === 'dashboard' && <DashboardView />}
      {mode === 'manage' && <ManageView />}
      {mode === 'bulk' && <BulkAllocationsView />}
      {mode === 'config' && <ConfigView />}
    </div>
  );
}
