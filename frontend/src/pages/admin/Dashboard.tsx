import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle, BedDouble, Building2, CalendarDays, ClipboardCheck, DoorOpen, FileClock, FlaskConical, IndianRupee,
  Receipt, ShoppingBag, Users,
} from 'lucide-react';
import { TYPE_STYLE } from '../../components/CalendarMonth';
import { BarChartCard, STATUS_COLORS } from '../../components/charts/Charts';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Meter, PageHeader, Skeleton, StatCard, StatusBadge,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useTitle } from '../../hooks';
import { adminApi } from '../../services/endpoints';
import { cn } from '../../utils/cn';
import { dateRange, displayName, money, moneyCompact, number, smartDateTime } from '../../utils/format';

export default function AdminDashboard() {
  useTitle('Admin Dashboard');
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard, refetchInterval: 60_000 });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const t = d?.totals;
  const v = (k: string) => (t ? number(t[k]) : '…');
  const revenue14 = d?.ordersDaily.reduce((s, x) => s + Number(x.revenue), 0) ?? 0;
  const orders14 = d?.ordersDaily.reduce((s, x) => s + Number(x.orders), 0) ?? 0;
  const outpassTotal = d?.outpassStatus.reduce((s, x) => s + x.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Signed in as ${user?.name}. Every figure below is queried live from PostgreSQL.`}
        actions={<>
          <Link to="/admin/reports"><Button variant="secondary" icon={<Receipt className="size-4" />}>Reports</Button></Link>
          <Link to="/admin/integrity"><Button icon={<FlaskConical className="size-4" />}>Integrity Lab</Button></Link>
        </>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered students" value={v('students')} icon={<Users className="size-5" />} to="/admin/students"
          sub={t ? `${number(t.male_students)} male · ${number(t.female_students)} female` : ' '} />
        <StatCard label="Hostels · rooms" value={t ? `${t.hostels} · ${number(t.rooms)}` : '…'} icon={<Building2 className="size-5" />} accent="sky" to="/admin/hostels"
          sub={t ? `${Math.round((t.occupied_rooms / Math.max(1, t.rooms)) * 100)}% of rooms in use` : ' '} />
        <StatCard label="Active allocations" value={v('active_allocations')} icon={<BedDouble className="size-5" />} accent="green" to="/admin/allocations"
          sub={t ? `${number(t.unallocated_students)} students without a room` : ' '} />
        <StatCard label="Campus store sales" value={t ? money(t.sales) : '…'} icon={<IndianRupee className="size-5" />} accent="violet" to="/admin/stores"
          sub={t ? `${number(t.orders)} orders · ${money(t.sales_7d)} in 7 days` : ' '} />
        <StatCard label="Pending outpasses" value={v('outpass_pending')} icon={<DoorOpen className="size-5" />} accent="amber" to="/admin/outpasses"
          sub={t ? `${number(t.outpass_approved)} approved · ${number(t.outpass_rejected)} rejected` : ' '} />
        <StatCard label="Overdue returns" value={v('outpass_overdue')} icon={<AlertTriangle className="size-5" />} accent={t?.outpass_overdue ? 'red' : 'green'} to="/admin/outpasses"
          sub="v_overdue_outpass" />
        <StatCard label="Documents to verify" value={v('documents_pending')} icon={<FileClock className="size-5" />} accent="amber" to="/admin/documents"
          sub={t ? `of ${number(t.documents)} uploaded` : ' '} />
        <StatCard label="Open store orders" value={v('open_orders')} icon={<ShoppingBag className="size-5" />} accent="blue" to="/admin/stores"
          sub={t ? `${number(t.upcoming_events)} upcoming calendar entries` : ' '} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Store revenue · last 14 days" icon={<IndianRupee className="size-4" />}
            subtitle={d ? `${money(revenue14)} from ${number(orders14)} non-cancelled orders` : 'Loading…'} />
          <div className="p-5">
            {d ? (
              <BarChartCard data={d.ordersDaily} x="day" series={[{ key: 'revenue', label: 'Revenue' }]} height={250}
                fmt={(x) => money(x)} axisFmt={(x) => moneyCompact(x)} labelFmt={(l) => format(new Date(l), 'd MMM')} />
            ) : <Skeleton className="h-[250px]" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Outpass requests" subtitle={`${number(outpassTotal)} total by status`} icon={<ClipboardCheck className="size-4" />}
            actions={<Link to="/admin/outpasses" className="text-[13px] font-medium text-brand-600">Manage</Link>} />
          <div className="space-y-4 p-5">
            {d ? d.outpassStatus.map((s) => (
              <div key={s.status}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <StatusBadge status={s.status} />
                  <span className="font-semibold text-slate-800 tabular">{s.count} <span className="text-xs font-normal text-slate-400">({Math.round((s.count / Math.max(1, outpassTotal)) * 100)}%)</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(s.count / Math.max(1, outpassTotal)) * 100}%`, background: STATUS_COLORS[s.status] }} />
                </div>
              </div>
            )) : <Skeleton className="h-40" />}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Hostel occupancy" subtitle="From v_hostel_occupancy (ROOM.occupancy is trigger-maintained)" icon={<Building2 className="size-4" />}
            actions={<Link to="/admin/hostels" className="text-[13px] font-medium text-brand-600">All hostels</Link>} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-2.5 text-left">Hostel</th>
                  <th className="px-4 py-2.5 text-right">Residents</th>
                  <th className="px-4 py-2.5 text-right">Rooms</th>
                  <th className="hidden px-4 py-2.5 text-left sm:table-cell">Rooms in use</th>
                  <th className="px-5 py-2.5 text-right">Avg / room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d ? d.hostels.map((h) => {
                  const pct = (h.occupied_rooms / Math.max(1, h.total_rooms)) * 100;
                  return (
                    <tr key={h.hostel_name} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link to={`/admin/hostels/${encodeURIComponent(h.hostel_name)}`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700">
                          {h.hostel_name} <StatusBadge status={h.gender} />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular">{number(h.residents)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular">{number(h.total_rooms)}</td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <div className="flex items-center gap-3">
                          <Meter value={h.occupied_rooms} max={h.total_rooms} tone={pct > 95 ? 'amber' : 'blue'} className="w-32" />
                          <span className="text-xs text-slate-500 tabular">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600 tabular">{Number(h.avg_per_room).toFixed(2)}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={5} className="p-5"><Skeleton className="h-40" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue by store" subtitle="All non-cancelled orders" icon={<ShoppingBag className="size-4" />} />
          <div className="p-5">
            {d ? <BarChartCard horizontal height={Math.max(220, d.stores.length * 34)} data={d.stores} x="store_name"
              series={[{ key: 'revenue', label: 'Revenue' }]} fmt={(x) => money(x)} axisFmt={(x) => moneyCompact(x)} /> : <Skeleton className="h-64" />}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Awaiting review" subtitle="Oldest departures first" icon={<DoorOpen className="size-4" />}
            actions={<Link to="/admin/outpasses" className="text-[13px] font-medium text-brand-600">Review</Link>} />
          {d?.pendingOutpasses.length ? (
            <ul className="divide-y divide-slate-100">
              {d.pendingOutpasses.map((o) => (
                <li key={o.request_id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{displayName(o.student_name)}</p>
                    <Badge tone="amber">#{o.request_id}</Badge>
                  </div>
                  <p className="truncate text-xs text-slate-500">{o.reason}</p>
                  <p className="mt-0.5 text-xs text-slate-400">Leaves {smartDateTime(o.out_at)}</p>
                </li>
              ))}
            </ul>
          ) : d ? <EmptyState title="All caught up" description="No pending outpass requests." className="py-10" /> : <div className="p-5"><Skeleton className="h-40" /></div>}
        </Card>
        <Card>
          <CardHeader title="Latest orders" icon={<Receipt className="size-4" />}
            actions={<Link to="/admin/stores?tab=orders" className="text-[13px] font-medium text-brand-600">All orders</Link>} />
          {d ? (
            <ul className="divide-y divide-slate-100">
              {d.recentOrders.map((o) => (
                <li key={o.order_id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{o.store_name}</p>
                    <p className="truncate text-xs text-slate-500">{displayName(o.student_name)} · {smartDateTime(o.ordered_at)}</p>
                  </div>
                  <p className={cn('text-sm font-semibold tabular', o.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-900')}>{money(o.total_amount)}</p>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><Skeleton className="h-40" /></div>}
        </Card>
        <Card>
          <CardHeader title="Upcoming on campus" icon={<CalendarDays className="size-4" />}
            actions={<Link to="/admin/calendar" className="text-[13px] font-medium text-brand-600">Calendar</Link>} />
          {d ? (
            <ul className="divide-y divide-slate-100">
              {d.upcoming.map((e) => (
                <li key={e.title + e.start_datetime} className="flex gap-3 px-5 py-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TYPE_STYLE[e.event_type].dot)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                    <p className="truncate text-xs text-slate-500">{dateRange(e.start_datetime, e.end_datetime)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><Skeleton className="h-40" /></div>}
        </Card>
      </div>
    </div>
  );
}
