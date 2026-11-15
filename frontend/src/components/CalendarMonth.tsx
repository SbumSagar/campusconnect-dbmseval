import { useMemo } from 'react';
import {
  addDays, addMonths, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay,
  startOfMonth, startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEntry, EventType } from '../types';
import { cn } from '../utils/cn';
import { Button } from './ui';

export const TYPE_STYLE: Record<EventType, { chip: string; dot: string; label: string }> = {
  HOLIDAY: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100', dot: 'bg-emerald-500', label: 'Holiday' },
  EVENT: { chip: 'bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100', dot: 'bg-brand-500', label: 'Event' },
  EXAM: { chip: 'bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100', dot: 'bg-rose-500', label: 'Exam' },
};

/** Range of the visible 6-week grid for a month (used to query the API). */
export function monthGridRange(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  return { start, end: endOfDay(end) };
}

export function CalendarMonth({
  month, onMonthChange, entries, onSelect, selectedDay, onDayClick,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  entries: CalendarEntry[];
  onSelect: (e: CalendarEntry) => void;
  selectedDay?: Date | null;
  onDayClick?: (d: Date) => void;
}) {
  const { start, end } = monthGridRange(month);
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [start.getTime(), end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = (day: Date) =>
    entries.filter((e) => {
      const s = startOfDay(new Date(e.start_datetime));
      const f = e.end_datetime ? new Date(e.end_datetime) : new Date(e.start_datetime);
      return day >= s && day <= f;
    });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy-900">{format(month, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onMonthChange(new Date())}>Today</Button>
          <Button variant="secondary" size="sm" className="px-2" aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" className="px-2" aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const items = byDay(day);
            const inMonth = isSameMonth(day, month);
            const selected = selectedDay && isSameDay(day, selectedDay);
            return (
              <div
                key={i}
                onClick={() => onDayClick?.(day)}
                className={cn(
                  'min-h-20 border-slate-100 p-1.5 sm:min-h-28',
                  i % 7 !== 6 && 'border-r', i < days.length - 7 && 'border-b',
                  !inMonth && 'bg-slate-50/60', onDayClick && 'cursor-pointer hover:bg-brand-50/30',
                  selected && 'bg-brand-50/50 ring-2 ring-brand-400 ring-inset',
                )}
              >
                <div className="mb-1 flex justify-end">
                  <span className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs tabular',
                    isToday(day) ? 'bg-brand-600 font-semibold text-white' : inMonth ? 'text-slate-700' : 'text-slate-400',
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((e) => (
                    <button
                      key={e.title + e.start_datetime}
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onSelect(e); }}
                      title={e.title}
                      className={cn('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium ring-1 ring-inset transition', TYPE_STYLE[e.event_type].chip)}
                    >
                      <span className="hidden sm:inline">{e.title}</span>
                      <span className={cn('mx-auto block size-1.5 rounded-full sm:hidden', TYPE_STYLE[e.event_type].dot)} />
                    </button>
                  ))}
                  {items.length > 3 && <p className="px-1 text-[11px] font-medium text-slate-500">+{items.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {(Object.keys(TYPE_STYLE) as EventType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', TYPE_STYLE[t].dot)} /> {TYPE_STYLE[t].label}
          </span>
        ))}
      </div>
    </div>
  );
}
