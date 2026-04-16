'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn, getInitials } from '@/lib/utils';
import { Check, GripVertical } from 'lucide-react';

interface PersonChipProps {
  person: any;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  compact?: boolean;
}

export function PersonChip({ person, isSelected, onToggleSelect, compact }: PersonChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: person.sys_id,
    data: { type: 'person', person },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2.5 rounded-xl border transition-all',
        isDragging && 'opacity-40 shadow-lg scale-105',
        isSelected
          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm bg-white',
        compact ? 'p-2.5' : 'p-3',
        onToggleSelect ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
      )}
      onClick={(e) => {
        if (onToggleSelect) {
          e.stopPropagation();
          onToggleSelect(person.sys_id);
        }
      }}
      {...listeners}
      {...attributes}
    >
      {/* Selection checkbox / grip */}
      {onToggleSelect ? (
        <div className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
          isSelected
            ? 'bg-blue-500 border-blue-500'
            : 'border-slate-300 group-hover:border-slate-400'
        )}>
          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
      ) : (
        <div className="flex items-center text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold',
        compact ? 'w-7 h-7 text-[10px]' : 'w-10 h-10 text-sm'
      )} style={{ backgroundColor: stringToColor(person.first_name + person.last_name) }}>
        {getInitials(person.first_name, person.last_name)}
      </div>

      {/* Name / title */}
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium text-slate-900 truncate', compact ? 'text-xs' : 'text-sm')}>
          {person.first_name} {person.last_name}
        </div>
        {!compact && (
          <div className="text-xs text-slate-500 truncate">{person.title}</div>
        )}
      </div>
    </div>
  );
}

export function PersonChipOverlay({ person }: { person: any }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-blue-400 shadow-xl cursor-grabbing ring-2 ring-blue-200">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
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
  const colors = ['#E76F51','#F4A261','#E9C46A','#D4572A','#BC6C25','#F48C06','#FAA307','#E85D04','#C13C2E','#8B2E19'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
