'use client';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useManagers } from '@/hooks/usePeople';
import { useFilters } from '@/lib/filters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList, Label,
} from 'recharts';
import {
  Users, FolderKanban, TrendingUp, AlertTriangle,
  SlidersHorizontal, Download, FileDown, Loader2,
} from 'lucide-react';
import { cn, getInitials, getUtilizationColor, getUtilizationTextColor } from '@/lib/utils';
import { downloadChartPng, exportChartsToPptx } from '@/lib/chartExport';
import { DateRangePicker } from '@/components/DateRangePicker';

// Refined corporate chart palette
const CHART_COLORS = [
  '#1A56DB', '#4F46E5', '#0891B2', '#16A34A', '#D97706',
  '#DC2626', '#0F766E', '#9333EA', '#059669', '#B45309',
];

const SHADOW = 'shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-gray-100';

const tooltipStyle = {
  borderRadius: '10px',
  border: '1px solid #E5E7EB',
  boxShadow: '0 4px 16px rgba(17,24,39,0.10)',
  background: '#ffffff',
  fontSize: '12px',
};

/** Recharts YAxis tick with truncation + native SVG title tooltip */
function truncatedYTick(maxChars: number) {
  return function TruncatedTick(props: any) {
    const { x, y, payload, textAnchor } = props;
    const full = String(payload?.value ?? '');
    const short = full.length > maxChars ? full.slice(0, maxChars - 1) + '…' : full;
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={4} x={-6} textAnchor={textAnchor ?? 'end'} fontSize={11} fill="#9CA3AF">
          {short}
          <title>{full}</title>
        </text>
      </g>
    );
  };
}

