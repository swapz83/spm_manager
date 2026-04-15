'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

function getDefaultStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
function getDefaultEndDate(): string {
  return `${new Date().getFullYear()}-12-31`;
}

export interface Filters {
  manager: string;       // '' means all teams
  startDate: string;
  endDate: string;
  /** When true and manager is set, include everyone in the manager's sub-org (transitive reports). */
  includeSubOrgs: boolean;
}

interface FiltersContextValue {
  /** Currently applied filters — used by queries */
  applied: Filters;
  /** Draft filters — what the user is currently editing in the filter card */
  draft: Filters;
  setDraft: (f: Partial<Filters>) => void;
  /** Copy draft to applied (commit) */
  apply: () => void;
  /** True when draft differs from applied */
  changed: boolean;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const initial: Filters = {
    manager: '',
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    includeSubOrgs: false,
  };
  const [applied, setApplied] = useState<Filters>(initial);
  const [draft, setDraftState] = useState<Filters>(initial);

  const setDraft = (f: Partial<Filters>) => setDraftState(prev => ({ ...prev, ...f }));
  const apply = () => setApplied(draft);
  const changed =
    draft.manager !== applied.manager ||
    draft.startDate !== applied.startDate ||
    draft.endDate !== applied.endDate ||
    draft.includeSubOrgs !== applied.includeSubOrgs;

  return (
    <FiltersContext.Provider value={{ applied, draft, setDraft, apply, changed }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>');
  return ctx;
}
