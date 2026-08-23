'use client';
import { useState, useCallback, useMemo } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { ProjectCard } from '@/components/ProjectCard';
import { PersonChip, PersonChipOverlay } from '@/components/PersonChip';
import { AllocationDialog } from '@/components/AllocationDialog';
import { AddProjectDialog } from '@/components/AddProjectDialog';
import { ReviewView } from '@/components/ReviewView';
import { useProjects } from '@/hooks/useProjects';
import { usePeople, useManagers } from '@/hooks/usePeople';
import { useCreateAssignment } from '@/hooks/useAssignments';
import { Plus, Search, Users, Eye, SlidersHorizontal, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilters } from '@/lib/filters';
import { DateRangePicker } from '@/components/DateRangePicker';

export interface PendingChange {
  id: string;
  resource_id: string;
  resource_email: string;
  resource_name: string;
  project_id: string;
  project_number: string;
  project_name: string;
  project_color: string;
  allocation_pct: number;
  start_date: string;
  end_date: string;
  type: 'add' | 'end_early' | 'unassign' | 'update';
  /** For end_early / unassign / update: the original assignment sys_id */
  original_sys_id?: string;
  /** For end_early: the new end date being set */
  new_end_date?: string;
  /** For update: the new allocation percentage */
  new_allocation_pct?: number;
}

function getDefaultStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDefaultEndDate(): string {
  return `${new Date().getFullYear()}-12-31`;
}

