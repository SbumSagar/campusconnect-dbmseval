import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { BedDouble, Building2, CalendarClock, History, Info, Layers, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '../../components/ui';
import { useTitle } from '../../hooks';
import { studentApi } from '../../services/endpoints';
import { cn } from '../../utils/cn';
import { displayName, fmtDate, number } from '../../utils/format';

export default function StudentHostel() {
  useTitle('My Hostel');
  const q = useQuery({ queryKey: ['my-allocations'], queryFn: studentApi.allocations });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { current, history, roommates } = q.data;
  const active = history.find((h) => h.status === 'ACTIVE');
  const wing = current.room_no?.split('-')[0];

  return (
    <div className="space-y-6">
      <PageHeader title="My Hostel" description="Your current room, room-mates and full stay history." />

      {active ? (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[1.1fr_1fr]">
            <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-navy-800 p-6 text-white sm:p-8">
              <div className="pointer-events-none absolute -right-10 -bottom-16 size-64 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <StatusBadge status="ACTIVE" className="bg-white/15 text-white ring-white/20" />
                  <Badge className="bg-white/15 text-white ring-white/20">{current.hostel_type}</Badge>
                </div>
                <p className="mt-6 text-sm text-brand-100">Hostel</p>
                <h2 className="text-3xl font-semibold tracking-tight">{current.hostel_name}</h2>
                <div className="mt-6 flex items-end gap-8">
                  <div>
                    <p className="text-sm text-brand-100">Room</p>
                    <p className="font-mono text-4xl font-semibold">{current.room_no}</p>
                  </div>
                  <div>
                    <p className="text-sm text-brand-100">Floor</p>
                    <p className="text-4xl font-semibold">{current.floor_no === 0 ? 'G' : current.floor_no}</p>
                  </div>
                  {wing && (
                    <div>
                      <p className="text-sm text-brand-100">Wing</p>
                      <p className="text-4xl font-semibold">{wing}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-100">
              {[
                { icon: CalendarClock, label: 'Allocated since', value: fmtDate(active.start_date) },
                { icon: History, label: 'Days in this room', value: number(differenceInCalendarDays(new Date(), new Date(active.start_date))) },
                { icon: ShieldCheck, label: 'Warden', value: current.warden_name ?? '—' },
                { icon: Layers, label: 'Floor', value: current.floor_no === 0 ? 'Ground floor' : `Floor ${current.floor_no}` },
              ].map((s) => (
                <div key={s.label} className="bg-white p-5">
                  <s.icon className="size-4.5 text-slate-400" />
                  <p className="mt-3 text-xs font-medium text-slate-500">{s.label}</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-navy-900">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<BedDouble className="size-6" />} title="You don't have an active room"
            description="Room allocation is handled by the hostel office. Contact your warden if this looks wrong." />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Room-mates" subtitle="Students in the same room" icon={<Users className="size-4" />} />
          {roommates.length ? (
            <ul className="divide-y divide-slate-100">
              {roommates.map((r) => (
                <li key={r.student_id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={r.full_name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{displayName(r.full_name)}</p>
                    <p className="font-mono text-xs text-slate-500">{r.student_id}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<UserRound className="size-6" />} title={active ? 'Single occupancy' : 'No room'} description={active ? 'Nobody else is allocated to your room.' : undefined} className="py-10" />
          )}
          <div className="m-4 flex gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
            Room changes are made by the hostel office. Transfers run as one database transaction so your old stay ends exactly when the new one starts.
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Stay history" subtitle="Every allocation recorded in ROOM_ALLOCATION" icon={<History className="size-4" />} />
          {history.length ? (
            <ol className="relative px-5 py-4">
              {history.map((h, i) => (
                <li key={`${h.hostel_name}-${h.room_no}-${h.start_date}`} className="relative flex gap-4 pb-6 last:pb-1">
                  {i < history.length - 1 && <span className="absolute top-9 bottom-0 left-[19px] w-px bg-slate-200" />}
                  <div className={cn('z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                    h.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    <Building2 className="size-4.5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-navy-900">{h.hostel_name} · <span className="font-mono">{h.room_no}</span></p>
                      <StatusBadge status={h.status} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      {fmtDate(h.start_date)} – {h.end_date ? fmtDate(h.end_date) : 'present'}
                      <span className="mx-1.5 text-slate-300">•</span>
                      {number(h.days ?? 0)} days · {h.floor_no === 0 ? 'Ground floor' : `Floor ${h.floor_no}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="No allocations recorded" />}
        </Card>
      </div>
    </div>
  );
}
