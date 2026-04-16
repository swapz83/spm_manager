'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePeople, useManagers } from '@/hooks/usePeople';
import { useProjects } from '@/hooks/useProjects';
import { useFilters } from '@/lib/filters';
import { cn, getInitials } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PendingChange } from '@/components/ManageView';
import { ReviewView } from '@/components/ReviewView';
import {
  Search, Loader2, ExternalLink, X, Check, Calendar,
  AlertTriangle, Users, FolderKanban, Zap, Trash2, Eye, SlidersHorizontal,
} from 'lucide-react';

/* ─── Allocation algorithm from spm_update.js ─── */
function computeAllocations(projectCount: number): number[] {
  if (projectCount === 0) return [];
  // SN effort is 0–1 FTE, we work in 0–100 allocation_pct
  // base = floor( (100 / count) )  — integer percent, rounded down
  const base = Math.floor((1 / projectCount) * 10) / 10;         // FTE: e.g. 0.3
  const basePct = Math.round(base * 100);                         // pct: e.g. 30
  const alloc = new Array(projectCount).fill(basePct);
  const currentSum = alloc.reduce((a: number, b: number) => a + b, 0);
  const remainder = 100 - currentSum;
  alloc[projectCount - 1] = alloc[projectCount - 1] + remainder;  // last project gets remainder
  return alloc;
}