export function ManageView() {
  // ── Shared filter state (persists across tabs) ──
  const { applied, draft, setDraft, apply, applyWith, changed } = useFilters();
  const draftManager = draft.manager;
  const appliedManager = applied.manager;
  const appliedStartDate = applied.startDate;
  const appliedEndDate = applied.endDate;
  const setDraftManager = (v: string) => setDraft({ manager: v });
  const hasApplied = true; // filters are always considered "applied" — queries run on mount

  // ── Selection & UI state ──
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activePerson, setActivePerson] = useState<any>(null);
  const [pendingDrop, setPendingDrop] = useState<{ people: any[]; project: any } | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  /** Projects explicitly added via ServiceNow search — pinned so they show regardless of filters */
  const [pinnedProjects, setPinnedProjects] = useState<any[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [showReview, setShowReview] = useState(false);

  // ── Data fetching ──
  const { data: managers } = useManagers();
  const { data: projects, isLoading: loadingProjects } = useProjects(
    appliedManager || undefined,
    appliedStartDate,
    appliedEndDate,
    applied.includeSubOrgs,
  );
  const { data: people, isLoading: loadingPeople } = usePeople(
    hasApplied ? (appliedManager || undefined) : undefined,
    hasApplied ? appliedStartDate : undefined,
    hasApplied ? appliedEndDate : undefined,
    hasApplied ? applied.includeSubOrgs : undefined,
  );
  const createAssignment = useCreateAssignment();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── Filter actions ──
  const handleApplyFilters = useCallback(() => {
    apply();
    setSelectedPeople(new Set());
  }, [apply]);

  const filtersChanged = changed;

  // ── Selection actions ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedPeople(new Set()), []);

  // ── Merge pinned (just-added) projects into the filtered list ──
  const allProjects = useMemo(() => {
    const base = projects || [];
    const baseIds = new Set(base.map((p: any) => p.sys_id));
    const extras = pinnedProjects.filter(p => !baseIds.has(p.sys_id));
    return [...base, ...extras];
  }, [projects, pinnedProjects]);

  // ── Merge pending changes into data ──
  const projectsWithPending = useMemo(() => {
    const stagedUnassignIds = new Set(
      pendingChanges.filter(c => c.type === 'unassign' && c.original_sys_id).map(c => c.original_sys_id!)
    );
    const stagedUpdateMap = new Map(
      pendingChanges.filter(c => c.type === 'update' && c.original_sys_id).map(c => [c.original_sys_id!, c.new_allocation_pct!])
    );
    return allProjects.map((p: any) => {
      const pendingAdds = pendingChanges
        .filter(c => c.project_id === p.sys_id && c.type === 'add')
        .map(c => ({
          sys_id: c.id,
          resource: c.resource_id,
          resource_name: c.resource_name,
          allocation_pct: c.allocation_pct,
          start_date: c.start_date,
          end_date: c.end_date,
          role: null,
          resource_status: 'pending',
          isPending: true,
        }));
      const filteredAssignments = (p.assignments || [])
        .filter((a: any) => !stagedUnassignIds.has(a.sys_id))
        .map((a: any) => stagedUpdateMap.has(a.sys_id)
          ? { ...a, allocation_pct: stagedUpdateMap.get(a.sys_id) }
          : a
        );
      return { ...p, assignments: [...filteredAssignments, ...pendingAdds] };
    });
  }, [allProjects, pendingChanges]);

  const filteredPeople = useMemo(() => {
    if (!people) return [];
    return people.filter((p: any) => {
      if (searchQuery === '') return true;
      return `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [people, searchQuery]);

  // ── Drag-and-drop ──
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const person = event.active.data.current?.person;
    if (person) setActivePerson(person);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActivePerson(null);
    const { active, over } = event;
    if (!over) return;
    const draggedPerson = active.data.current?.person;
    const project = over.data.current?.project;
    if (!draggedPerson || !project) return;

    // Collect people to assign: if dragged person is in selection, use entire selection;
    // otherwise just the dragged person
    let peoplToAssign: any[];
    if (selectedPeople.has(draggedPerson.sys_id) && selectedPeople.size > 0) {
      peoplToAssign = (people || []).filter((p: any) => selectedPeople.has(p.sys_id));
    } else {
      peoplToAssign = [draggedPerson];
    }

    // Filter out people already assigned or pending for this project
    peoplToAssign = peoplToAssign.filter((p: any) => {
      const alreadyAssigned = project.assignments?.some((a: any) => a.resource === p.sys_id);
      const alreadyPending = pendingChanges.some(c => c.resource_id === p.sys_id && c.project_id === project.sys_id && c.type === 'add');
      return !alreadyAssigned && !alreadyPending;
    });

    if (peoplToAssign.length === 0) return;
    setPendingDrop({ people: peoplToAssign, project });
  }, [selectedPeople, people, pendingChanges]);

  // ── Confirm allocation (with optional conflict clearing) ──
  const handleConfirmAllocation = useCallback((allocation: number, startDate: string, endDate: string, clearConflicts: boolean) => {
    if (!pendingDrop) return;

    const newChanges: PendingChange[] = [];
    const dayBefore = new Date(startDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];

    for (const person of pendingDrop.people) {
      // Add the new assignment
      newChanges.push({
        id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        resource_id: person.sys_id,
        resource_email: person.email,
        resource_name: `${person.first_name} ${person.last_name}`,
        project_id: pendingDrop.project.sys_id,
        project_number: pendingDrop.project.number,
        project_name: pendingDrop.project.short_description,
        project_color: pendingDrop.project.color || '#94a3b8',
        allocation_pct: allocation,
        start_date: startDate,
        end_date: endDate,
        type: 'add',
      });

      // If clearing conflicts, end-date overlapping assignments
      if (clearConflicts) {
        for (const a of (person.assignments || [])) {
          if (a.project === pendingDrop.project.sys_id) continue;
          if (a.isPending || a.resource_status === 'pending') continue;
          const aStart = a.start_date ? new Date(a.start_date) : null;
          const aEnd = a.end_date ? new Date(a.end_date) : null;
          const newStart = new Date(startDate);
          const newEnd = new Date(endDate);
          const overlaps = (!aStart || aStart <= newEnd) && (!aEnd || aEnd >= newStart);
          if (overlaps) {
            // If the existing assignment starts on/after the new start date, it
            // has nothing to preserve — fully unassign (delete) instead of
            // ending it early (which would produce end < start).
            const startsBeforeNew = aStart && aStart < new Date(startDate);
            if (startsBeforeNew) {
              newChanges.push({
                id: `end-early-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                resource_id: person.sys_id,
                resource_email: person.email,
                resource_name: `${person.first_name} ${person.last_name}`,
                project_id: a.project,
                project_number: a.project_number || '',
                project_name: a.project_name || '(unknown)',
                project_color: a.project_color || '#94a3b8',
                allocation_pct: a.allocation_pct,
                start_date: a.start_date || '',
                end_date: dayBeforeStr,
                type: 'end_early',
                original_sys_id: a.sys_id,
                new_end_date: dayBeforeStr,
              });
            } else {
              newChanges.push({
                id: `unassign-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                resource_id: person.sys_id,
                resource_email: person.email,
                resource_name: `${person.first_name} ${person.last_name}`,
                project_id: a.project,
                project_number: a.project_number || '',
                project_name: a.project_name || '(unknown)',
                project_color: a.project_color || '#94a3b8',
                allocation_pct: a.allocation_pct,
                start_date: a.start_date || '',
                end_date: a.end_date || '',
                type: 'unassign',
                original_sys_id: a.sys_id,
              });
            }
          }
        }
      }
    }

    setPendingChanges(prev => [...prev, ...newChanges]);
    setPendingDrop(null);
    // Clear selection after assignment
    setSelectedPeople(new Set());
  }, [pendingDrop]);

  const removePendingChange = useCallback((id: string) => {
    setPendingChanges(prev => prev.filter(c => c.id !== id));
  }, []);

  const editPendingChange = useCallback((id: string, allocation_pct: number) => {
    setPendingChanges(prev => prev.map(c => c.id === id ? { ...c, allocation_pct } : c));
  }, []);

  const stageDeleteExisting = useCallback((assignment: any, project: any) => {
    setPendingChanges(prev => {
      if (prev.some(c => c.type === 'unassign' && c.original_sys_id === assignment.sys_id)) return prev;
      return [...prev, {
        id: `unassign-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        resource_id: assignment.resource,
        resource_email: '',
        resource_name: assignment.resource_name,
        project_id: project.sys_id,
        project_number: project.number,
        project_name: project.short_description,
        project_color: project.color || '#94a3b8',
        allocation_pct: assignment.allocation_pct,
        start_date: assignment.start_date || '',
        end_date: assignment.end_date || '',
        type: 'unassign',
        original_sys_id: assignment.sys_id,
      }];
    });
  }, []);

  const stageUpdateExisting = useCallback((assignment: any, project: any, newPct: number) => {
    setPendingChanges(prev => {
      const existingIdx = prev.findIndex(c => c.type === 'update' && c.original_sys_id === assignment.sys_id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], new_allocation_pct: newPct };
        return next;
      }
      return [...prev, {
        id: `update-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        resource_id: assignment.resource,
        resource_email: '',
        resource_name: assignment.resource_name,
        project_id: project.sys_id,
        project_number: project.number,
        project_name: project.short_description,
        project_color: project.color || '#94a3b8',
        allocation_pct: assignment.allocation_pct,
        start_date: assignment.start_date || '',
        end_date: assignment.end_date || '',
        type: 'update',
        original_sys_id: assignment.sys_id,
        new_allocation_pct: newPct,
      }];
    });
  }, []);

  // ── Review view ──
  if (showReview) {
    return (
      <ReviewView
        changes={pendingChanges}
        startDate={appliedStartDate}
        endDate={appliedEndDate}
        onBack={() => setShowReview(false)}
        onRemoveChange={removePendingChange}
        onPublished={() => { setPendingChanges([]); setShowReview(false); }}
      />
    );
  }

  const isLoading = hasApplied && (loadingProjects || loadingPeople);
  const addCount = pendingChanges.filter(c => c.type === 'add').length;
  const endEarlyCount = pendingChanges.filter(c => c.type === 'end_early').length;
  const unassignCount = pendingChanges.filter(c => c.type === 'unassign').length;
  const updateCount = pendingChanges.filter(c => c.type === 'update').length;
  const totalPending = pendingChanges.length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="max-w-[1600px] mx-auto px-6 py-6">

        {/* ── Filter Card ── */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] p-5 mb-5">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 flex-shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-gray-400">Filters</span>
            </div>
            <div className="h-5 w-px bg-gray-100 flex-shrink-0" />
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400">Manager / Team</label>
              <select
                value={draftManager}
                onChange={e => setDraftManager(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[220px]"
              >
                <option value="">All People</option>
                {managers?.map((m: any) => (
                  <option key={m.sys_id} value={m.sys_id}>
                    {m.first_name} {m.last_name}&rsquo;s team ({m.direct_report_count})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400">Scope</label>
              <label className={cn(
                'flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-gray-50 select-none h-[34px]',
                draftManager ? 'text-gray-700 cursor-pointer hover:bg-white' : 'text-gray-300 cursor-not-allowed'
              )}>
                <input
                  type="checkbox"
                  checked={draft.includeSubOrgs}
                  disabled={!draftManager}
                  onChange={e => setDraft({ includeSubOrgs: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-xs">Include sub-orgs</span>
              </label>
            </div>
            <DateRangePicker
              startDate={draft.startDate}
              endDate={draft.endDate}
              onChange={(s, e) => {
                applyWith({ startDate: s, endDate: e });
                setSelectedPeople(new Set());
              }}
            />
            <button onClick={handleApplyFilters}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                filtersChanged ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm' : 'bg-[#1A56DB] text-white hover:bg-blue-700 shadow-sm')}>
              {hasApplied ? (filtersChanged ? 'Re-apply' : 'Applied') : 'Apply'}
            </button>

            <div className="flex-1" />

            {totalPending > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500">
                  <span className="font-bold text-blue-600">{addCount}</span> add
                  {endEarlyCount > 0 && <>, <span className="font-bold text-amber-600">{endEarlyCount}</span> end</>}
                  {unassignCount > 0 && <>, <span className="font-bold text-red-600">{unassignCount}</span> remove</>}
                  {updateCount > 0 && <>, <span className="font-bold text-purple-600">{updateCount}</span> update</>}
                </div>
                <button onClick={() => setShowReview(true)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#1A56DB] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
                  <Eye className="w-3.5 h-3.5" /> Review
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Pre-apply placeholder ── */}
        {!hasApplied && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="text-center">
              <SlidersHorizontal className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Select a manager and date range, then click Apply</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        )}

        {/* ── Main content ── */}
        {hasApplied && !isLoading && (
          <div className="flex gap-6">
            {/* Project Board */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-gray-900">
                  Projects <span className="text-sm font-normal text-gray-400">({projects?.length || 0})</span>
                </h2>
                <button onClick={() => setShowAddProject(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1A56DB] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Project
                </button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {projectsWithPending.map((project: any) => (
                  <ProjectCard
                    key={project.sys_id}
                    project={project}
                    onRemovePending={removePendingChange}
                    onEditPending={editPendingChange}
                    onDeleteExisting={stageDeleteExisting}
                    onUpdateExisting={stageUpdateExisting}
                  />
                ))}
              </div>
            </div>

            {/* People Sidebar */}
            <div className="w-72 flex-shrink-0">
              <div className="sticky top-20">
                {/* Header with selection count & clear */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-semibold text-gray-900">
                    People <span className="text-sm font-normal text-gray-400">({filteredPeople.length})</span>
                  </h2>
                  {selectedPeople.size > 0 && (
                    <button onClick={clearSelection}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <XCircle className="w-3.5 h-3.5" />
                      Clear ({selectedPeople.size})
                    </button>
                  )}
                </div>

                {/* Selection banner */}
                {selectedPeople.size > 0 && (
                  <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    <strong>{selectedPeople.size}</strong> selected &mdash; drag any selected person onto a project to assign all
                  </div>
                )}

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Search people..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50" />
                </div>

                <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  {filteredPeople.map((person: any) => (
                    <PersonChip
                      key={person.sys_id}
                      person={person}
                      compact
                      isSelected={selectedPeople.has(person.sys_id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activePerson ? <PersonChipOverlay person={activePerson} /> : null}
      </DragOverlay>

      {pendingDrop && (
        <AllocationDialog
          people={pendingDrop.people}
          project={pendingDrop.project}
          defaultStartDate={getDefaultStartDate()}
          defaultEndDate={getDefaultEndDate()}
          onConfirm={handleConfirmAllocation}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {showAddProject && (
        <AddProjectDialog
          onClose={() => setShowAddProject(false)}
          onAdded={(project) => setPinnedProjects(prev => [
            ...prev.filter(p => p.sys_id !== project.sys_id),
            { ...project, assignments: [] },
          ])}
        />
      )}
    </DndContext>
  );
}
