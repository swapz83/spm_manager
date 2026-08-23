'use client';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, X, CheckCircle, AlertCircle, Loader2, Calendar, Plus, CalendarX2, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PendingChange } from '@/components/ManageView';

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return '—'; }
}

interface ReviewViewProps {
  changes: PendingChange[];
  startDate: string;
  endDate: string;
  onBack: () => void;
  onRemoveChange: (id: string) => void;
  onPublished: () => void;
}

export function ReviewView({ changes, startDate, endDate, onBack, onRemoveChange, onPublished }: ReviewViewProps) {
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const queryClient = useQueryClient();

  const addChanges = useMemo(() => changes.filter(c => c.type === 'add'), [changes]);
  const endEarlyChanges = useMemo(() => changes.filter(c => c.type === 'end_early'), [changes]);
  const unassignChanges = useMemo(() => changes.filter(c => c.type === 'unassign'), [changes]);
  const updateChanges = useMemo(() => changes.filter(c => c.type === 'update'), [changes]);

  // Group ADD changes by person
  const groupedByPerson = useMemo(() => {
    const map = new Map<string, { name: string; email: string; resource_id: string; projects: PendingChange[] }>();
    for (const c of addChanges) {
      if (!map.has(c.resource_id)) {
        map.set(c.resource_id, { name: c.resource_name, email: c.resource_email, resource_id: c.resource_id, projects: [] });
      }
      map.get(c.resource_id)!.projects.push(c);
    }
    return Array.from(map.values());
  }, [addChanges]);

  // Group ADD changes by project
  const groupedByProject = useMemo(() => {
    const map = new Map<string, { name: string; number: string; color: string; people: PendingChange[] }>();
    for (const c of addChanges) {
      if (!map.has(c.project_id)) {
        map.set(c.project_id, { name: c.project_name, number: c.project_number, color: c.project_color, people: [] });
      }
      map.get(c.project_id)!.people.push(c);
    }
    return Array.from(map.values());
  }, [addChanges]);

  // Group END_EARLY changes by person
  const endEarlyByPerson = useMemo(() => {
    const map = new Map<string, { name: string; resource_id: string; changes: PendingChange[] }>();
    for (const c of endEarlyChanges) {
      if (!map.has(c.resource_id)) {
        map.set(c.resource_id, { name: c.resource_name, resource_id: c.resource_id, changes: [] });
      }
      map.get(c.resource_id)!.changes.push(c);
    }
    return Array.from(map.values());
  }, [endEarlyChanges]);

  // Group UNASSIGN changes by person
  const unassignByPerson = useMemo(() => {
    const map = new Map<string, { name: string; resource_id: string; changes: PendingChange[] }>();
    for (const c of unassignChanges) {
      if (!map.has(c.resource_id)) {
        map.set(c.resource_id, { name: c.resource_name, resource_id: c.resource_id, changes: [] });
      }
      map.get(c.resource_id)!.changes.push(c);
    }
    return Array.from(map.values());
  }, [unassignChanges]);

  // Group UPDATE changes by person
  const updatesByPerson = useMemo(() => {
    const map = new Map<string, { name: string; resource_id: string; changes: PendingChange[] }>();
    for (const c of updateChanges) {
      if (!map.has(c.resource_id)) {
        map.set(c.resource_id, { name: c.resource_name, resource_id: c.resource_id, changes: [] });
      }
      map.get(c.resource_id)!.changes.push(c);
    }
    return Array.from(map.values());
  }, [updateChanges]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const payload = {
        changes: groupedByPerson.map(g => ({
          resource_id: g.resource_id,
          resource_email: g.email,
          resource_name: g.name,
          projects: g.projects.map(p => ({
            project_id: p.project_id,
            project_number: p.project_number,
            project_name: p.project_name,
            allocation_pct: p.allocation_pct,
            start_date: p.start_date,
            end_date: p.end_date,
          })),
        })),
        endEarly: endEarlyChanges.map(c => ({
          original_sys_id: c.original_sys_id!,
          resource_id: c.resource_id,
          resource_name: c.resource_name,
          project_id: c.project_id,
          project_name: c.project_name,
          new_end_date: c.new_end_date!,
        })),
        unassign: unassignChanges.map(c => ({
          original_sys_id: c.original_sys_id!,
          resource_id: c.resource_id,
          resource_name: c.resource_name,
          project_id: c.project_id,
          project_name: c.project_name,
        })),
        updates: updateChanges.map(c => ({
          original_sys_id: c.original_sys_id!,
          resource_id: c.resource_id,
          resource_name: c.resource_name,
          project_id: c.project_id,
          project_name: c.project_name,
          new_allocation_pct: c.new_allocation_pct!,
        })),
        startDate,
        endDate,
      };
      const res = await api.publish.execute(payload);
      setResult(res);
      // The publish route already wrote all changes to the local DB — invalidate
      // the React Query caches so the board refetches and reflects the new state.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: any) {
      setResult({ success: false, errors: [{ error: e.message }], published: [] });
    } finally {
      setPublishing(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] p-8">
          <div className="flex items-center gap-3 mb-6">
            {result.success ? (
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            ) : (
              <AlertCircle className="w-7 h-7 text-amber-500" />
            )}
            <h2 className="text-[18px] font-semibold text-gray-900">
              {result.success ? 'Published Successfully' : 'Publish Completed with Issues'}
            </h2>
          </div>

          <p className="text-sm text-gray-600 mb-6">{result.summary}</p>

          {result.published?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-3">Successful</h3>
              <div className="space-y-2">
                {result.published.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700">
                      <strong>{r.user}</strong> &rarr; {r.project_name} ({r.allocation_pct}%)
                    </span>
                    {r.sn_plan_id && <span className="text-xs text-gray-400 ml-auto">{r.sn_plan_id}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-3">Errors</h3>
              <div className="space-y-2">
                {result.errors.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm text-red-700">{e.user ? `${e.user}: ` : ''}{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onPublished}
            className="px-6 py-2.5 bg-[#1A56DB] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div>
            <h2 className="text-[18px] font-semibold text-gray-900">Review Changes</h2>
            <p className="text-sm text-gray-500">
              {addChanges.length} new assignment{addChanges.length !== 1 ? 's' : ''}
              {endEarlyChanges.length > 0 && (
                <span className="text-amber-600">
                  {' '}· {endEarlyChanges.length} end-date change{endEarlyChanges.length !== 1 ? 's' : ''}
                </span>
              )}
              {unassignChanges.length > 0 && (
                <span className="text-red-600">
                  {' '}· {unassignChanges.length} unassign{unassignChanges.length !== 1 ? 's' : ''}
                </span>
              )}
              {updateChanges.length > 0 && (
                <span className="text-purple-600">
                  {' '}· {updateChanges.length} allocation update{updateChanges.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishing || changes.length === 0}
          className={cn(
            'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm',
            publishing
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          )}
        >
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {publishing ? 'Publishing to ServiceNow...' : 'Publish to ServiceNow'}
        </button>
      </div>

      {/* ── New Assignments ── */}
      {addChanges.length > 0 && (
        <>
          {/* By Person */}
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] p-6 mb-5">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-4">
              <Plus className="w-4 h-4 text-[#1A56DB]" />
              New Assignments &mdash; By Person
            </h3>
            <div className="space-y-4">
              {groupedByPerson.map((group) => (
                <div key={group.resource_id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ backgroundColor: stringToColor(group.name) }}
                    >
                      {group.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                      <div className="text-xs text-gray-400">{group.email}</div>
                    </div>
                    <span className="ml-auto text-xs text-gray-500">
                      Total new: <span className="font-semibold text-[#1A56DB]">{group.projects.reduce((s, p) => s + p.allocation_pct, 0)}%</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.projects.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 group">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.project_color }} />
                        <span className="text-sm text-gray-700">{p.project_name}</span>
                        <span className="text-xs font-semibold text-[#1A56DB]">{p.allocation_pct}%</span>
                        <span className="text-[10px] text-gray-400">{formatDate(p.start_date)}–{formatDate(p.end_date)}</span>
                        <button
                          onClick={() => onRemoveChange(p.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Project */}
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] p-6 mb-5">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-4">
              <Plus className="w-4 h-4 text-[#1A56DB]" />
              New Assignments &mdash; By Project
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {groupedByProject.map((group) => (
                <div key={group.number} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                    <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                    <span className="text-[11px] text-gray-400 font-mono">{group.number}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.people.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{p.resource_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{formatDate(p.start_date)}–{formatDate(p.end_date)}</span>
                          <span className="text-xs font-semibold text-[#1A56DB]">{p.allocation_pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── End-Date Changes ── */}
      {endEarlyChanges.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-amber-100 p-6 mb-5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-1">
            <CalendarX2 className="w-4 h-4 text-amber-500" />
            Assignments Being Ended Early
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            These existing assignments will have their end date moved up to avoid conflicts with the new assignments above.
          </p>
          <div className="space-y-3">
            {endEarlyByPerson.map((group) => (
              <div key={group.resource_id} className="border border-amber-100 rounded-xl p-4 bg-amber-50/40">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: stringToColor(group.name) }}
                  >
                    {group.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                </div>
                <div className="space-y-2 pl-10">
                  {group.changes.map(c => (
                    <div key={c.id} className="flex items-center gap-3 text-sm group">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.project_color }} />
                      <span className="text-gray-700">{c.project_name}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.project_number}</span>
                      <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                        end date &rarr;
                        <span className="font-semibold text-amber-700">{formatDate(c.new_end_date)}</span>
                      </span>
                      <button
                        onClick={() => onRemoveChange(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unassignments (full deletes) ── */}
      {unassignChanges.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-red-100 p-6 mb-5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-1">
            <Trash2 className="w-4 h-4 text-red-500" />
            Assignments Being Removed
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            These assignments start on or after the new assignment&rsquo;s start date, so they will be fully removed instead of end-dated.
          </p>
          <div className="space-y-3">
            {unassignByPerson.map((group) => (
              <div key={group.resource_id} className="border border-red-100 rounded-xl p-4 bg-red-50/40">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: stringToColor(group.name) }}
                  >
                    {group.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                </div>
                <div className="space-y-2 pl-10">
                  {group.changes.map(c => (
                    <div key={c.id} className="flex items-center gap-3 text-sm group">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.project_color }} />
                      <span className="text-gray-700">{c.project_name}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.project_number}</span>
                      <span className="text-[10px] text-gray-400">
                        {formatDate(c.start_date)}–{formatDate(c.end_date)}
                      </span>
                      <span className="ml-auto text-xs font-semibold text-red-600">Remove</span>
                      <button
                        onClick={() => onRemoveChange(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Allocation Updates ── */}
      {updateChanges.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-purple-100 p-6 mb-5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-1">
            <Pencil className="w-4 h-4 text-purple-500" />
            Allocation Updates
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            These existing assignments will have their allocation percentage updated.
          </p>
          <div className="space-y-3">
            {updatesByPerson.map((group) => (
              <div key={group.resource_id} className="border border-purple-100 rounded-xl p-4 bg-purple-50/40">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: stringToColor(group.name) }}
                  >
                    {group.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                </div>
                <div className="space-y-2 pl-10">
                  {group.changes.map(c => (
                    <div key={c.id} className="flex items-center gap-3 text-sm group">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.project_color }} />
                      <span className="text-gray-700">{c.project_name}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.project_number}</span>
                      <span className="text-xs text-gray-500 ml-auto flex items-center gap-1.5">
                        <span className="font-semibold text-gray-500">{c.allocation_pct}%</span>
                        <span className="text-gray-400">&rarr;</span>
                        <span className="font-semibold text-purple-700">{c.new_allocation_pct}%</span>
                      </span>
                      <button
                        onClick={() => onRemoveChange(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {changes.length === 0 && (
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] p-12 text-center">
          <p className="text-gray-400">No pending changes to review.</p>
        </div>
      )}
    </div>
  );
}

function stringToColor(str: string): string {
  const colors = ['#E76F51','#F4A261','#E9C46A','#D4572A','#BC6C25','#F48C06','#FAA307','#E85D04','#C13C2E','#8B2E19'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
