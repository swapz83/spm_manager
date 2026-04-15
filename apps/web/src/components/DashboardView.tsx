'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useManagers } from '@/hooks/usePeople';
import { useFilters } from '@/lib/filters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  RadialBarChart, RadialBar,
} from 'recharts';
import { Users, FolderKanban, TrendingUp, AlertTriangle, SlidersHorizontal, Calendar } from 'lucide-react';
import { cn, getUtilizationColor, getUtilizationTextColor } from '@/lib/utils';

const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1', '#0EA5E9', '#D946EF'];

export function DashboardView() {
  const { applied, draft, setDraft, apply, changed: filtersChanged } = useFilters();
  const { data: managers } = useManagers();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', applied.manager, applied.startDate, applied.endDate, applied.includeSubOrgs],
    queryFn: () => api.dashboard.summary({
      manager: applied.manager || undefined,
      start_date: applied.startDate,
      end_date: applied.endDate,
      include_sub_orgs: applied.includeSubOrgs,
    }),
  });

  const handleApplyFilters = apply;

  // Filter card UI (always visible)
  const filterCard = (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Filters</h3>
      </div>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Team (Manager)</label>
          <select
            value={draft.manager}
            onChange={e => setDraft({ manager: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Teams</option>
            {managers?.map((m: any) => (
              <option key={m.sys_id} value={m.sys_id}>
                {m.first_name} {m.last_name}
              </option>
            ))}
          </select>
          <label className={cn(
            'flex items-center gap-1.5 mt-2 text-xs select-none',
            draft.manager ? 'text-slate-600 cursor-pointer' : 'text-slate-300 cursor-not-allowed'
          )}>
            <input
              type="checkbox"
              checked={draft.includeSubOrgs}
              disabled={!draft.manager}
              onChange={e => setDraft({ includeSubOrgs: e.target.checked })}
              className="rounded border-slate-300"
            />
            Include sub-orgs (whole team under manager)
          </label>
        </div>
        <div className="min-w-[160px]">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
            <Calendar className="w-3 h-3" /> Start Date
          </label>
          <input
            type="date"
            value={draft.startDate}
            onChange={e => setDraft({ startDate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
            <Calendar className="w-3 h-3" /> End Date
          </label>
          <input
            type="date"
            value={draft.endDate}
            onChange={e => setDraft({ endDate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <button
          onClick={handleApplyFilters}
          disabled={!filtersChanged}
          className={cn(
            'px-5 py-2 rounded-xl text-sm font-medium transition-colors',
            filtersChanged
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed',
          )}
        >
          Apply
        </button>
      </div>
    </div>
  );

  if (isLoading || !data) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {filterCard}
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const { utilization, projectStats, byDepartment, byTitle, overall } = data;

  // Utilization buckets for pie chart
  const utilBuckets = [
    { name: 'Unallocated (0%)', value: 0, color: '#CBD5E1' },
    { name: 'Under 50%', value: 0, color: '#10B981' },
    { name: '50-75%', value: 0, color: '#F59E0B' },
    { name: '76-100%', value: 0, color: '#3B82F6' },
    { name: 'Over-allocated', value: 0, color: '#EF4444' },
  ];
  utilization.forEach((u: any) => {
    const pct = u.total_allocation;
    if (pct === 0) utilBuckets[0].value++;
    else if (pct < 50) utilBuckets[1].value++;
    else if (pct <= 75) utilBuckets[2].value++;
    else if (pct <= 100) utilBuckets[3].value++;
    else utilBuckets[4].value++;
  });
  const activeBuckets = utilBuckets.filter(b => b.value > 0);

  // Top overloaded
  const overloaded = utilization.filter((u: any) => u.total_allocation > 80).slice(0, 5);
  const underutilized = utilization.filter((u: any) => u.total_allocation < 50 && u.total_allocation > 0);
  const unassigned = utilization.filter((u: any) => u.total_allocation === 0);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
      {filterCard}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="w-5 h-5" />} label="Total People" value={overall.total_people} color="blue" />
        <SummaryCard icon={<FolderKanban className="w-5 h-5" />} label="Active Projects" value={overall.total_projects} color="purple" />
        <SummaryCard icon={<TrendingUp className="w-5 h-5" />} label="Assignments" value={overall.total_assignments} color="emerald" />
        <SummaryCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Unassigned"
          value={unassigned.length}
          color={unassigned.length > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Project Headcount */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Team Size by Project</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={projectStats} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="short_description"
                width={160}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(value: any, name: any) => [value, name === 'headcount' ? 'People' : 'Total FTE %']}
              />
              <Bar dataKey="headcount" fill="#3B82F6" radius={[0, 6, 6, 0]} name="headcount" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Utilization Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Utilization Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={activeBuckets}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {activeBuckets.map((b, i) => (
                  <Cell key={i} fill={b.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-6">
        {/* By Department */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Avg. Utilization by Department</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byDepartment} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="department" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                formatter={(value: any) => [`${value}%`, 'Avg Utilization']}
              />
              <Bar dataKey="avg_utilization" radius={[6, 6, 0, 0]}>
                {byDepartment.map((d: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Skill Type */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Headcount by Role / Skill Type</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byTitle.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis type="category" dataKey="title" width={150} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                formatter={(value: any, name: any) => [value, name === 'people_count' ? 'People' : 'Avg Util %']}
              />
              <Bar dataKey="people_count" fill="#8B5CF6" radius={[0, 6, 6, 0]} name="people_count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* People detail tables */}
      <div className="grid grid-cols-2 gap-6">
        {/* High utilization */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Highest Utilization</h3>
          <div className="space-y-3">
            {overloaded.map((p: any) => (
              <div key={p.sys_id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.first_name} {p.last_name}</div>
                  <div className="text-xs text-slate-400">{p.title} &middot; {p.project_count} projects</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', getUtilizationColor(p.total_allocation))} style={{ width: `${Math.min(p.total_allocation, 100)}%` }} />
                  </div>
                  <span className={cn('text-xs font-bold w-10 text-right', getUtilizationTextColor(p.total_allocation))}>{p.total_allocation}%</span>
                </div>
              </div>
            ))}
            {overloaded.length === 0 && <p className="text-sm text-slate-400">No one above 80% utilization</p>}
          </div>
        </div>

        {/* Under-utilized */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Available Capacity</h3>
          <div className="space-y-3">
            {[...unassigned, ...underutilized].slice(0, 8).map((p: any) => (
              <div key={p.sys_id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.first_name} {p.last_name}</div>
                  <div className="text-xs text-slate-400">{p.title} &middot; {p.department}</div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-600">{100 - p.total_allocation}% free</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colorMap[color])}>
          {icon}
        </div>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
