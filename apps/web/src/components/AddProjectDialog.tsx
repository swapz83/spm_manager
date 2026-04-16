'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Loader2, ExternalLink, FolderPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface SearchResult {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  state: string;
  start_date?: string;
  end_date?: string;
  color?: string;
  source?: 'servicenow';
}

interface AddProjectDialogProps {
  onClose: () => void;
  onAdded?: (project: SearchResult) => void;
}

const STATE_BADGES: Record<string, { label: string; className: string }> = {
  planning: { label: 'Planning', className: 'bg-amber-100 text-amber-700' },
  active:   { label: 'Active',   className: 'bg-green-100 text-green-700' },
  closed:   { label: 'Closed',   className: 'bg-slate-100 text-slate-500' },
};

export function AddProjectDialog({ onClose, onAdded }: AddProjectDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const qc = useQueryClient();

  // Debounced search
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
    } catch (err) {
      console.error('Project search failed:', err);
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSelect = async (project: SearchResult) => {
    setAdding(project.sys_id);
    try {
      // Explicitly import ONLY the picked project into PGlite. Search is
      // read-only, so nothing else from the results list gets persisted.
      const imported = project.source === 'servicenow'
        ? await api.projects.import(project.sys_id)
        : project;
      // Pin into the visible list (filters may exclude it otherwise), then
      // invalidate queries to refresh.
      onAdded?.({ ...project, ...imported });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (err) {
      console.error('Failed to add project:', err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Add Project from ServiceNow</h3>
            <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by project number (PRJ...) or name..."
              className="w-full pl-11 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-blue-500 animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          {!hasSearched && !isSearching && (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Type at least 2 characters to search ServiceNow projects</p>
              <p className="text-xs mt-1 text-slate-300">Search by PRJ number or project name</p>
            </div>
          )}

          {hasSearched && results.length === 0 && !isSearching && (
            <div className="text-center py-12 text-slate-400">
              <FolderPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No projects found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs mt-1 text-slate-300">Try a different project number or name</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                {results.length} project{results.length !== 1 ? 's' : ''} found
              </p>
              {results.map(project => {
                const badge = STATE_BADGES[project.state] || STATE_BADGES.planning;
                return (
                  <button
                    key={project.sys_id}
                    onClick={() => handleSelect(project)}
                    disabled={adding === project.sys_id}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group disabled:opacity-60"
                  >
                    <div className="flex items-start gap-3">
                      {/* Color dot */}
                      <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: project.color || '#94a3b8' }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-medium text-slate-500">{project.number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          {project.source === 'servicenow' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              SN
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {project.short_description}
                        </p>
                        {project.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        {(project.start_date || project.end_date) && (
                          <p className="text-xs text-slate-400 mt-1.5">
                            {project.start_date?.split('T')[0]?.split(' ')[0]} &mdash; {project.end_date?.split('T')[0]?.split(' ')[0]}
                          </p>
                        )}
                      </div>

                      {/* Add indicator */}
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {adding === project.sys_id ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
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
      </div>
    </div>
  );
}
