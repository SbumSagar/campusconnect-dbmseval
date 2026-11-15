import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Clock, Info, MapPin, Store } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader, StatusBadge, useConfirm } from '../../components/ui';
import { useTitle } from '../../hooks';
import { orderApi } from '../../services/endpoints';
import type { OrderStatus } from '../../types';
import { cn } from '../../utils/cn';
import { fmtDateTime, money } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

const FLOW: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'COMPLETED'];

export default function StudentOrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  useTitle(`Order #${id}`);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['order', orderId], queryFn: () => orderApi.get(orderId), enabled: Number.isFinite(orderId) });

  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(orderId),
    onSuccess: (res) => {
      qc.setQueryData(['order', orderId], res.order);
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-spend'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Order cancelled', `Your total spend changed ${money(res.spend.before)} → ${money(res.spend.after)} (trigger trg_order).`);
    },
    onError: (e) => notifyError(e, 'Could not cancel'),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const cancellable = o.status === 'PLACED' || o.status === 'PREPARING';
  const step = FLOW.indexOf(o.status);
  const priceChanged = o.items.some((i) => Number(i.current_price) !== Number(i.unit_price));

  const doCancel = async () => {
    const ok = await confirm({
      title: `Cancel order #${o.order_id}?`,
      message: <>The order keeps its total of <b>{money(o.total_amount)}</b>, but it will no longer count towards your spend and its items become frozen.</>,
      confirmText: 'Cancel order', cancelText: 'Keep order', tone: 'danger',
    });
    if (ok) cancel.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'My Orders', to: '/student/orders' }, { label: `#${o.order_id}` }]}
        title={<span className="flex flex-wrap items-center gap-3">Order #{o.order_id} <StatusBadge status={o.status} /></span>}
        description={`Placed ${fmtDateTime(o.ordered_at)}`}
        actions={cancellable && <Button variant="secondary" className="text-rose-600" icon={<Ban className="size-4" />} loading={cancel.isPending} onClick={doCancel}>Cancel order</Button>}
      />

      {o.status !== 'CANCELLED' ? (
        <Card className="p-5">
          <ol className="grid grid-cols-4 gap-2">
            {FLOW.map((s, i) => (
              <li key={s} className="flex flex-col items-center gap-2 text-center">
                <div className="flex w-full items-center">
                  <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= step ? 'bg-brand-500' : 'bg-slate-200')} />
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-slate-100 text-slate-400')}>
                    {i < step ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={cn('h-0.5 flex-1', i === FLOW.length - 1 ? 'bg-transparent' : i < step ? 'bg-brand-500' : 'bg-slate-200')} />
                </div>
                <span className={cn('text-xs font-medium', i <= step ? 'text-navy-900' : 'text-slate-400')}>
                  {s === 'READY' ? 'Ready' : s.charAt(0) + s.slice(1).toLowerCase()}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <div className="flex gap-3 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
          <Ban className="mt-0.5 size-4.5 shrink-0 text-slate-500" />
          This order was cancelled. Its items are frozen by the trigger <code className="font-mono text-[12px]">trg_item_frozen</code> and its total no longer counts towards your spend.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Items" subtitle={`${o.items.length} line${o.items.length > 1 ? 's' : ''} in ORDER_ITEM`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-2.5 text-left">Item</th>
                  <th className="px-4 py-2.5 text-right">Unit price</th>
                  <th className="px-4 py-2.5 text-center">Qty</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.items.map((i) => (
                  <tr key={i.item_name}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{i.item_name}</p>
                      <p className="text-xs text-slate-500">{i.category}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular">
                      {money(i.unit_price)}
                      {Number(i.current_price) !== Number(i.unit_price) && (
                        <p className="text-[11px] text-amber-700">now {money(i.current_price)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center tabular">{i.quantity}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900 tabular">{money(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-5 py-4 text-right text-sm font-medium text-slate-600">Order total</td>
                  <td className="px-5 py-4 text-right text-lg font-semibold text-navy-900 tabular">{money(o.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {priceChanged && (
            <div className="m-4 flex gap-2.5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200/70">
              <Info className="mt-0.5 size-4 shrink-0" />
              Some menu prices have changed since this order. Your order keeps the price snapshot stored in ORDER_ITEM.unit_price.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Store" icon={<Store className="size-4" />} />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-base font-semibold text-navy-900">{o.store_name}</p>
            <Badge tone="gray">{o.store_type}</Badge>
            <p className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />{o.store_location}</p>
            <p className="flex items-start gap-2 text-slate-600"><Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />{fmtDateTime(o.ordered_at)}</p>
            <div className="border-t border-slate-100 pt-3">
              <Link to={`/student/stores?store=${encodeURIComponent(o.store_name)}`}>
                <Button variant="secondary" size="sm" className="w-full">Order again from this store</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