/* ─── Helpers ─── */
function stringToColor(str: string): string {
  const colors = ['#E76F51','#F4A261','#E9C46A','#D4572A','#BC6C25','#F48C06','#FAA307','#E85D04','#C13C2E','#8B2E19'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
  catch { return '—'; }
}

function getDefaultStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDefaultEndDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-12-31`;
}

interface SelectedProject {
  sys_id: string;
  number: string;
  short_description: string;
  color: string;
  state: string;
  start_date?: string;
  end_date?: string;
}

const STATE_BADGES: Record<string, { label: string; className: string }> = {
  planning: { label: 'Planning', className: 'bg-amber-100 text-amber-700' },
  active:   { label: 'Active',   className: 'bg-green-100 text-green-700' },
  closed:   { label: 'Closed',   className: 'bg-slate-100 text-slate-500' },
};

export function BulkAllocationsView() {
  /* ── Shared filter state (persists across tabs) ── */
  const { applied, draft, setDraft, apply } = useFilters();
  const draftManager = draft.manager;
  const draftStartDate = draft.startDate;
  const draftEndDate = draft.endDate;
  const appliedManager = applied.manager || undefined;
  const startDate = applied.startDate;
  const endDate = applied.endDate;
  const setDraftManager = (v: string) => setDraft({ manager: v });
  const setDraftStartDate = (v: string) => setDraft({ startDate: v });
  const setDraftEndDate = (v: string) => setDraft({ endDate: v });

  /* ── People multi-select ── */
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  /* ── Projects multi-select ── */
  const [selectedProjects, setSelectedProjects] = useState<SelectedProject[]>([]);
  const [showProjectSearch, setShowProjectSearch] = useState(false);

  /* ── Pending changes & review ── */
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [showReview, setShowReview] = useState(false);

  /* ── Data queries (always active — loads on mount with defaults) ── */
  const { data: managers } = useManagers();
  const { data: people, isLoading: loadingPeople } = usePeople(
    appliedManager,
    startDate,
    endDate,
    applied.includeSubOrgs,
  );
  const { data: dbProjects, isLoading: loadingProjects } = useProjects(appliedManager, startDate, endDate, applied.includeSubOrgs);

  // Seed selectedProjects from DB projects on first load / filter change.
  // Re-seed when any applied filter (manager or date window) changes.
  const [seededFromQuery, setSeededFromQuery] = useState(false);
  const [seededKey, setSeededKey] = useState<string>('');
  const currentKey = `${appliedManager || ''}|${startDate}|${endDate}`;
  useEffect(() => {
    if (!dbProjects) return;
    const filtersChanged = seededKey !== currentKey;
    if (filtersChanged || !seededFromQuery) {
      setSelectedProjects(dbProjects.map((p: any) => ({
        sys_id: p.sys_id,
        number: p.number,
        short_description: p.short_description,
        color: p.color || '#94a3b8',
        state: p.state,
        start_date: p.start_date,
        end_date: p.end_date,
      })));
      setSeededFromQuery(true);
      setSeededKey(currentKey);
    }
  }, [dbProjects, seededFromQuery, currentKey, seededKey]);

  const handleApplyFilters = () => {
    apply();
    setSelectedPeople(new Set());
    setSelectedProjects([]);
    setSeededFromQuery(false);  // re-seed projects from new query results
  };

  const togglePerson = (id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllPeople = () => {
    if (!people) return;
    setSelectedPeople(new Set(people.map((p: any) => p.sys_id)));
  };

  const clearPeopleSelection = () => setSelectedPeople(new Set());

  const removeProject = (sysId: string) => {
    setSelectedProjects(prev => prev.filter(p => p.sys_id !== sysId));
  };

  /* ── Compute allocation preview ── */
  const allocationPreview = useMemo(() => {
    if (selectedProjects.length === 0 || selectedPeople.size === 0) return null;
    const allocs = computeAllocations(selectedProjects.length);
    return selectedProjects.map((proj, i) => ({
      ...proj,
      allocation_pct: allocs[i],
    }));
  }, [selectedProjects, selectedPeople.size]);

  /* ── Generate pending changes ── */
  const handleGenerate = () => {
    if (!people || selectedPeople.size === 0 || selectedProjects.length === 0) return;
    const allocs = computeAllocations(selectedProjects.length);
    const changes: PendingChange[] = [];

    const selectedPeopleArr = people.filter((p: any) => selectedPeople.has(p.sys_id));

    for (const person of selectedPeopleArr) {
      // First: end_early all existing assignments that overlap with the date range
      for (const a of (person.assignments || [])) {
        if (a.isPending || a.resource_status === 'pending') continue;
        const aStart = a.start_date ? new Date(a.start_date) : null;
        const aEnd = a.end_date ? new Date(a.end_date) : null;
        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);
        const overlaps =
          (!aStart || aStart <= newEnd) &&
          (!aEnd || aEnd >= newStart);
        if (overlaps) {
          // If the existing assignment starts on/after our new start date, it has
          // nothing to preserve — fully unassign (delete). Otherwise end it early.
          const startsBeforeNew = aStart && aStart < newStart;
          if (startsBeforeNew) {
            const dayBefore = new Date(newStart);
            dayBefore.setDate(dayBefore.getDate() - 1);
            const newEndDate = dayBefore.toISOString().slice(0, 10);
            changes.push({
              id: `end-${a.sys_id}-${person.sys_id}`,
              type: 'end_early',
              resource_id: person.sys_id,
              resource_email: person.email || '',
              resource_name: `${person.first_name} ${person.last_name}`,
              project_id: a.project || '',
              project_number: a.project_number || '',
              project_name: a.project_name || '(unknown)',
              project_color: a.project_color || '#94a3b8',
              allocation_pct: a.allocation_pct,
              start_date: a.start_date || '',
              end_date: a.end_date || '',
              original_sys_id: a.sys_id,
              new_end_date: newEndDate,
            });
          } else {
            changes.push({
              id: `unassign-${a.sys_id}-${person.sys_id}`,
              type: 'unassign',
              resource_id: person.sys_id,
              resource_email: person.email || '',
              resource_name: `${person.first_name} ${person.last_name}`,
              project_id: a.project || '',
              project_number: a.project_number || '',
              project_name: a.project_name || '(unknown)',
              project_color: a.project_color || '#94a3b8',
              allocation_pct: a.allocation_pct,
              start_date: a.start_date || '',
              end_date: a.end_date || '',
              original_sys_id: a.sys_id,
            });
          }
        }
      }

      // Then: add new assignments to each selected project
      for (let i = 0; i < selectedProjects.length; i++) {
        const proj = selectedProjects[i];
        changes.push({
          id: `bulk-${person.sys_id}-${proj.sys_id}`,
          type: 'add',
          resource_id: person.sys_id,
          resource_email: person.email || '',
          resource_name: `${person.first_name} ${person.last_name}`,
          project_id: proj.sys_id,
          project_number: proj.number,
          project_name: proj.short_description,
          project_color: proj.color,
          allocation_pct: allocs[i],
          start_date: startDate,
          end_date: endDate,
        });
      }
    }

    setPendingChanges(changes);
    setShowReview(true);
  };

  const handleRemoveChange = (id: string) => {
    setPendingChanges(prev => prev.filter(c => c.id !== id));
  };

  const handlePublished = () => {
    setPendingChanges([]);
    setShowReview(false);
    setSelectedPeople(new Set());
    setSelectedProjects([]);
  };

  /* ── Review view ── */
  if (showReview) {
    return (
      <ReviewView
        changes={pendingChanges}
        startDate={startDate}
        endDate={endDate}
        onBack={() => setShowReview(false)}
        onRemoveChange={handleRemoveChange}
        onPublished={handlePublished}
      />
    );
  }

  const canGenerate = selectedPeople.size > 0 && selectedProjects.length > 0 && startDate && endDate;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* ── Filter Card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Filters</h3>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          {/* Manager */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Manager</label>
            <select
              value={draftManager}
              onChange={e => setDraftManager(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Managers</option>
              {managers?.map((m: any) => (
                <option key={m.sys_id} value={m.sys_id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Scope</label>
            <label className={cn(
              'flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white select-none h-[42px]',
              draftManager ? 'text-slate-700 cursor-pointer hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'
            )}>
              <input
                type="checkbox"
                checked={draft.includeSubOrgs}
                disabled={!draftManager}
                onChange={e => setDraft({ includeSubOrgs: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 accent-blue-600"
              />
              Include sub-orgs
            </label>
          </div>
          {/* Start Date */}
          <div className="min-w-[160px]">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <Calendar className="w-3 h-3" /> Start Date
            </label>
            <input
              type="date"
              value={draftStartDate}
              onChange={e => setDraftStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {/* End Date */}
          <div className="min-w-[160px]">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <Calendar className="w-3 h-3" /> End Date
            </label>
            <input
              type="date"
              value={draftEndDate}
              onChange={e => setDraftEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {/* Apply */}
          <button
            onClick={handleApplyFilters}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Warning Banner ── */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Bulk allocation replaces existing assignments</p>
          <p className="text-xs text-amber-600 mt-1">
            All existing assignments for the selected people within <strong>{formatDate(startDate)}</strong> – <strong>{formatDate(endDate)}</strong> will
            be ended the day before the new start date. The selected projects will be allocated equally (using <code className="bg-amber-100 px-1 rounded">Math.floor</code> rounding,
            remainder goes to the last project).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ══════ LEFT: People ══════ */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">People</h3>
              {selectedPeople.size > 0 && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedPeople.size} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {people && people.length > 0 && (
                <button
                  onClick={selectedPeople.size === people.length ? clearPeopleSelection : selectAllPeople}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {selectedPeople.size === people.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              {selectedPeople.size > 0 && (
                <button
                  onClick={clearPeopleSelection}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {loadingPeople ? (
              <div className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
              </div>
            ) : !people || people.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm">No people found</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {people.map((person: any) => {
                  const isSelected = selectedPeople.has(person.sys_id);
                  return (
                    <button
                      key={person.sys_id}
                      onClick={() => togglePerson(person.sys_id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                        isSelected
                          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm bg-white',
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300',
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                        style={{ backgroundColor: stringToColor(person.first_name + person.last_name) }}
                      >
                        {getInitials(person.first_name, person.last_name)}
                      </div>
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {person.first_name} {person.last_name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{person.title}</div>
                      </div>
                      {/* Current allocation for the date range */}
                      {person.total_allocation > 0 && (
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-md',
                          person.total_allocation > 100
                            ? 'text-red-600 bg-red-50'
                            : 'text-slate-500 bg-slate-100',
                        )}>
                          {person.total_allocation}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════ RIGHT: Projects ══════ */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Projects</h3>
              {selectedProjects.length > 0 && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedProjects.length} selected
                </span>
              )}
            </div>
            <button
              onClick={() => setShowProjectSearch(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Search className="w-3 h-3" />
              Add from ServiceNow
            </button>
          </div>

          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {loadingProjects ? (
              <div className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
              </div>
            ) : selectedProjects.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No projects found</p>
                <p className="text-xs mt-1">Search and add projects from ServiceNow</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedProjects.map((proj, idx) => {
                  const badge = STATE_BADGES[proj.state] || STATE_BADGES.planning;
                  const alloc = allocationPreview?.[idx];
                  return (
                    <div
                      key={proj.sys_id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white group"
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color || '#94a3b8' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">{proj.number}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-slate-800 truncate">{proj.short_description}</div>
                      </div>
                      {/* Allocation preview */}
                      {alloc && selectedPeople.size > 0 && (
                        <span className="text-sm font-bold text-blue-600 tabular-nums">
                          {alloc.allocation_pct}%
                        </span>
                      )}
                      <button
                        onClick={() => removeProject(proj.sys_id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-lg transition-all"
                      >
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Allocation summary */}
          {allocationPreview && selectedPeople.size > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Each person &rarr; {selectedProjects.length} project{selectedProjects.length !== 1 ? 's' : ''}
                </span>
                <span className="font-semibold text-slate-700">
                  Total: {allocationPreview.reduce((s, p) => s + p.allocation_pct, 0)}%
                </span>
              </div>
              <div className="flex gap-1 mt-2">
                {allocationPreview.map(p => (
                  <div
                    key={p.sys_id}
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: p.color || '#94a3b8',
                      width: `${p.allocation_pct}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Generate / Review Button ── */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {selectedPeople.size > 0 && selectedProjects.length > 0 ? (
            <>
              <strong>{selectedPeople.size}</strong> {selectedPeople.size === 1 ? 'person' : 'people'} &times;{' '}
              <strong>{selectedProjects.length}</strong> {selectedProjects.length === 1 ? 'project' : 'projects'} ={' '}
              <strong>{selectedPeople.size * selectedProjects.length}</strong> new assignments
            </>
          ) : (
            'Select people and projects to generate bulk allocations'
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors shadow-sm',
            canGenerate
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed',
          )}
        >
          <Eye className="w-4 h-4" />
          Review & Generate ({selectedPeople.size * selectedProjects.length} assignments)
        </button>
      </div>

      {/* ── Project Search Dialog ── */}
      {showProjectSearch && (
        <ProjectSearchDialog
          existingIds={new Set(selectedProjects.map(p => p.sys_id))}
          onSelect={(proj) => {
            setSelectedProjects(prev => {
              if (prev.find(p => p.sys_id === proj.sys_id)) return prev;
              return [...prev, proj];
            });
          }}
          onClose={() => setShowProjectSearch(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Project Search Dialog — searches SN, lets user add multiple
   ═══════════════════════════════════════════════════════════════ */
function ProjectSearchDialog({
  existingIds,
  onSelect,
  onClose,
}: {
  existingIds: Set<string>;
  onSelect: (proj: SelectedProject) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await api.projects.search(term);
      setResults(data);
      setHasSearched(true);
    } catch {
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleAdd = (project: any) => {
    onSelect({
      sys_id: project.sys_id,
      number: project.number,
      short_description: project.short_description,
      color: project.color || '#94a3b8',
      state: project.state,
      start_date: project.start_date,
      end_date: project.end_date,
    });
    setAddedIds(prev => new Set(prev).add(project.sys_id));
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Add Projects from ServiceNow</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by project number (PRJ...) or name..."
              className="w-full pl-11 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          {!hasSearched && !isSearching && (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Type at least 2 characters to search</p>
            </div>
          )}

          {hasSearched && results.length === 0 && !isSearching && (
            <div className="text-center py-12 text-slate-400">
              <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No projects found for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                {results.length} project{results.length !== 1 ? 's' : ''} found
              </p>
              {results.map((project: any) => {
                const badge = STATE_BADGES[project.state] || STATE_BADGES.planning;
                const alreadyAdded = existingIds.has(project.sys_id) || addedIds.has(project.sys_id);
                return (
                  <button
                    key={project.sys_id}
                    onClick={() => !alreadyAdded && handleAdd(project)}
                    disabled={alreadyAdded}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all group',
                      alreadyAdded
                        ? 'border-green-200 bg-green-50/50 opacity-70'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: project.color || '#94a3b8' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-medium text-slate-500">{project.number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          {project.source === 'servicenow' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> SN
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate">{project.short_description}</p>
                        {(project.start_date || project.end_date) && (
                          <p className="text-xs text-slate-400 mt-1">
                            {project.start_date?.split('T')[0]?.split(' ')[0]} &mdash; {project.end_date?.split('T')[0]?.split(' ')[0]}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {alreadyAdded ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <Check className="w-3 h-3" /> Added
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            Add
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
