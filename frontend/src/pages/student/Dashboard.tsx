import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowRight, BedDouble, CalendarDays, DoorOpen, FileCheck2, FileUp, MapPin, Receipt, ShoppingBag, Wallet,
} from 'lucide-react';
import { TYPE_STYLE } from '../../components/CalendarMonth';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatCard, StatusBadge } from '../../components/ui';
import { useTitle } from '../../hooks';
import { studentApi } from '../../services/endpoints';
import { cn } from '../../utils/cn';
import { dateRange, displayName, fmtDate, money, smartDateTime } from '../../utils/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function StudentDashboard() {
  useTitle('Dashboard');
  const q = useQuery({ queryKey: ['student-dashboard'], queryFn: studentApi.dashboard });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const p = d?.profile;
  const docsTotal = d ? d.stats.docs_pending + d.stats.docs_verified + d.stats.docs_rejected : 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-7 text-white shadow-card sm:px-8">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="pointer-events-none absolute right-40 -bottom-28 size-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-brand-200">{greeting()},</p>
            {p ? (
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{displayName(p.full_name)}</h1>
            ) : <Skeleton className="mt-2 h-8 w-56 bg-white/10" />}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-slate-300">
              <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[12px] text-white">{p?.student_id ?? '—'}</span>
              {p?.program && <span>{p.program}</span>}
              {p?.email && <span className="hidden text-slate-400 sm:inline">· {p.email}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10">
              <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase"><BedDouble className="size-3.5" /> Residence</p>
              {p?.hostel_name ? (
                <>
                  <p className="mt-1 text-base font-semibold">{p.hostel_name} · {p.room_no}</p>
                  <p className="text-xs text-slate-400">Floor {p.floor_no} · since {fmtDate(p.allocated_since)}</p>
                </>
              ) : <p className="mt-1 text-sm text-slate-300">{q.isLoading ? '…' : 'Not allocated'}</p>}
            </div>
            <div className="rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10">
              <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase"><Wallet className="size-3.5" /> Total spend</p>
              <p className="mt-1 text-base font-semibold tabular">{p ? money(p.total_deductions_amount) : '…'}</p>
              <p className="text-xs text-slate-400">non-cancelled orders</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Orders placed" icon={<Receipt className="size-5" />} to="/student/orders"
          value={d ? d.stats.orders_active : '…'} sub={d ? `${d.stats.orders_open} in progress · ${d.stats.orders_total - d.stats.orders_active} cancelled` : ' '} />
        <StatCard label="Spent this month" icon={<Wallet className="size-5" />} accent="green" to="/student/orders"
          value={d ? money(d.stats.spend_this_month) : '…'} sub="Maintained by database triggers" />
        <StatCard label="Pending outpasses" icon={<DoorOpen className="size-5" />} accent="amber" to="/student/outpass"
          value={d ? d.stats.outpass_pending : '…'} sub={d ? `${d.stats.outpass_open} approved & open` : ' '} />
        <StatCard label="Documents verified" icon={<FileCheck2 className="size-5" />} accent="violet" to="/student/documents"
          value={d ? `${d.stats.docs_verified}/${docsTotal}` : '…'}
          sub={d ? `${d.stats.docs_pending} pending · ${d.stats.docs_rejected} rejected` : ' '} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent orders */}
        <Card className="lg:col-span-3">
          <CardHeader title="Recent orders" subtitle="Your latest campus store orders" icon={<ShoppingBag className="size-4" />}
            actions={<Link to="/student/orders" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">View all</Link>} />
          {q.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : d?.recentOrders.length ? (
            <ul className="divide-y divide-slate-100">
              {d.recentOrders.map((o) => (
                <li key={o.order_id}>
                  <Link to={`/student/orders/${o.order_id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <ShoppingBag className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{o.store_name}</p>
                      <p className="text-xs text-slate-500">#{o.order_id} · {smartDateTime(o.ordered_at)}</p>
                    </div>
                    <StatusBadge status={o.status} className="hidden sm:inline-flex" />
                    <p className={cn('w-20 text-right text-sm font-semibold tabular', o.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-900')}>
                      {money(o.total_amount)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShoppingBag className="size-6" />} title="No orders yet" description="Browse the campus stores to place your first order."
              action={<Link to="/student/stores"><Button size="sm">Browse stores</Button></Link>} />
          )}
        </Card>

        {/* Upcoming */}
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming on campus" subtitle="Holidays, events and exams" icon={<CalendarDays className="size-4" />}
            actions={<Link to="/student/calendar" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">Calendar</Link>} />
          {q.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : d?.upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {d.upcoming.map((e) => (
                <li key={e.title + e.start_datetime} className="flex gap-3.5 px-5 py-3">
                  <div className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-slate-50 py-1.5 ring-1 ring-slate-200/70">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">{format(new Date(e.start_datetime), 'MMM')}</span>
                    <span className="text-base leading-tight font-semibold text-navy-900">{format(new Date(e.start_datetime), 'd')}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={cn('size-1.5 rounded-full', TYPE_STYLE[e.event_type].dot)} />
                      {TYPE_STYLE[e.event_type].label} · {dateRange(e.start_datetime, e.end_datetime)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing scheduled" description="No upcoming entries in the campus calendar." />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Active outpasses" subtitle="Pending requests and approved outpasses not yet closed" icon={<DoorOpen className="size-4" />}
            actions={<Link to="/student/outpass" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">Manage</Link>} />
          {d?.activeOutpasses.length ? (
            <ul className="divide-y divide-slate-100">
              {d.activeOutpasses.map((o) => (
                <li key={o.request_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{o.reason}</p>
                    <p className="text-xs text-slate-500">{smartDateTime(o.out_at)} → {smartDateTime(o.return_by)}</p>
                  </div>
                  {o.is_overdue && <Badge tone="red" dot>Overdue</Badge>}
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<DoorOpen className="size-6" />} title="No active outpasses" description="Going off campus? Raise a request in advance." className="py-10" />
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Quick actions" />
          <div className="grid gap-2 p-4">
            {[
              { to: '/student/stores', icon: ShoppingBag, title: 'Order from a campus store', text: 'Canteens, cafés and the general store', tone: 'bg-orange-50 text-orange-600' },
              { to: '/student/outpass', icon: DoorOpen, title: 'Request an outpass', text: 'Leave campus with warden approval', tone: 'bg-amber-50 text-amber-600' },
              { to: '/student/documents', icon: FileUp, title: 'Upload a document', text: 'Fee receipts, certificates, ID proof', tone: 'bg-violet-50 text-violet-600' },
              { to: '/student/hostel', icon: MapPin, title: 'View my room', text: 'Allocation details and history', tone: 'bg-brand-50 text-brand-600' },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="group flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-slate-50">
                <div className={cn('flex size-10 items-center justify-center rounded-xl', a.tone)}><a.icon className="size-4.5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.text}</p>
                </div>
                <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
