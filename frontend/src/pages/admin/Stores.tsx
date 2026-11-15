import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, ChefHat, CheckCircle2, Clock, MapPin, Package, Pencil, Plus, Receipt, RotateCcw, Store as StoreIcon, Trash2,
  UtensilsCrossed, XCircle,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, Code, DataTable, DescriptionItem, Drawer, EmptyState, ErrorState, Field, IconButton, Input,
  LoadingBlock, Modal, PageHeader, Pagination, SearchInput, Segmented, Select, Skeleton, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useDebounce, useNow, useTitle } from '../../hooks';
import { orderApi, storeApi } from '../../services/endpoints';
import type { OrderStatus, OrderSummary, Store } from '../../types';
import { cn } from '../../utils/cn';
import { displayName, fmtDateTime, isOpenNow, money, smartDateTime, time12 } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Tab = 'stores' | 'orders';

export default function Stores() {
  useTitle('Campus Stores');
  const [tab, setTab] = useState<Tab>('stores');
  return (
    <div>
      <PageHeader
        title="Campus Stores"
        description="Manage outlets and their operating hours, and follow every order placed on campus."
        actions={<Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'stores', label: <><StoreIcon className="size-3.5" /> Stores</> },
          { value: 'orders', label: <><Receipt className="size-3.5" /> Orders</> },
        ]} />}
      />
      {tab === 'stores' ? <StoresTab /> : <OrdersTab />}
    </div>
  );
}