export function DashboardView() {
  const { applied, draft, setDraft, apply, applyWith, changed: filtersChanged } = useFilters();
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

  const headcountRef   = useRef<HTMLDivElement>(null);
  const utilizationRef = useRef<HTMLDivElement>(null);
  const byDeptRef      = useRef<HTMLDivElement>(null);
  const byRoleRef      = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportPptx = async () => {
    const chartExports = [
      { title: 'Team Size by Project',           element: headcountRef.current },
      { title: 'Utilization Distribution',       element: utilizationRef.current },
      { title: 'Avg. Utilization by Department', element: byDeptRef.current },
      { title: 'Headcount by Role / Skill Type', element: byRoleRef.current },
    ];
    setExporting(true);
    try { await exportChartsToPptx(chartExports, 'Dashboard.pptx'); }
    catch (e) { console.error('Failed to export to PPTX:', e); }
    finally { setExporting(false); }
  };

  // ── Filter bar ─────────────────────────────────────────────────────────────
  const filterCard = (
    <div className={cn('bg-white rounded-2xl p-5', SHADOW)}>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-gray-400">Filters</span>
        </div>

        <div className="h-5 w-px bg-gray-100 flex-shrink-0" />

        {/* Manager */}
        <div className="flex-1 min-w-[180px] max-w-[260px]">
          <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
            Team (Manager)
          </label>
          <select
            value={draft.manager}
            onChange={e => setDraft({ manager: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Teams</option>
            {managers?.map((m: any) => (
              <option key={m.sys_id} value={m.sys_id}>
                {m.first_name} {m.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* Sub-orgs */}
        <div className="min-w-[160px]">
          <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
            Scope
          </label>
          <label className={cn(
            'flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-gray-50 select-none h-[34px]',
            draft.manager ? 'text-gray-700 cursor-pointer hover:bg-white' : 'text-gray-300 cursor-not-allowed'
          )}>
            <input
              type="checkbox"
              checked={draft.includeSubOrgs}
              disabled={!draft.manager}
              onChange={e => setDraft({ includeSubOrgs: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600"
            />
            <span className="text-xs">Include sub-orgs</span>
          </label>
        </div>

        {/* Date range picker */}
        <DateRangePicker
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={(s, e) => applyWith({ startDate: s, endDate: e })}
        />

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <button
            onClick={apply}
            disabled={!filtersChanged}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
              filtersChanged
                ? 'bg-[#1A56DB] text-white hover:bg-blue-700 shadow-sm'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed',
            )}
          >
            Apply
          </button>
          <button
            onClick={handleExportPptx}
            disabled={exporting}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5 border',
              exporting
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
            )}
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            Export PPT
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading || !data) {
    return (
      <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-5">
        {filterCard}
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-7 h-7 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-gray-400">Loading dashboard data…</p>
        </div>
      </div>
    );
  }

  const { utilization, projectStats, byDepartment, byTitle, overall } = data;

  // Utilization buckets
  const utilBuckets = [
    { name: 'Unallocated (0%)', value: 0, color: '#E5E7EB' },
    { name: 'Under 50%',        value: 0, color: '#FCD34D' },
    { name: '50 – 75%',         value: 0, color: '#34D399' },
    { name: '76 – 100%',        value: 0, color: '#60A5FA' },
    { name: 'Over-allocated',   value: 0, color: '#F87171' },
  ];
  utilization.forEach((u: any) => {
    const pct = u.total_allocation;
    if (pct === 0)       utilBuckets[0].value++;
    else if (pct < 50)   utilBuckets[1].value++;
    else if (pct <= 75)  utilBuckets[2].value++;
    else if (pct <= 100) utilBuckets[3].value++;
    else                 utilBuckets[4].value++;
  });
  const activeBuckets = utilBuckets.filter(b => b.value > 0);

  const overloaded    = utilization.filter((u: any) => u.total_allocation > 80).slice(0, 6);
  const underutilized = utilization.filter((u: any) => u.total_allocation < 50 && u.total_allocation > 0);
  const unassigned    = utilization.filter((u: any) => u.total_allocation === 0);

  // Formatted date range for subtitle
  const fmt = (d: string) => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-7 space-y-6">

      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-gray-900 leading-tight">
            Resource Dashboard
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {applied.startDate && applied.endDate
              ? `${fmt(applied.startDate)} – ${fmt(applied.endDate)}`
              : 'All time'}{' '}
            · {applied.manager ? 'Filtered team' : 'All Teams'}
          </p>
        </div>
      </div>

      {filterCard}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="w-4 h-4" />}
          label="Total People"
          value={overall.total_people}
          color="blue"
          sub="Active headcount"
        />
        <SummaryCard
          icon={<FolderKanban className="w-4 h-4" />}
          label="Active Projects"
          value={overall.total_projects}
          color="violet"
          sub="In-flight initiatives"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Assignments"
          value={overall.total_assignments}
          color="emerald"
          sub={`Avg ${overall.total_people ? (overall.total_assignments / overall.total_people).toFixed(1) : 0} per person`}
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Unassigned"
          value={unassigned.length}
          color={unassigned.length > 0 ? 'red' : 'emerald'}
          sub={unassigned.length > 0 ? 'Needs allocation' : 'Fully allocated'}
        />
      </div>

      {/* ── Charts Row 1 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        <div ref={headcountRef} className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <ChartHeader
            title="Team Size by Project"
            onDownload={() => downloadChartPng(headcountRef.current, 'Team Size by Project')}
          />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={[...projectStats].sort((a: any, b: any) => b.headcount - a.headcount).slice(0, 12)} layout="vertical" margin={{ left: 10, right: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="short_description" width={160} tick={truncatedYTick(20)} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F9FAFB' }}
                formatter={(v: any, n: any) => [v, n === 'headcount' ? 'People' : 'Total FTE %']} />
              <Bar dataKey="headcount" radius={[0, 6, 6, 0]} name="headcount">
                {projectStats.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                <LabelList dataKey="headcount" position="right" style={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div ref={utilizationRef} className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <ChartHeader
            title="Utilization Distribution"
            onDownload={() => downloadChartPng(utilizationRef.current, 'Utilization Distribution')}
          />
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={activeBuckets} cx="50%" cy="44%" innerRadius={76} outerRadius={116} paddingAngle={3} dataKey="value">
                {activeBuckets.map((b, i) => <Cell key={i} fill={b.color} stroke="none" />)}
                <Label
                  content={({ viewBox }: any) => {
                    const { cx, cy } = viewBox;
                    return (
                      <g>
                        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={32} fontWeight={700} fill="#111827">{overall.total_people}</text>
                        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#9CA3AF" letterSpacing="2">PEOPLE</text>
                      </g>
                    );
                  }}
                  position="center"
                />
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [`${v} people`, name]} />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#6B7280', paddingTop: '8px' }}
                iconType="circle"
                iconSize={8}
                formatter={(value, entry: any) => `${value}: ${entry.payload.value}`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts Row 2 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        <div ref={byDeptRef} className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <ChartHeader
            title="Avg. Utilization by Department"
            onDownload={() => downloadChartPng(byDeptRef.current, 'Avg. Utilization by Department')}
          />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byDepartment} layout="vertical" margin={{ left: 10, right: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="department" width={130} tick={truncatedYTick(16)} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F9FAFB' }}
                formatter={(v: any) => [`${v}%`, 'Avg Utilization']} />
              <Bar dataKey="avg_utilization" radius={[0, 6, 6, 0]}>
                {byDepartment.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                <LabelList dataKey="avg_utilization" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div ref={byRoleRef} className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <ChartHeader
            title="Headcount by Role / Skill Type"
            onDownload={() => downloadChartPng(byRoleRef.current, 'Headcount by Role / Skill Type')}
          />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byTitle.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="title" width={150} tick={truncatedYTick(18)} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F9FAFB' }}
                formatter={(v: any, n: any) => [v, n === 'people_count' ? 'People' : 'Avg Util %']} />
              <Bar dataKey="people_count" fill="#16A34A" radius={[0, 6, 6, 0]} name="people_count">
                <LabelList dataKey="people_count" position="right" style={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── People tables ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        {/* High utilization */}
        <div className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-bold text-gray-900">Highest Utilization</h3>
            {overloaded.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {overloaded.length} alerts
              </span>
            )}
          </div>
          <div className="space-y-4">
            {overloaded.map((p: any) => (
              <div key={p.sys_id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-[11px] font-bold text-red-600 flex-shrink-0">
                  {getInitials(p.first_name, p.last_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{p.first_name} {p.last_name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{p.title} · {p.project_count} project{p.project_count !== 1 ? 's' : ''}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', getUtilizationColor(p.total_allocation))} style={{ width: `${Math.min(p.total_allocation, 100)}%` }} />
                  </div>
                  <span className={cn('text-[12px] font-bold w-10 text-right tabular-nums', getUtilizationTextColor(p.total_allocation))}>
                    {p.total_allocation}%
                  </span>
                </div>
              </div>
            ))}
            {overloaded.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No one above 80% utilization</p>
            )}
          </div>
        </div>

        {/* Available capacity */}
        <div className={cn('bg-white rounded-2xl p-6', SHADOW)}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-bold text-gray-900">Available Capacity</h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {unassigned.length + underutilized.length} available
            </span>
          </div>
          <div className="space-y-4">
            {[...unassigned, ...underutilized].slice(0, 8).map((p: any) => (
              <div key={p.sys_id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-[11px] font-bold text-emerald-700 flex-shrink-0">
                  {getInitials(p.first_name, p.last_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{p.first_name} {p.last_name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{p.title} · {p.department}</div>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full tabular-nums flex-shrink-0">
                  {100 - p.total_allocation}% free
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChartHeader({ title, onDownload }: { title: string; onDownload: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-[13px] font-bold text-gray-900">{title}</h3>
      <button
        onClick={onDownload}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Download as PNG"
        aria-label={`Download ${title} as PNG`}
      >
        <Download className="w-3.5 h-3.5" />
        PNG
      </button>
    </div>
  );
}

function SummaryCard({
  icon, label, value, color, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  const cfg: Record<string, { iconBg: string; iconColor: string; border?: string; valColor?: string }> = {
    blue:    { iconBg: 'bg-blue-50',    iconColor: 'text-blue-600'    },
    violet:  { iconBg: 'bg-violet-50',  iconColor: 'text-violet-600'  },
    emerald: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    red:     { iconBg: 'bg-red-50',     iconColor: 'text-red-600',    border: 'border border-red-100', valColor: 'text-red-600' },
  };
  const { iconBg, iconColor, border, valColor } = cfg[color] ?? cfg.blue;

  return (
    <div className={cn('bg-white rounded-2xl p-[22px] flex flex-col justify-between min-h-[152px]', SHADOW, border)}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400">{label}</p>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
      <div>
        <p className={cn('text-[42px] font-extrabold tracking-[-0.04em] leading-none tabular-nums mt-4', valColor ?? 'text-gray-900')}>
          {value.toLocaleString()}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-2">{sub}</p>}
      </div>
    </div>
  );
}
