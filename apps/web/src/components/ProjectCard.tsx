'use client';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { X, Users, Calendar } from 'lucide-react';
import { useDeleteAssignment } from '@/hooks/useAssignments';

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return '—'; }
}

interface ProjectCardProps {
  project: any;
  onRemovePending?: (id: string) => void;
}

export function ProjectCard({ project, onRemovePending }: ProjectCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `project-${project.sys_id}`,
    data: { type: 'project', project },
  });

  const deleteAssignment = useDeleteAssignment();
  const assignments = project.assignments || [];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] overflow-hidden transition-all',
        isOver && 'ring-2 ring-blue-400 shadow-lg bg-blue-50/30'
      )}
    >
      <div className="h-1.5" style={{ backgroundColor: project.color || '#94a3b8' }} />
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-[14px] truncate">{project.short_description}</h3>
            <span className="text-[11px] text-gray-400 font-mono">{project.number}</span>
          </div>
          <span className={cn(
            'text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-2',
            project.state === 'active' && 'bg-emerald-100 text-emerald-700',
            project.state === 'planning' && 'bg-amber-100 text-amber-700',
            project.state === 'closed' && 'bg-slate-100 text-slate-500',
          )}>
            {project.state}
          </span>
        </div>

        {/* Project dates & member count */}
        <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
          {(project.start_date || project.end_date) && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(project.start_date)} &ndash; {formatDate(project.end_date)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {assignments.length}
          </span>
        </div>

        {/* Assignments table */}
        {/*
         * Column widths are fixed (not `auto`) so:
         *  - FTE pills (50% / 100%) all sit in the same x-column
         *  - Date cells are wide enough for the longest formatted date
         *    ("Dec 31, 26"), so nothing wraps to a second line
         *  - The person column flexes (`1fr`) and truncates with ellipsis
         */}
        {assignments.length > 0 && (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[minmax(0,1fr)_64px_72px_72px_28px] gap-1 px-3 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>Person</span>
              <span className="text-center">FTE</span>
              <span className="text-center">From</span>
              <span className="text-center">To</span>
              <span></span>
            </div>
            {/* Assignment rows */}
            {assignments.map((a: any) => {
              const isPending = a.isPending || a.resource_status === 'pending';
              return (
                <div
                  key={a.sys_id}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_64px_72px_72px_28px] gap-1 items-center px-3 py-2 group transition-colors border-t border-slate-100',
                    isPending ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                  )}
                >
                  {/* Person */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: stringToColor(a.resource_name || '') }}
                    >
                      {(a.resource_name || '').split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                    </div>
                    <span className="text-sm text-slate-700 truncate">
                      {a.resource_name}
                      {isPending && <span className="ml-1 text-[10px] text-blue-500">(new)</span>}
                    </span>
                  </div>
                  {/* Allocation — fixed-width pill so values align in a column */}
                  <span className={cn(
                    'text-xs font-semibold text-center px-1.5 py-0.5 rounded-md border w-14 mx-auto tabular-nums',
                    isPending
                      ? 'text-blue-600 bg-blue-100 border-blue-200'
                      : 'text-slate-600 bg-white border-slate-200'
                  )}>
                    {a.allocation_pct}%
                  </span>
                  {/* Start */}
                  <span className="text-[11px] text-slate-500 text-center whitespace-nowrap tabular-nums">
                    {formatDate(a.start_date)}
                  </span>
                  {/* End */}
                  <span className="text-[11px] text-slate-500 text-center whitespace-nowrap tabular-nums">
                    {formatDate(a.end_date)}
                  </span>
                  {/* Remove */}
                  <button
                    onClick={() => {
                      if (isPending && onRemovePending) {
                        onRemovePending(a.sys_id);
                      } else if (!isPending) {
                        deleteAssignment.mutate(a.sys_id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all justify-self-end"
                  >
                    <X className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty / drop target */}
        {assignments.length === 0 && (
          <div className={cn(
            'flex items-center justify-center py-8 text-sm rounded-xl border-2 border-dashed transition-colors',
            isOver ? 'border-blue-300 text-blue-500 bg-blue-50' : 'border-slate-200 text-slate-400'
          )}>
            {isOver ? 'Drop to assign' : 'Drag people here'}
          </div>
        )}

        {assignments.length > 0 && isOver && (
          <div className="flex items-center justify-center py-3 mt-2 text-xs text-blue-500 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50">
            Drop to assign
          </div>
        )}
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
