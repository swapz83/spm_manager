'use client';
import { usePeople } from '@/hooks/usePeople';
import { cn, getInitials, getUtilizationColor, getUtilizationTextColor } from '@/lib/utils';
import { useDeleteAssignment } from '@/hooks/useAssignments';
import { X, Briefcase } from 'lucide-react';

export function PeopleView() {
  const { data: people, isLoading } = usePeople();
  const deleteAssignment = useDeleteAssignment();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="grid gap-4">
        {people?.map((person: any) => {
          const utilPct = person.total_allocation || 0;
          return (
            <div key={person.sys_id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                  style={{ backgroundColor: stringToColor(person.first_name + person.last_name) }}>
                  {getInitials(person.first_name, person.last_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-slate-900">{person.first_name} {person.last_name}</h3>
                    <span className="text-xs text-slate-400">{person.department}</span>
                  </div>
                  <div className="text-sm text-slate-500 mb-3">{person.title}</div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 max-w-xs h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', getUtilizationColor(utilPct))}
                        style={{ width: `${Math.min(utilPct, 100)}%` }}
                      />
                    </div>
                    <span className={cn('text-sm font-bold', getUtilizationTextColor(utilPct))}>{utilPct}%</span>
                    <span className="text-xs text-slate-400">allocated</span>
                  </div>

                  {person.assignments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {person.assignments.map((a: any) => (
                        <div key={a.sys_id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 group">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.project_color || '#94a3b8' }} />
                          <span className="text-sm text-slate-700">{a.project_name}</span>
                          <span className="text-xs font-semibold text-slate-400">{a.allocation_pct}%</span>
                          {a.role && <span className="text-xs text-slate-400">({a.role})</span>}
                          <button
                            onClick={() => deleteAssignment.mutate(a.sys_id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                          >
                            <X className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {person.assignments.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Briefcase className="w-4 h-4" />
                      <span>Unassigned</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stringToColor(str: string): string {
  const colors = ['#3B82F6','#8B5CF6','#EC4899','#EF4444','#F59E0B','#10B981','#14B8A6','#6366F1','#0EA5E9','#D946EF'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
