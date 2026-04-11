'use client';
import { useDroppable } from '@dnd-kit/core';
import { cn, getInitials } from '@/lib/utils';
import { X, Users, Calendar } from 'lucide-react';
import { useDeleteAssignment } from '@/hooks/useAssignments';

interface ProjectCardProps {
  project: any;
}

export function ProjectCard({ project }: ProjectCardProps) {
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
        'bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all',
        isOver && 'ring-2 ring-blue-400 border-blue-300 shadow-lg bg-blue-50/30'
      )}
    >
      <div className="h-1.5" style={{ backgroundColor: project.color || '#94a3b8' }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">{project.short_description}</h3>
            <span className="text-xs text-slate-400 font-mono">{project.number}</span>
          </div>
          <span className={cn(
            'text-xs font-medium px-2.5 py-1 rounded-full',
            project.state === 'active' && 'bg-emerald-100 text-emerald-700',
            project.state === 'planning' && 'bg-amber-100 text-amber-700',
            project.state === 'closed' && 'bg-slate-100 text-slate-500',
          )}>
            {project.state}
          </span>
        </div>

        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
            <Calendar className="w-3.5 h-3.5" />
            {project.start_date && new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {project.start_date && project.end_date && ' - '}
            {project.end_date && new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
          <Users className="w-3.5 h-3.5" />
          <span>{assignments.length} member{assignments.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="space-y-2">
          {assignments.map((a: any) => (
            <div key={a.sys_id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 group hover:bg-slate-100 transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                style={{ backgroundColor: stringToColor(a.resource_name) }}>
                {a.resource_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{a.resource_name}</div>
                {a.role && <div className="text-[10px] text-slate-400">{a.role}</div>}
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {a.allocation_pct}%
              </span>
              <button
                onClick={() => deleteAssignment.mutate(a.sys_id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-md transition-all"
              >
                <X className="w-3 h-3 text-red-500" />
              </button>
            </div>
          ))}

          {assignments.length === 0 && (
            <div className={cn(
              'flex items-center justify-center py-8 text-sm rounded-xl border-2 border-dashed transition-colors',
              isOver ? 'border-blue-300 text-blue-500 bg-blue-50' : 'border-slate-200 text-slate-400'
            )}>
              {isOver ? 'Drop to assign' : 'Drag people here'}
            </div>
          )}

          {assignments.length > 0 && isOver && (
            <div className="flex items-center justify-center py-3 text-xs text-blue-500 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50">
              Drop to assign
            </div>
          )}
        </div>
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