// =====================================================================
// Stores tab
// =====================================================================
function StoresTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useNow();
  const stores = useQuery({ queryKey: ['stores'], queryFn: storeApi.list });
  const [editing, setEditing] = useState<Store | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (name: string) => storeApi.remove(name),
    onSuccess: (_d, name) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      notifySuccess('Store deleted', name);
    },
    onError: (e) => notifyError(e, 'Could not delete the store'),
  });

  const askDelete = async (s: Store) => {
    const ok = await confirm({
      title: `Delete ${s.store_name}?`,
      message: (
        <div className="space-y-2">
          <p>Its menu items are removed with it (weak entity, <Code>ON DELETE CASCADE</Code>).</p>
          <p className="text-xs text-slate-500">If the store has any order history PostgreSQL refuses the delete - history is never cascaded away.</p>
        </div>
      ),
      confirmText: 'Delete store',
      tone: 'danger',
    });
    if (ok) remove.mutate(s.store_name);
  };

  if (stores.isLoading) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>;
  }
  if (stores.error) return <Card><ErrorState error={stores.error} onRetry={stores.refetch} /></Card>;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{stores.data?.length ?? 0} outlets</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add store</Button>
      </div>
      {!stores.data?.length ? (
        <Card><EmptyState icon={<StoreIcon className="size-6" />} title="No stores yet" action={<Button onClick={() => setEditing('new')}>Add the first store</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stores.data.map((s) => {
            const open = typeof s.is_open_now === "boolean" ? s.is_open_now : isOpenNow(s.opens_at, s.closes_at, now);
            return (
              <Card key={s.store_name} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <StoreIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-navy-900">{s.store_name}</h3>
                      <p className="truncate text-[13px] text-slate-500">{s.store_type ?? 'Store'}</p>
                    </div>
                  </div>
                  {open === null ? <Badge>Hours not set</Badge> : open ? <Badge tone="green" dot>Open now</Badge> : <Badge tone="gray" dot>Closed</Badge>}
                </div>
                <div className="mt-4 space-y-2 text-[13px] text-slate-600">
                  <p className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0 text-slate-400" /><span className="truncate">{s.location ?? '—'}</span></p>
                  <p className="flex items-center gap-2"><Clock className="size-3.5 shrink-0 text-slate-400" />{time12(s.opens_at)} – {time12(s.closes_at)}</p>
                  <p className="flex items-center gap-2">
                    <UtensilsCrossed className="size-3.5 shrink-0 text-slate-400" />
                    {s.available_count ?? 0} of {s.item_count ?? 0} items available
                    {s.min_price != null && <span className="text-slate-400">· from {money(s.min_price)}</span>}
                  </p>
                </div>
                {!!s.categories?.length && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.categories.slice(0, 5).map((c) => <Badge key={c} tone="gray">{c}</Badge>)}
                    {s.categories.length > 5 && <Badge tone="gray">+{s.categories.length - 5}</Badge>}
                  </div>
                )}
                <div className="min-h-5 flex-1" />
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Link to={`/admin/menu?store=${encodeURIComponent(s.store_name)}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">
                    Manage menu <ArrowRight className="size-3.5" />
                  </Link>
                  <div className="flex gap-0.5">
                    <IconButton label="Edit store" onClick={() => setEditing(s)}><Pencil className="size-4" /></IconButton>
                    <IconButton label="Delete store" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => askDelete(s)}><Trash2 className="size-4" /></IconButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <StoreModal store={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function StoreModal({ store, onClose }: { store: Store | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = store === 'new';
  const [form, setForm] = useState({ store_name: '', store_type: '', location: '', opens_at: '', closes_at: '' });

  useEffect(() => {
    if (store && store !== 'new') {
      setForm({ store_name: store.store_name, store_type: store.store_type ?? '', location: store.location ?? '', opens_at: store.opens_at ?? '', closes_at: store.closes_at ?? '' });
    } else if (store === 'new') {
      setForm({ store_name: '', store_type: '', location: '', opens_at: '', closes_at: '' });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: () => {
      const body = { store_type: form.store_type || null, location: form.location || null, opens_at: form.opens_at || null, closes_at: form.closes_at || null };
      return isNew ? storeApi.create({ store_name: form.store_name.trim(), ...body }) : storeApi.update((store as Store).store_name, body);
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      notifySuccess(isNew ? 'Store added' : 'Store updated', s.store_name);
      onClose();
    },
    onError: (e) => notifyError(e, 'Could not save the store'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isNew && !form.store_name.trim()) return notifyError(new Error('Store name is required'), 'Missing name');
    save.mutate();
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={!!store}
      onClose={onClose}
      title={isNew ? 'Add a store' : `Edit ${form.store_name}`}
      description={isNew ? 'The store name is the natural primary key and cannot be changed later.' : 'Update the store details and operating hours.'}
      icon={<StoreIcon className="size-4.5" />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="store-form" loading={save.isPending}>{isNew ? 'Add store' : 'Save changes'}</Button>
      </>}
    >
      <form id="store-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Store name" required className="sm:col-span-2" hint={!isNew ? 'Primary key - read-only' : undefined}>
          <Input value={form.store_name} onChange={set('store_name')} disabled={!isNew} maxLength={100} placeholder="e.g. Central Canteen" />
        </Field>
        <Field label="Type">
          <Input value={form.store_type} onChange={set('store_type')} maxLength={50} placeholder="e.g. Food Court" />
        </Field>
        <Field label="Location">
          <Input value={form.location} onChange={set('location')} maxLength={150} placeholder="Building / block" />
        </Field>
        <Field label="Opens at"><Input type="time" value={form.opens_at} onChange={set('opens_at')} /></Field>
        <Field label="Closes at" hint="May be after midnight (e.g. 03:00)."><Input type="time" value={form.closes_at} onChange={set('closes_at')} /></Field>
      </form>
    </Modal>
  );
}

// =====================================================================
// Orders tab
// =====================================================================
const STATUSES: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];

function OrdersTab() {
  const [store, setStore] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const search = useDebounce(q);
  const stores = useQuery({ queryKey: ['stores'], queryFn: storeApi.list });
  const orders = useQuery({
    queryKey: ['admin-orders', store, status, search, from, to, page],
    queryFn: () => orderApi.list({ store, status, q: search, from, to, page, pageSize: 15 }),
    placeholderData: (p) => p,
  });
  const reset = (fn: () => void) => { fn(); setPage(1); };

  const columns: Column<OrderSummary>[] = [
    { key: 'id', header: 'Order', render: (o) => <span className="font-mono text-[13px] font-medium text-slate-900">#{o.order_id}</span> },
    {
      key: 'student', header: 'Student', render: (o) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={o.student_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{displayName(o.student_name)}</p>
            <p className="font-mono text-[11px] text-slate-500">{o.student_id}</p>
          </div>
        </div>
      ),
    },
    { key: 'store', header: 'Store', hideOnMobile: true, render: (o) => <span className="whitespace-nowrap text-slate-700">{o.store_name}</span> },
    { key: 'summary', header: 'Items', hideOnMobile: true, render: (o) => <p className="max-w-[260px] truncate text-slate-500" title={o.summary}>{o.summary}</p> },
    { key: 'total', header: 'Total', align: 'right', render: (o) => <span className={cn('font-semibold tabular', o.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-900')}>{money(o.total_amount)}</span> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'time', header: 'Placed', hideOnMobile: true, render: (o) => <span className="text-[13px] whitespace-nowrap text-slate-500">{smartDateTime(o.ordered_at)}</span> },
  ];

  return (
    <Card>
      <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
        <SearchInput value={q} onChange={(v) => reset(() => setQ(v))} placeholder="Order #, student ID or name…" />
        <Select value={store} onChange={(e) => reset(() => setStore(e.target.value))} aria-label="Store">
          <option value="">All stores</option>
          {stores.data?.map((s) => <option key={s.store_name} value={s.store_name}>{s.store_name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </Select>
        <Input type="date" aria-label="From" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} className="xl:w-40" />
        <Input type="date" aria-label="To" value={to} onChange={(e) => reset(() => setTo(e.target.value))} className="xl:w-40" />
      </div>
      <DataTable
        columns={columns}
        rows={orders.data?.rows}
        rowKey={(o) => o.order_id}
        loading={orders.isFetching}
        error={orders.error}
        onRetry={orders.refetch}
        onRowClick={(o) => setOpenId(o.order_id)}
        empty={<EmptyState icon={<Receipt className="size-6" />} title="No orders found" description="Try different filters." />}
      />
      {orders.data && <Pagination {...orders.data} onPage={setPage} />}
      <OrderDrawer id={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: typeof ChefHat }>> = {
  PLACED: { to: 'PREPARING', label: 'Start preparing', icon: ChefHat },
  PREPARING: { to: 'READY', label: 'Mark ready', icon: Package },
  READY: { to: 'COMPLETED', label: 'Complete', icon: CheckCircle2 },
};

function OrderDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const order = useQuery({ queryKey: ['order', id], queryFn: () => orderApi.get(id!), enabled: id !== null });

  const setStatus = useMutation({
    mutationFn: (s: OrderStatus) => orderApi.setStatus(id!, s),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      const changed = r.spend.before !== r.spend.after;
      toast.success(`Order #${r.order.order_id}: ${r.previousStatus} → ${r.order.status}`, {
        description: changed
          ? `${r.spend.student_id} spend ${money(r.spend.before)} → ${money(r.spend.after)} (updated by trigger trg_order)`
          : `Student spend unchanged at ${money(r.spend.after)}`,
      });
    },
    onError: (e) => notifyError(e, 'Could not change the status'),
  });

  const o = order.data;
  const next = o ? NEXT[o.status] : undefined;
  const snapshotDiffers = o?.items.some((i) => Number(i.unit_price) !== Number(i.current_price));

  const cancel = async () => {
    if (await confirm({
      title: `Cancel order #${o!.order_id}?`,
      message: <p>The order keeps its own total, but trigger <Code>trg_order</Code> removes it from the student's spend. Its items become frozen (<Code>trg_item_frozen</Code>).</p>,
      confirmText: 'Cancel order', tone: 'danger',
    })) setStatus.mutate('CANCELLED');
  };

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      width="max-w-lg"
      title={id ? `Order #${id}` : ''}
      subtitle={o ? `${o.store_name} · ${fmtDateTime(o.ordered_at)}` : undefined}
      footer={o && (
        <div className="flex flex-wrap justify-end gap-2">
          {o.status === 'CANCELLED' ? (
            <Button icon={<RotateCcw className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate('PLACED')}>Reinstate order</Button>
          ) : (
            <>
              {o.status !== 'COMPLETED' && (
                <Button variant="secondary" className="text-rose-600" icon={<XCircle className="size-4" />} disabled={setStatus.isPending} onClick={cancel}>Cancel order</Button>
              )}
              {next && (
                <Button icon={<next.icon className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate(next.to)}>{next.label}</Button>
              )}
            </>
          )}
        </div>
      )}
    >
      {order.isLoading ? <LoadingBlock /> : order.error ? <ErrorState error={order.error} onRetry={order.refetch} /> : o && (
        <div className="space-y-6 p-5">
          <StatusTrack status={o.status} />
          <dl className="grid grid-cols-2 gap-4">
            <DescriptionItem label="Student">{displayName(o.student_name)}</DescriptionItem>
            <DescriptionItem label="Student ID"><span className="font-mono text-[13px]">{o.student_id}</span></DescriptionItem>
            <DescriptionItem label="Store">{o.store_name}</DescriptionItem>
            <DescriptionItem label="Location">{o.store_location ?? '—'}</DescriptionItem>
          </dl>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Line</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.items.map((i) => {
                  const diff = Number(i.unit_price) !== Number(i.current_price);
                  return (
                    <tr key={i.item_name}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{i.item_name}</p>
                        {i.category && <p className="text-xs text-slate-500">{i.category}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular">{i.quantity}</td>
                      <td className="px-2 py-2.5 text-right tabular">
                        <span className="text-slate-900">{money(i.unit_price)}</span>
                        {diff && <p className="text-[11px] text-amber-700">now {money(i.current_price)}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular">{money(i.line_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/60">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-[13px] text-slate-500">
                    Total <span className="text-[11px]">(ORDERS.total_amount, kept by <Code className="text-[10px]">trg_item</Code>)</span>
                  </td>
                  <td className={cn('px-4 py-2.5 text-right text-base font-semibold tabular', o.status === 'CANCELLED' && 'text-slate-400 line-through')}>{money(o.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {snapshotDiffers && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
              <p className="font-semibold">Price snapshot</p>
              <p className="mt-0.5 text-amber-800">The menu price changed after this order was placed. The order keeps the price paid (<Code>ORDER_ITEM.unit_price</Code>), so its total is unaffected.</p>
            </div>
          )}
          {o.status === 'CANCELLED' && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600 ring-1 ring-slate-200">
              Cancelled orders are not counted in the student's spend and their items are frozen by <Code>trg_item_frozen</Code>.
              Reinstating returns the total to the spend.
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function StatusTrack({ status }: { status: OrderStatus }) {
  const steps: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'COMPLETED'];
  if (status === 'CANCELLED') return <div className="flex items-center gap-2"><StatusBadge status="CANCELLED" /><span className="text-[13px] text-slate-500">This order was cancelled.</span></div>;
  const idx = steps.indexOf(status);
  return (
    <ol className="flex items-center">
      {steps.map((s, i) => (
        <li key={s} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
          <div className="flex flex-col items-center gap-1.5">
            <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-semibold',
              i <= idx ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>
              {i < idx ? <CheckCircle2 className="size-4" /> : i + 1}
            </span>
            <span className={cn('text-[11px] font-medium', i <= idx ? 'text-slate-800' : 'text-slate-400')}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
          </div>
          {i < steps.length - 1 && <div className={cn('mx-2 mb-5 h-0.5 flex-1 rounded', i < idx ? 'bg-brand-500' : 'bg-slate-200')} />}
        </li>
      ))}
    </ol>
  );
}
