import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, ArrowRightLeft, BedDouble, CheckCircle2, Database, DoorOpen, History, LogOut, Search, UserRound, X,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardBody, CardHeader, Code, DataTable, EmptyState, ErrorState, Input,
  LoadingBlock, PageHeader, SearchInput, Select, Skeleton, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { allocationApi, hostelApi, roomApi, studentApi, type RoomSnapshot } from '../../services/endpoints';
import type { Allocation, Room, Student } from '../../types';
import { cn } from '../../utils/cn';
import { displayName, fmtDate, todayISO } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Mode = 'allocate' | 'transfer';

interface TransferResult {
  before: { from: RoomSnapshot; to: RoomSnapshot };
  after: { from: RoomSnapshot; to: RoomSnapshot };
  ended: Allocation;
  created: Allocation;
}

// ---------------------------------------------------------------- student picker
function StudentPicker({ onPick }: { onPick: (s: Student) => void }) {
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const list = useQuery({
    queryKey: ['students', 'picker', q],
    queryFn: () => studentApi.list({ q, pageSize: 8, page: 1 }),
    enabled: q.length >= 2,
  });
  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search a student by ID or name (min. 2 characters)…" />
      <div className="mt-3">
        {q.length < 2 ? (
          <p className="px-1 text-[13px] text-slate-500">Try <button className="font-medium text-brand-600 hover:underline" onClick={() => setSearch('DEMO')}>DEMO</button> for the synthetic demo accounts, or any roster ID / name.</p>
        ) : list.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} className="py-6" />
        ) : !list.data?.rows.length ? (
          <EmptyState icon={<Search className="size-6" />} title="No students found" className="py-8" />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
            {list.data.rows.map((s) => (
              <li key={s.student_id}>
                <button type="button" onClick={() => onPick(s)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-50/50">
                  <Avatar name={s.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{displayName(s.full_name)}</p>
                    <p className="font-mono text-xs text-slate-500">{s.student_id}</p>
                  </div>
                  {s.gender && <StatusBadge status={s.gender} className="hidden sm:inline-flex" />}
                  {s.hostel_name
                    ? <span className="text-xs text-slate-600"><span className="font-medium">{s.hostel_name}</span> <span className="font-mono">{s.room_no}</span></span>
                    : <Badge tone="amber">Unallocated</Badge>}
                  <ArrowRight className="size-4 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- room chooser
function RoomChooser({ studentId, value, onChange, exclude }: {
  studentId: string; value: Room | null; onChange: (r: Room | null) => void; exclude?: { hostel: string; room: string };
}) {
  const [hostel, setHostel] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const hostels = useQuery({ queryKey: ['hostels'], queryFn: hostelApi.list, staleTime: 60_000 });
  const rooms = useQuery({
    queryKey: ['rooms', 'available', studentId, hostel, q],
    queryFn: () => roomApi.available(studentId, hostel || undefined, q || undefined),
  });
  const list = (rooms.data ?? []).filter((r) => !(exclude && r.hostel_name === exclude.hostel && r.room_no === exclude.room));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={hostel} onChange={(e) => { setHostel(e.target.value); onChange(null); }} aria-label="Hostel">
          <option value="">All eligible hostels</option>
          {hostels.data?.map((h) => <option key={h.hostel_name} value={h.hostel_name}>{h.hostel_name} ({h.gender.toLowerCase()})</option>)}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Room number, e.g. B-2" />
      </div>
      <p className="text-xs text-slate-500">Only rooms in hostels matching the student's gender are listed, least occupied first. Room capacity is not modelled; occupancy is a counter.</p>
      {rooms.isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rooms.error ? (
        <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} className="py-6" />
      ) : !list.length ? (
        <EmptyState icon={<BedDouble className="size-6" />} title="No eligible rooms" description="Selecting a hostel of the other gender lists nothing - the gender rule is applied." className="py-8" />
      ) : (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-3 lg:grid-cols-4">
          {list.map((r) => {
            const sel = value?.hostel_name === r.hostel_name && value.room_no === r.room_no;
            return (
              <button key={`${r.hostel_name}-${r.room_no}`} type="button" onClick={() => onChange(r)}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-left ring-1 transition',
                  sel ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-brand-300',
                )}>
                <p className="font-mono text-sm font-semibold text-navy-900">{r.room_no}</p>
                <p className="mt-0.5 flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate">{r.hostel_name}</span>
                  <span className={cn('tabular', r.occupancy === 0 ? 'text-emerald-600' : 'text-slate-500')}>{r.occupancy === 0 ? 'empty' : `${r.occupancy} in`}</span>
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- transaction result
function OccupancyChange({ label, before, after }: { label: string; before: RoomSnapshot; after: RoomSnapshot }) {
  const delta = after.occupancy - before.occupancy;
  return (
    <div className="flex-1 rounded-xl bg-white p-4 ring-1 ring-emerald-200/70">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-navy-900">{after.hostel_name} <span className="font-mono">{after.room_no}</span></p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-2xl font-semibold text-slate-400 tabular">{before.occupancy}</span>
        <ArrowRight className="size-4 text-slate-400" />
        <span className="text-2xl font-semibold text-navy-900 tabular">{after.occupancy}</span>
        <Badge tone={delta < 0 ? 'amber' : 'green'}>{delta > 0 ? `+${delta}` : delta}</Badge>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">ROOM.occupancy</p>
    </div>
  );
}

function TransferResultPanel({ r, onClose }: { r: TransferResult; onClose: () => void }) {
  return (
    <div className="rounded-2xl bg-emerald-50/70 p-5 ring-1 ring-emerald-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><CheckCircle2 className="size-5" /></div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">Transaction committed</p>
            <p className="mt-0.5 text-[13px] text-emerald-800/80">Both statements ran inside one <Code>BEGIN … COMMIT</Code>; if either had failed, both would have rolled back.</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Dismiss" className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X className="size-4" /></button>
      </div>
      <ol className="mt-4 space-y-1.5 text-[13px] text-emerald-900">
        <li className="flex gap-2"><span className="font-mono text-emerald-600">1</span>
          <span><Code>UPDATE room_allocation SET status='ENDED', end_date='{r.ended.end_date}'</Code> for {r.ended.hostel_name} {r.ended.room_no}</span></li>
        <li className="flex gap-2"><span className="font-mono text-emerald-600">2</span>
          <span><Code>INSERT INTO room_allocation … 'ACTIVE'</Code> for {r.created.hostel_name} {r.created.room_no} from {fmtDate(r.created.start_date)}</span></li>
      </ol>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <OccupancyChange label="Old room" before={r.before.from} after={r.after.from} />
        <OccupancyChange label="New room" before={r.before.to} after={r.after.to} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-800/80">
        <Database className="size-3.5" /> Occupancy values were recomputed by the <Code>trg_alloc_occupancy</Code> trigger, not by the application.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function Allocations() {
  useTitle('Room Allocation');
  const [params, setParams] = useSearchParams();
  const studentId = params.get('student') ?? '';
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [date, setDate] = useState(todayISO());
  const [result, setResult] = useState<TransferResult | null>(null);

  useEffect(() => { setMode(null); setRoom(null); setResult(null); setDate(todayISO()); }, [studentId]);

  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => studentApi.detail(studentId), enabled: !!studentId });
  const history = useQuery({ queryKey: ['allocations', studentId], queryFn: () => allocationApi.history(studentId), enabled: !!studentId });
  const recent = useQuery({ queryKey: ['allocations', 'recent'], queryFn: () => allocationApi.recent(15) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['student', studentId] });
    qc.invalidateQueries({ queryKey: ['allocations'] });
    qc.invalidateQueries({ queryKey: ['students'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['hostels'] });
    qc.invalidateQueries({ queryKey: ['hostel'] });
  };

  const active = history.data?.find((a) => a.status === 'ACTIVE');

  const submit = useMutation({
    mutationFn: async () => {
      const body = { student_id: studentId, hostel_name: room!.hostel_name, room_no: room!.room_no, date };
      if (mode === 'transfer') return { kind: 'transfer' as const, data: await allocationApi.transfer(body) };
      return { kind: 'allocate' as const, data: await allocationApi.allocate(body) };
    },
    onSuccess: (r) => {
      if (r.kind === 'transfer') {
        setResult(r.data);
        notifySuccess('Student transferred', `${r.data.created.hostel_name} ${r.data.created.room_no}`);
      } else {
        notifySuccess('Room allocated', `${r.data.room.hostel_name} ${r.data.room.room_no} · occupancy now ${r.data.room.occupancy}`);
      }
      setMode(null);
      setRoom(null);
      refresh();
    },
    onError: (e) => notifyError(e, mode === 'transfer' ? 'Transfer failed - nothing was changed' : 'Allocation failed'),
  });

  const vacate = useMutation({
    mutationFn: () => allocationApi.vacate({ student_id: studentId, date }),
    onSuccess: (r) => {
      notifySuccess('Room vacated', `${r.room.hostel_name} ${r.room.room_no} · occupancy now ${r.room.occupancy}`);
      setResult(null);
      refresh();
    },
    onError: (e) => notifyError(e, 'Could not vacate'),
  });

  const askVacate = async () => {
    if (!active) return;
    const ok = await confirm({
      title: 'Vacate this room?',
      tone: 'danger',
      confirmText: 'Vacate',
      message: `The ACTIVE stay in ${active.hostel_name} ${active.room_no} will be ENDED on ${fmtDate(date)}. The stay stays in the history.`,
    });
    if (ok) vacate.mutate();
  };

  const s = student.data?.profile;

  const histCols: Column<Allocation>[] = [
    { key: 'hostel', header: 'Hostel', render: (a) => <span className="font-medium text-slate-900">{a.hostel_name}</span> },
    { key: 'room', header: 'Room', render: (a) => <span className="font-mono text-[13px]">{a.room_no}</span> },
    { key: 'from', header: 'From', render: (a) => fmtDate(a.start_date) },
    { key: 'to', header: 'To', render: (a) => (a.end_date ? fmtDate(a.end_date) : <span className="text-slate-400">Present</span>) },
    { key: 'days', header: 'Days', align: 'right', hideOnMobile: true, render: (a) => <span className="tabular">{a.days ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  const recentCols: Column<Allocation>[] = [
    {
      key: 'student', header: 'Student',
      render: (a) => (
        <button className="text-left" onClick={() => setParams({ student: a.student_id })}>
          <p className="font-medium text-slate-900 hover:text-brand-700">{displayName(a.full_name)}</p>
          <p className="font-mono text-xs text-slate-500">{a.student_id}</p>
        </button>
      ),
    },
    { key: 'room', header: 'Room', render: (a) => <span><span className="font-medium">{a.hostel_name}</span> <span className="font-mono text-xs text-slate-500">{a.room_no}</span></span> },
    { key: 'event', header: 'Event', render: (a) => (a.status === 'ENDED' ? <Badge tone="gray">Moved out</Badge> : <Badge tone="green">Moved in</Badge>) },
    { key: 'date', header: 'Date', align: 'right', render: (a) => fmtDate(a.event_date) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Room Allocation"
        description="Allocate, transfer and vacate students. A transfer is one atomic transaction; occupancy is maintained by trg_alloc_occupancy and one ACTIVE room per student by uq_one_active_allocation."
      />

      {!studentId ? (
        <Card>
          <CardHeader title="Choose a student" subtitle="Step 1 of 2" icon={<UserRound className="size-4" />} />
          <CardBody><StudentPicker onPick={(st) => setParams({ student: st.student_id })} /></CardBody>
        </Card>
      ) : student.isLoading || history.isLoading ? (
        <Card><LoadingBlock label="Loading student…" /></Card>
      ) : student.error || !s ? (
        <Card><ErrorState error={student.error} onRetry={() => student.refetch()} /></Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <Avatar name={s.full_name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/students/${encodeURIComponent(s.student_id)}`} className="text-lg font-semibold text-navy-900 hover:text-brand-700">
                    {displayName(s.full_name)}
                  </Link>
                  {s.gender && <StatusBadge status={s.gender} />}
                </div>
                <p className="font-mono text-sm text-slate-500">{s.student_id}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                <p className="text-xs text-slate-500">Current allocation</p>
                {active ? (
                  <p className="mt-0.5 text-sm font-semibold text-navy-900">{active.hostel_name} · <span className="font-mono">{active.room_no}</span>
                    <span className="ml-2 font-normal text-slate-500">since {fmtDate(active.start_date)}</span></p>
                ) : (
                  <p className="mt-0.5 text-sm font-semibold text-amber-700">No active room</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setParams({})}>Change student</Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
              {active ? (
                <>
                  <Button icon={<ArrowRightLeft className="size-4" />} variant={mode === 'transfer' ? 'subtle' : 'primary'}
                    onClick={() => { setMode(mode === 'transfer' ? null : 'transfer'); setRoom(null); }}>
                    Transfer to another room
                  </Button>
                  <Button variant="secondary" icon={<LogOut className="size-4" />} loading={vacate.isPending} onClick={askVacate}>Vacate</Button>
                </>
              ) : (
                <Button icon={<DoorOpen className="size-4" />} variant={mode === 'allocate' ? 'subtle' : 'primary'}
                  onClick={() => { setMode(mode === 'allocate' ? null : 'allocate'); setRoom(null); }}>
                  Allocate a room
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="alloc-date" className="text-[13px] text-slate-500">Effective date</label>
                <Input id="alloc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
              </div>
            </div>
          </Card>

          {result && <TransferResultPanel r={result} onClose={() => setResult(null)} />}

          {mode && (
            <Card className="ring-1 ring-brand-100">
              <CardHeader
                title={mode === 'transfer' ? 'Choose the new room' : 'Choose a room'}
                subtitle="Step 2 of 2"
                icon={<BedDouble className="size-4" />}
              />
              <CardBody className="space-y-5">
                <RoomChooser studentId={studentId} value={room} onChange={setRoom}
                  exclude={active ? { hostel: active.hostel_name, room: active.room_no } : undefined} />
                <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-[13px] text-slate-600">
                    {room ? (
                      mode === 'transfer' && active ? (
                        <span><strong className="text-slate-900">{active.hostel_name} {active.room_no}</strong> → <strong className="text-slate-900">{room.hostel_name} {room.room_no}</strong> on {fmtDate(date)} — ends the current stay and inserts the new one in a single transaction.</span>
                      ) : (
                        <span>Allocate <strong className="text-slate-900">{room.hostel_name} {room.room_no}</strong> from {fmtDate(date)}.</span>
                      )
                    ) : 'Select a room above.'}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setMode(null); setRoom(null); }}>Cancel</Button>
                    <Button disabled={!room} loading={submit.isPending} onClick={() => submit.mutate()}>
                      {mode === 'transfer' ? 'Confirm transfer' : 'Confirm allocation'}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Allocation history" subtitle="All stays of this student (ROOM_ALLOCATION)" icon={<History className="size-4" />} />
            <DataTable columns={histCols} rows={history.data} rowKey={(a) => `${a.hostel_name}-${a.room_no}-${a.start_date}`}
              error={history.error} onRetry={() => history.refetch()}
              empty={<EmptyState icon={<BedDouble className="size-6" />} title="No allocations yet" />} />
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Recent allocation activity" subtitle="Latest move-ins and move-outs across all hostels" icon={<History className="size-4" />} />
        <DataTable columns={recentCols} rows={recent.data} loading={recent.isLoading} error={recent.error} onRetry={() => recent.refetch()}
          rowKey={(a) => `${a.student_id}-${a.hostel_name}-${a.room_no}-${a.start_date}-${a.status}`} dense />
      </Card>
    </div>
  );
}
