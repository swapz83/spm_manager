'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AllocationDialogProps {
  person: any;
  project: any;
  maxAllocation: number;
  onConfirm: (allocation: number) => void;
  onCancel: () => void;
}

export function AllocationDialog({ person, project, maxAllocation, onConfirm, onCancel }: AllocationDialogProps) {
  const [allocation, setAllocation] = useState(Math.min(20, maxAllocation));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Set Allocation</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="mb-6">
            <div className="text-sm text-slate-500 mb-1">Assigning</div>
            <div className="font-medium text-slate-900">{person.first_name} {person.last_name}</div>
            <div className="text-xs text-slate-400">{person.title}</div>
          </div>

          <div className="mb-6">
            <div className="text-sm text-slate-500 mb-1">To project</div>
            <div className="font-medium text-slate-900">{project.short_description}</div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Allocation percentage</label>
              <span className="text-2xl font-bold text-blue-600">{allocation}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={maxAllocation}
              step={5}
              value={allocation}
              onChange={e => setAllocation(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>5%</span>
              <span>{maxAllocation}% available</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(allocation)}
              disabled={allocation <= 0}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors',
                allocation > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
              )}
            >
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
