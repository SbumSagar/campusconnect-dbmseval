import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfDay, format, isSameDay, startOfDay, startOfMonth } from 'date-fns';
import { CalendarDays, CalendarPlus, Clock, KeyRound, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { CalendarMonth, monthGridRange, TYPE_STYLE } from '../../components/CalendarMonth';
import {
  Button, Card, CardHeader, Code, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, SearchInput,
  Segmented, Skeleton, Textarea, useConfirm,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { calendarApi } from '../../services/endpoints';
import type { CalendarEntry, EventType } from '../../types';
import { cn } from '../../utils/cn';
import { dateRange, fromLocalInput, toLocalInput } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type TypeFilter = 'ALL' | EventType;
type View = 'month' | 'list';

function EntryModal({ open, onClose, entry }: { open: boolean; onClose: () => void; entry: CalendarEntry | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    title: entry?.title ?? '',
    event_type: entry?.event_type ?? ('EVENT' as EventType),
    description: entry?.description ?? '',
    start: toLocalInput(entry?.start_datetime ?? new Date(new Date().setHours(9, 0, 0, 0))),
    end: toLocalInput(entry?.end_datetime ?? null),
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body: CalendarEntry = {
        title: form.title.trim(), event_type: form.event_type, description: form.description.trim() || null,
        start_datetime: fromLocalInput(form.start), end_datetime: form.end ? fromLocalInput(form.end) : null,
      };
      return entry ? calendarApi.update({ title: entry.title, start: entry.start_datetime }, body) : calendarApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      notifySuccess(entry ? 'Entry updated' : 'Entry added');
      onClose();
    },
    onError: (e) => notifyError(e, 'Could not save entry'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setErr('Title is required.');
    if (!form.start) return setErr('Start date/time is required.');
    setErr(null);
    save.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Edit calendar entry' : 'New calendar entry'}
      description="Primary key: (title, start_datetime)" icon={<CalendarPlus className="size-4.5" />}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cal-form" loading={save.isPending}>{entry ? 'Save changes' : 'Add entry'}</Button></>}>
      <form id="cal-form" onSubmit={submit} className="space-y-4">
        <Field label="Title" required error={err}><Input value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Mid-Semester Examinations" /></Field>
        <Field label="Type" required>
          <div className="grid grid-cols-3 gap-2">
            {(['HOLIDAY', 'EVENT', 'EXAM'] as EventType[]).map((t) => (
              <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, event_type: t }))}
                className={cn('focus-ring flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium ring-1 transition',
                  form.event_type === t ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300')}>
                <span className={cn('size-2 rounded-full', TYPE_STYLE[t].dot)} />{TYPE_STYLE[t].label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" required><Input type="datetime-local" value={form.start} onChange={set('start')} /></Field>
          <Field label="Ends" hint="Optional. Must not be before the start (chk_calendar_dates)."><Input type="datetime-local" value={form.end} onChange={set('end')} /></Field>
        </div>
        <Field label="Description"><Textarea value={form.description} onChange={set('description')} maxLength={2000} /></Field>
      </form>
    </Modal>
  );
}

export default function CalendarPage({ editable }: { editable: boolean }) {
  useTitle(editable ? 'Calendar Management' : 'Campus Calendar');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [view, setView] = useState<View>('month');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [type, setType] = useState<TypeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [editing, setEditing] = useState<{ entry: CalendarEntry | null } | null>(null);
  const q = useDebounce(search, 250);

  const range = useMemo(() => {
    if (view === 'month') {
      const r = monthGridRange(month);
      return { from: r.start.toISOString(), to: r.end.toISOString() };
    }
    return {
      from: from ? startOfDay(new Date(from)).toISOString() : undefined,
      to: to ? endOfDay(new Date(to)).toISOString() : undefined,
    };
  }, [view, month, from, to]);

  const list = useQuery({
    queryKey: ['calendar', range, type, q],
    queryFn: () => calendarApi.list({ ...range, type: type === 'ALL' ? undefined : type, q }),
  });

  const remove = useMutation({
    mutationFn: (e: CalendarEntry) => calendarApi.remove({ title: e.title, start: e.start_datetime }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setSelected(null);
      notifySuccess('Entry deleted');
    },
    onError: (e) => notifyError(e),
  });

  const entries = list.data ?? [];
  const now = new Date();
  const upcoming = entries.filter((e) => new Date(e.end_datetime ?? e.start_datetime) >= now).slice(0, 8);
  const dayEntries = day ? entries.filter((e) => {
    const s = startOfDay(new Date(e.start_datetime));
    const f = new Date(e.end_datetime ?? e.start_datetime);
    return day >= s && day <= f;
  }) : null;
  const sideList = dayEntries ?? upcoming;

  const del = async (e: CalendarEntry) => {
    if (await confirm({ title: `Delete "${e.title}"?`, message: 'This removes the entry from the campus calendar.', confirmText: 'Delete', tone: 'danger' })) remove.mutate(e);
  };

  const EntryRow = ({ e }: { e: CalendarEntry }) => (
    <button type="button" onClick={() => setSelected(e)} className="flex w-full gap-3 px-5 py-3 text-left transition hover:bg-slate-50">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TYPE_STYLE[e.event_type].dot)} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
        <p className="text-xs text-slate-500">{dateRange(e.start_datetime, e.end_datetime)}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={editable ? 'Calendar Management' : 'Campus Calendar'}
        description="Holidays, campus events and examinations for the academic year."
        actions={<>
          <Segmented<View> value={view} onChange={setView} options={[
            { value: 'month', label: <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Month</span> },
            { value: 'list', label: <span className="flex items-center gap-1.5"><List className="size-3.5" />List</span> },
          ]} />
          {editable && <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ entry: null })}>New entry</Button>}
        </>}
      />

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <Segmented<TypeFilter> value={type} onChange={setType} options={[
          { value: 'ALL', label: 'All types' }, { value: 'HOLIDAY', label: 'Holidays' }, { value: 'EVENT', label: 'Events' }, { value: 'EXAM', label: 'Exams' },
        ]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search by title…" className="lg:w-64" />
        {view === 'list' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-40" />
            <span className="text-slate-400">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-40" />
          </div>
        )}
      </Card>

      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : view === 'month' ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <Card className="p-4 sm:p-5">
            <CalendarMonth month={month} onMonthChange={(m) => { setMonth(startOfMonth(m)); setDay(null); }} entries={entries}
              onSelect={setSelected} selectedDay={day} onDayClick={(d) => setDay(day && isSameDay(d, day) ? null : d)} />
          </Card>
          <Card className="self-start">
            <CardHeader title={day ? format(day, 'EEEE, d MMMM') : 'Upcoming'} subtitle={day ? `${sideList.length} entr${sideList.length === 1 ? 'y' : 'ies'}` : 'Next entries in this view'}
              actions={day && <button className="text-[13px] font-medium text-brand-600" onClick={() => setDay(null)}>Clear</button>} />
            {list.isLoading ? <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              : sideList.length ? <div className="divide-y divide-slate-100">{sideList.map((e) => <EntryRow key={e.title + e.start_datetime} e={e} />)}</div>
                : <EmptyState title="Nothing here" description={day ? 'No entries on this day.' : 'No upcoming entries this month.'} className="py-10" />}
          </Card>
        </div>
      ) : (
        <Card>
          {list.isLoading ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            : entries.length ? (
              <ul className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <li key={e.title + e.start_datetime} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-slate-50 py-1.5 ring-1 ring-slate-200/70">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{format(new Date(e.start_datetime), 'MMM')}</span>
                      <span className="text-base leading-tight font-semibold text-navy-900">{format(new Date(e.start_datetime), 'd')}</span>
                    </div>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(e)}>
                      <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                      <p className="truncate text-xs text-slate-500">{dateRange(e.start_datetime, e.end_datetime)}{e.description ? ` · ${e.description}` : ''}</p>
                    </button>
                    <span className={cn('hidden rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset sm:inline', TYPE_STYLE[e.event_type].chip)}>{TYPE_STYLE[e.event_type].label}</span>
                    {editable && (
                      <div className="flex gap-1">
                        <IconButton label="Edit" onClick={() => setEditing({ entry: e })}><Pencil className="size-4" /></IconButton>
                        <IconButton label="Delete" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => del(e)}><Trash2 className="size-4" /></IconButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={<CalendarDays className="size-6" />} title="No entries" description="Nothing matches these filters." />}
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} size="sm" title={selected?.title}
        icon={selected && <span className={cn('size-3 rounded-full', TYPE_STYLE[selected.event_type].dot)} />}
        footer={editable && selected ? <>
          <Button variant="secondary" className="text-rose-600" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => del(selected)}>Delete</Button>
          <Button icon={<Pencil className="size-4" />} onClick={() => { setEditing({ entry: selected }); setSelected(null); }}>Edit</Button>
        </> : <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
        {selected && (
          <div className="space-y-4">
            <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TYPE_STYLE[selected.event_type].chip)}>{TYPE_STYLE[selected.event_type].label}</span>
            <p className="flex items-start gap-2 text-sm text-slate-700"><Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />{dateRange(selected.start_datetime, selected.end_datetime)}</p>
            {selected.description && <p className="text-sm leading-relaxed text-slate-600">{selected.description}</p>}
            {editable && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><KeyRound className="size-3.5" /> Key: <Code>({selected.title}, {selected.start_datetime})</Code></p>
            )}
          </div>
        )}
      </Modal>

      {editing && <EntryModal key={editing.entry?.title ?? 'new'} open onClose={() => setEditing(null)} entry={editing.entry} />}
    </div>
  );
}
