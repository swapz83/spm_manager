'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn, getInitials, getUtilizationColor, getUtilizationTextColor } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface PersonChipProps {
  person: any;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  compact?: boolean;
}

export function PersonChip({ person, isSelected, onSelect, compact }: PersonChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: person.sys_id,
    data: { type: 'person', person },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const utilPct = person.total_allocation || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-3 p-3 bg-white rounded-xl border transition-all cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40 shadow-lg scale-105',
        isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
        compact && 'p-2 gap-2'
      )}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect(person.sys_id);
        }
      }}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className={cn(
        'flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold',
        compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
      )} style={{ backgroundColor: stringToColor(person.first_name + person.last_name) }}>
        {getInitials(person.first_name, person.last_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium text-slate-900 truncate', compact ? 'text-xs' : 'text-sm')}>
          {person.first_name} {person.last_name}
        </div>
        {!compact && (
          <div className="text-xs text-slate-500 truncate">{person.title}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn('text-xs font-semibold', getUtilizationTextColor(utilPct))}>
          {utilPct}%
        </span>
        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getUtilizationColor(utilPct))}
            style={{ width: `${Math.min(utilPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function PersonChipOverlay({ person }: { person: any }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-blue-400 shadow-xl cursor-grabbing ring-2 ring-blue-200">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
        style={{ backgroundColor: stringToColor(person.first_name + person.last_name) }}>
        {getInitials(person.first_name, person.last_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm truncate">{person.first_name} {person.last_name}</div>
        <div className="text-xs text-slate-500 truncate">{person.title}</div>
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
