'use client';
import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── helpers ─── */
function pad(n: number) { return String(n).padStart(2, '0'); }

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function endOfMonthDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtShort(iso: string, currentYear: number): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}${y !== currentYear ? `, ${y}` : ''}`;
}

/* ─── presets ─── */
interface Preset { label: string; start: string; end: string; }

function buildPresets(): Preset[] {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const todayISO = toISO(today);
  return [
    { label: 'This month',   start: `${y}-${pad(m)}-01`,  end: `${y}-${pad(m)}-${endOfMonthDay(y, m)}` },
    { label: `Q1 ${y}`,      start: `${y}-01-01`,          end: `${y}-03-31` },
    { label: `Q2 ${y}`,      start: `${y}-04-01`,          end: `${y}-06-30` },
    { label: `Q3 ${y}`,      start: `${y}-07-01`,          end: `${y}-09-30` },
    { label: `Q4 ${y}`,      start: `${y}-10-01`,          end: `${y}-12-31` },
    { label: `H1 ${y}`,      start: `${y}-01-01`,          end: `${y}-06-30` },
    { label: `H2 ${y}`,      start: `${y}-07-01`,          end: `${y}-12-31` },
    { label: `FY ${y}`,      start: `${y}-01-01`,          end: `${y}-12-31` },
    { label: 'Rest of year', start: todayISO,               end: `${y}-12-31` },
  ];
}

/* ─── calendar grid ─── */
interface CalDay { iso: string; day: number; thisMonth: boolean; }

function buildCalGrid(year: number, month: number): CalDay[] {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = endOfMonthDay(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const daysInPrev = endOfMonthDay(prevYear, prevMonth);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;

  const cells: CalDay[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ iso: `${prevYear}-${pad(prevMonth)}-${pad(d)}`, day: d, thisMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${pad(month)}-${pad(d)}`, day: d, thisMonth: true });
  }
  const total = Math.ceil(cells.length / 7) * 7;
  for (let d = 1; cells.length < total; d++) {
    cells.push({ iso: `${nextYear}-${pad(nextMonth)}-${pad(d)}`, day: d, thisMonth: false });
  }
  return cells;
}

/* ─── component ─── */
export interface DateRangePickerProps {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  /** Called when the user confirms a selection (Apply click or preset). */
  onChange: (start: string, end: string) => void;
  className?: string;
}

