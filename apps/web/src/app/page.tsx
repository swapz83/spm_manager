'use client';
import { useState, useCallback } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { Header } from '@/components/Header';
import { ProjectCard } from '@/components/ProjectCard';
import { PersonChip, PersonChipOverlay } from '@/components/PersonChip';
import { AllocationDialog } from '@/components/AllocationDialog';
import { AddProjectDialog } from '@/components/AddProjectDialog';
import { PeopleView } from '@/components/PeopleView';
import { useProjects } from '@/hooks/useProjects';
import { usePeople } from '@/hooks/usePeople';
import { useCreateAssignment } from '@/hooks/useAssignments';
import { Plus, Search, Filter } from 'lucide-react';

export default function Dashboard() {
  const [view, setView] = useState<'board' | 'people'>('board');
  const [activePerson, setActivePerson] = useState<any>(null);
  const [pendingDrop, setPendingDrop] = useState<{ person: any; project: any } | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState<string>('all');

  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: people, isLoading: loadingPeople } = usePeople();
  const createAssignment = useCreateAssignment();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const person = event.active.data.current?.person;
    if (person) setActivePerson(person);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActivePerson(null);
    const { active, over } = event;
    if (!over) return;

    const person = active.data.current?.person;
    const project = over.data.current?.project;
    if (!person || !project) return;

    const currentAlloc = person.total_allocation || 0;
    const maxAlloc = 100 - currentAlloc;
    if (maxAlloc <= 0) return;

    setPendingDrop({ person, project });
  }, []);

  const handleConfirmAllocation = useCallback(async (allocation: number) => {
    if (!pendingDrop) return;
    await createAssignment.mutateAsync({
      resource: pendingDrop.person.sys_id,
      project: pendingDrop.project.sys_id,
      allocation_pct: allocation,
    });
    setPendingDrop(null);
  }, [pendingDrop, createAssignment]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const departments = people ? [...new Set(people.map((p: any) => p.department).filter(Boolean))] : [];
  const filteredPeople = people?.filter((p: any) => {
    const matchesSearch = searchQuery === '' ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = filterDept === 'all' || p.department === filterDept;
    return matchesSearch && matchesDept;
  });

  const isLoading = loadingProjects || loadingPeople;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm text-slate-500">Loading resources...</span>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen">
        <Header view={view} onViewChange={setView} />

        {view === 'board' ? (
          <div className="max-w-[1600px] mx-auto px-6 py-6">
            <div className="flex gap-6">
              {/* Project Board */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold text-slate-800">
                    Projects <span className="text-sm font-normal text-slate-400">({projects?.length || 0})</span>
                  </h2>
                  <button
                    onClick={() => setShowAddProject(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Project
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {projects?.map((project: any) => (
                    <ProjectCard key={project.sys_id} project={project} />
                  ))}
                </div>
              </div>

              {/* People Sidebar */}
              <div className="w-80 flex-shrink-0">
                <div className="sticky top-20">
                  <h2 className="text-lg font-semibold text-slate-800 mb-4">
                    People <span className="text-sm font-normal text-slate-400">({filteredPeople?.length || 0})</span>
                  </h2>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search people..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  </div>

                  <div className="relative mb-4">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                      value={filterDept}
                      onChange={e => setFilterDept(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
                    >
                      <option value="all">All Departments</option>
                      {departments.map(d => (
                        <option key={d as string} value={d as string}>{d as string}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                    {filteredPeople?.map((person: any) => (
                      <PersonChip
                        key={person.sys_id}
                        person={person}
                        isSelected={selectedPeople.has(person.sys_id)}
                        onSelect={toggleSelect}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-[1600px] mx-auto px-6 py-6">
            <PeopleView />
          </div>
        )}
      </div>

      <DragOverlay>
        {activePerson ? <PersonChipOverlay person={activePerson} /> : null}
      </DragOverlay>

      {pendingDrop && (
        <AllocationDialog
          person={pendingDrop.person}
          project={pendingDrop.project}
          maxAllocation={100 - (pendingDrop.person.total_allocation || 0)}
          onConfirm={handleConfirmAllocation}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {showAddProject && <AddProjectDialog onClose={() => setShowAddProject(false)} />}
    </DndContext>
  );
}
