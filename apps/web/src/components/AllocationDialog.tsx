'use client';
import { useState, useMemo } from 'react';
import { X, Calendar, AlertTriangle, Trash2 } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

export interface ConflictingAssignment {
  sys_id: string;
  resource_id: string;
  resource_name: string;
  project_name: string;
  project_number: string;
  project_color: string;
  allocation_pct: number;
  start_date: string | null;
  end_date: string | null;
}

interface AllocationDialogProps {
  people: any[];           // one or more people being assigned
  project: any;
  defaultStartDate: string;
  defaultEndDate: string;
  onConfirm: (allocation: number, startDate: string, endDate: string, clearConflicts: boolean) => void;
  onCancel: () => void;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
  catch { return '—'; }
}

export function AllocationDialog({ people, project, defaultStartDate, defaultEndDate, onConfirm, onCancel }: AllocationDialogProps) {
  const [allocation, setAllocation] = useState(20);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [clearConflicts, setClearConflicts] = useState(false);

  // Find existing assignments for these people that overlap with the date range
  // and are NOT the same project we're assigning to
  const conflicting = useMemo(() => {
    const conflicts: ConflictingAssignment[] = [];
    for (const person of people) {
      for (const a of (person.assignments || [])) {
        if (a.project === project.sys_id) continue;          // same project — not a conflict
        if (a.isPending || a.resource_status === 'pending') continue;
        // Date overlap check
        const aStart = a.start_date ? new Date(a.start_date) : null;
        const aEnd = a.end_date ? new Date(a.end_date) : null;
        const newStart = startDate ? new Date(startDate) : null;
        const newEnd = endDate ? new Date(endDate) : null;
        const overlaps =
          (!aStart || !newEnd || aStart <= newEnd) &&
          (!aEnd || !newStart || aEnd >= newStart);
        if (overlaps) {
          conflicts.push({
            sys_id: a.sys_id,
            resource_id: person.sys_id,
            resource_name: `${person.first_name} ${person.last_name}`,
            project_name: a.project_name || '(unknown)',
            project_number: a.project_number || '',
            project_color: a.project_color || '#94a3b8',
            allocation_pct: a.allocation_pct,
            start_date: a.start_date,
            end_date: a.end_date,
          });
        }
      }
    }
    return conflicts;
  }, [people, project.sys_id, startDate, endDate]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-slate-900">Set Allocation</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* ── Assigning (people list) ── */}
          <div className="mb-5">
            <div className="text-sm text-slate-500 mb-2">
              Assigning {people.length > 1 ? `${people.length} people` : ''}
            </div>
            <div className="space-y-1.5">
              {people.map((p: any) => (
                <div key={p.sys_id} className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: stringToColor(p.first_name + p.last_name) }}
                  >
                    {getInitials(p.first_name, p.last_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{p.first_name} {p.last_name}</div>
                    {people.length <= 4 && (
                      <div className="text-[11px] text-slate-400 truncate">{p.title}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── To project ── */}
          <div className="mb-5">
            <div className="text-sm text-slate-500 mb-1">To project</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color || '#94a3b8' }} />
              <div>
                <div className="font-medium text-slate-900">{project.short_description}</div>
                <div className="text-xs text-slate-400 font-mono">{project.number}</div>
              </div>
            </div>
          </div>

          {/* ── Allocation slider ── */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Allocation</label>
              <span className="text-2xl font-bold text-blue-600">{allocation}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={allocation}
              onChange={e => setAllocation(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>5%</span>
              <span>100%</span>
            </div>
          </div>

          {/* ── Date pickers ── */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          {/* ── Clear conflicting assignments option ── */}
          {conflicting.length > 0 && (
            <div className={cn(
              'rounded-xl border p-4 mb-1 transition-colors',
              clearConflicts ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
            )}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearConflicts}
                  onChange={e => setClearConflicts(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 accent-amber-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                    Clear other assignments for this period
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    End-date {conflicting.length} conflicting assignment{conflicting.length !== 1 ? 's' : ''} to the day before the new start date.
                    This won&apos;t be sent to ServiceNow until you review and confirm.
                  </p>
                </div>
              </label>

              {clearConflicts && (
                <div className="mt-3 space-y-1.5 pl-7">
                  {conflicting.map(c => (
                    <div key={`${c.sys_id}-${c.resource_id}`} className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <span className="text-slate-600 truncate">
                        <strong>{c.resource_name}</strong> &rarr; {c.project_name}
                        <span className="text-slate-400 ml-1">
                          ({c.allocation_pct}%, {formatDate(c.start_date)}&ndash;{formatDate(c.end_date)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(allocation, startDate, endDate, clearConflicts)}
            disabled={allocation <= 0 || !startDate || !endDate}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors',
              allocation > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
            )}
          >
            Assign {people.length > 1 ? `${people.length} people` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function stringToColor(str: string): string {
  const colors = ['#E76F51','#F4A261','#E9C46A','#D4572A','#BC6C25','#F48C06','#FAA307','#E85D04','#C13C2E','#8B2E19'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