export function DateRangePicker({ startDate, endDate, onChange, className }: DateRangePickerProps) {
  const today = new Date();
  const todayISO = toISO(today);
  const currentYear = today.getFullYear();

  const [open, setOpen] = useState(false);

  // Working state inside the popover (uncommitted until Apply)
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd,   setLocalEnd]   = useState(endDate);
  const [hoverDay,   setHoverDay]   = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'picking-end'>('idle');

  // Calendar view
  const [calYear,  setCalYear]  = useState<number>(() => startDate ? Number(startDate.split('-')[0]) : currentYear);
  const [calMonth, setCalMonth] = useState<number>(() => startDate ? Number(startDate.split('-')[1]) : today.getMonth() + 1);

  const containerRef = useRef<HTMLDivElement>(null);
  const presets = buildPresets();

  /* ── open / close ── */
  const openPicker = () => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
    setPhase('idle');
    setHoverDay(null);
    if (startDate) {
      setCalYear(Number(startDate.split('-')[0]));
      setCalMonth(Number(startDate.split('-')[1]));
    }
    setOpen(true);
  };

  // Click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  /* ── calendar nav ── */
  const prevMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  /* ── day click ── */
  const handleDayClick = (iso: string) => {
    if (phase === 'idle') {
      setLocalStart(iso);
      setLocalEnd('');
      setPhase('picking-end');
    } else {
      let s = localStart, e = iso;
      if (e < s) [s, e] = [e, s];
      setLocalStart(s);
      setLocalEnd(e);
      setPhase('idle');
    }
  };

  /* ── day styling ── */
  function getDayClass(iso: string, thisMonth: boolean): string {
    // Resolve effective range (hover preview during picking-end)
    const eff = (() => {
      if (phase === 'picking-end' && hoverDay) {
        const s = hoverDay < localStart ? hoverDay : localStart;
        const e = hoverDay < localStart ? localStart : hoverDay;
        return { start: s, end: e };
      }
      return { start: localStart, end: localEnd };
    })();

    const isStart   = iso === eff.start;
    const isEnd     = iso === eff.end && eff.end !== '';
    const inRange   = eff.start && eff.end && iso > eff.start && iso < eff.end;
    const isToday   = iso === todayISO;
    const notThisM  = !thisMonth;

    return cn(
      'h-8 flex items-center justify-center text-[12px] font-medium cursor-pointer transition-colors select-none',
      notThisM && 'text-gray-200 pointer-events-none',
      !notThisM && !isStart && !isEnd && !inRange && 'text-gray-700 hover:bg-gray-100 rounded-md',
      isToday  && !isStart && !isEnd && 'font-bold text-[#1A56DB]',
      inRange  && 'bg-blue-50 text-blue-700 rounded-none',
      isStart  && isEnd    && 'bg-[#1A56DB] text-white rounded-md',
      isStart  && !isEnd   && 'bg-[#1A56DB] text-white rounded-l-md rounded-r-none',
      isEnd    && !isStart && 'bg-[#1A56DB] text-white rounded-r-md rounded-l-none',
    );
  }

  /* ── apply / cancel ── */
  const apply = () => {
    if (localStart && localEnd) onChange(localStart, localEnd);
    setOpen(false);
  };

  /* ── active preset detection ── */
  const activePreset = presets.find(p => p.start === localStart && p.end === localEnd);

  /* ── trigger label ── */
  const triggerLabel = startDate && endDate
    ? `${fmtShort(startDate, currentYear)} → ${fmtShort(endDate, currentYear)}`
    : 'Select range…';

  const calGrid = buildCalGrid(calYear, calMonth);
  const calMonthLabel = `${MONTH_NAMES[calMonth - 1]} ${calYear}`;

  return (
    <div ref={containerRef} className={cn('relative flex-shrink-0', className)}>
      {/* ── Trigger ── */}
      <div>
        <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
          Date Range
        </label>
        <button
          type="button"
          onClick={openPicker}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm transition-colors whitespace-nowrap',
            open
              ? 'border-[#1A56DB] ring-2 ring-blue-100 bg-white text-gray-700'
              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white hover:border-gray-300',
          )}
        >
          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="font-medium">{triggerLabel}</span>
          <ChevronDown className={cn('w-3 h-3 text-gray-400 flex-shrink-0 ml-0.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {/* ── Popover ── */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-[60] w-[308px] bg-white rounded-xl border border-gray-200 shadow-[0_8px_32px_rgba(17,24,39,0.14),0_2px_8px_rgba(17,24,39,0.08)] overflow-hidden"
          onMouseLeave={() => setHoverDay(null)}
        >
          {/* From / To strip */}
          <div className="flex items-stretch px-4 py-3 border-b border-gray-100 gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">From</div>
              <div className={cn('text-[13px] font-semibold truncate', localStart ? 'text-gray-900' : 'text-gray-300')}>
                {localStart ? fmtShort(localStart, currentYear) : '—'}
              </div>
            </div>
            <div className="flex items-center text-gray-300 text-sm px-1">→</div>
            <div className="flex-1 min-w-0 text-right">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">To</div>
              <div className={cn('text-[13px] font-semibold truncate', localEnd ? 'text-gray-900' : phase === 'picking-end' ? 'text-blue-400' : 'text-gray-300')}>
                {localEnd
                  ? fmtShort(localEnd, currentYear)
                  : phase === 'picking-end'
                    ? (hoverDay ? fmtShort(hoverDay >= localStart ? hoverDay : localStart, currentYear) : 'Click end…')
                    : '—'}
              </div>
            </div>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2.5 border-b border-gray-100 bg-gray-50/80">
            {presets.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setLocalStart(preset.start);
                  setLocalEnd(preset.end);
                  setPhase('idle');
                  setCalYear(Number(preset.start.split('-')[0]));
                  setCalMonth(Number(preset.start.split('-')[1]));
                }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all leading-none',
                  activePreset?.label === preset.label
                    ? 'bg-[#1A56DB] border-[#1A56DB] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-[#1A56DB]',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="px-3 pt-3 pb-2">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[13px] font-bold text-gray-800">{calMonthLabel}</span>
              <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* DOW headers */}
            <div className="grid grid-cols-7 mb-0.5">
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} className="h-6 flex items-center justify-center text-[10px] font-bold text-gray-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {calGrid.map(({ iso, day, thisMonth }) => (
                <div
                  key={iso}
                  className={getDayClass(iso, thisMonth)}
                  onClick={() => thisMonth && handleDayClick(iso)}
                  onMouseEnter={() => phase === 'picking-end' && thisMonth && setHoverDay(iso)}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-3 pb-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!localStart || !localEnd}
              className={cn(
                'flex-[2] py-2 text-[13px] font-semibold rounded-lg transition-colors',
                localStart && localEnd
                  ? 'bg-[#1A56DB] text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed',
              )}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
