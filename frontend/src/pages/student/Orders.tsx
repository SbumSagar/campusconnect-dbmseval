import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Database, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import { BarChartCard } from '../../components/charts/Charts';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Pagination, Segmented, Skeleton, StatusBadge, type Column,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { orderApi, studentApi } from '../../services/endpoints';
import type { OrderStatus, OrderSummary } from '../../types';
import { cn } from '../../utils/cn';
import { money, moneyCompact, smartDateTime } from '../../utils/format';

type Filter = 'ALL' | OrderStatus;

export default function StudentOrders() {
  useTitle('My Orders');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as Filter;
  const page = Number(params.get('page') ?? 1) || 1;
  const setStatus = (v: Filter) => setParams(v === 'ALL' ? {} : { status: v });
  const setPage = (p: number) => setParams({ ...(status !== 'ALL' && { status }), page: String(p) });

  const orders = useQuery({
    queryKey: ['my-orders', status, page],
    queryFn: () => orderApi.list({ status: status === 'ALL' ? undefined : status, page, pageSize: 12 }),
    placeholderData: keepPreviousData,
  });
  const spend = useQuery({ queryKey: ['my-spend'], queryFn: studentApi.spend });

  const columns: Column<OrderSummary>[] = [
    {
      key: 'order', header: 'Order',
      render: (o) => (
        <div className="flex items-center gap-3">
          <div className="hidden size-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600 sm:flex"><ShoppingBag className="size-4" /></div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{o.store_name}</p>
            <p className="text-xs text-slate-500">#{o.order_id} · {smartDateTime(o.ordered_at)}</p>
          </div>
        </div>
      ),
    },
    { key: 'summary', header: 'Items', hideOnMobile: true, render: (o) => <p className="max-w-xs truncate text-[13px] text-slate-600" title={o.summary}>{o.summary}</p> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'total', header: 'Total', align: 'right',
      render: (o) => <span className={cn('font-semibold tabular', o.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-900')}>{money(o.total_amount)}</span>,
    },
  ];

  const s = spend.data;
  return (
    <div className="space-y-6">
      <PageHeader title="My Orders" description="Order history, status and your cumulative spend."
        actions={<Link to="/student/stores"><Button icon={<ShoppingBag className="size-4" />}>New order</Button></Link>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Spending summary" icon={<Wallet className="size-4" />} />
          <div className="space-y-4 p-5">
            {spend.isLoading || !s ? <Skeleton className="h-24" /> : (
              <>
                <div>
                  <p className="text-xs font-medium text-slate-500">Total spend (non-cancelled)</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-navy-900 tabular">{money(s.stored_spend)}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.order_count} orders</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200/60">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700"><Database className="size-3.5" /> Database consistency check</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><p className="text-slate-500">Stored (trigger)</p><p className="font-semibold text-slate-800 tabular">{money(s.stored_spend)}</p></div>
                    <div><p className="text-slate-500">Recomputed (view)</p><p className="font-semibold text-slate-800 tabular">{money(s.computed_spend)}</p></div>
                  </div>
                  <div className="mt-2">
                    {s.is_consistent
                      ? <Badge tone="green"><CheckCircle2 className="size-3" /> Values match</Badge>
                      : <Badge tone="red">Mismatch</Badge>}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Spend by store" subtitle="Non-cancelled orders" icon={<Receipt className="size-4" />} />
          <div className="p-5">
            {spend.isLoading ? <Skeleton className="h-56" /> : s?.byStore.length ? (
              <BarChartCard horizontal height={Math.max(160, s.byStore.length * 34)} data={s.byStore} x="store_name"
                series={[{ key: 'spend', label: 'Spend' }]} fmt={(v) => money(v)} axisFmt={(v) => moneyCompact(v)} />
            ) : <EmptyState title="No spending yet" className="py-8" />}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="px-1 text-[15px] font-semibold text-navy-900">Order history</h3>
          <Segmented<Filter>
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'All' }, { value: 'PLACED', label: 'Placed' }, { value: 'PREPARING', label: 'Preparing' },
              { value: 'READY', label: 'Ready' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={orders.data?.rows}
          rowKey={(o) => o.order_id}
          loading={orders.isFetching}
          error={orders.error}
          onRetry={() => orders.refetch()}
          onRowClick={(o) => navigate(`/student/orders/${o.order_id}`)}
          empty={<EmptyState icon={<Receipt className="size-6" />} title="No orders" description="Orders you place will appear here." />}
        />
        {orders.data && <Pagination page={orders.data.page} pages={orders.data.pages} total={orders.data.total} pageSize={orders.data.pageSize} onPage={setPage} />}
      </Card>
    </div>
  );
}
