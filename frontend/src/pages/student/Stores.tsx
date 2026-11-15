import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Clock, Coffee, CupSoda, Database, MapPin, Minus, Moon, PenLine, Plus, Receipt, ShoppingBag,
  ShoppingCart, Soup, Store as StoreIcon, Trash2, UtensilsCrossed, Pizza,
} from 'lucide-react';
import {
  Badge, Button, Card, Drawer, EmptyState, ErrorState, Modal, PageHeader, SearchInput, Segmented, Skeleton, useConfirm,
} from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useDebounce, useNow, useTitle } from '../../hooks';
import { menuApi, orderApi, storeApi, type SpendChange } from '../../services/endpoints';
import type { MenuItem, OrderDetail, Store } from '../../types';
import { cn } from '../../utils/cn';
import { isOpenNow, money, time12 } from '../../utils/format';
import { notifyError } from '../../utils/notify';

const STORE_ICONS: [RegExp, typeof StoreIcon, string][] = [
  [/late|night/i, Moon, 'bg-indigo-50 text-indigo-600'],
  [/bever|juice/i, CupSoda, 'bg-emerald-50 text-emerald-600'],
  [/caf/i, Coffee, 'bg-amber-50 text-amber-700'],
  [/fast/i, Pizza, 'bg-rose-50 text-rose-600'],
  [/south/i, Soup, 'bg-orange-50 text-orange-600'],
  [/station/i, PenLine, 'bg-sky-50 text-sky-600'],
  [/general/i, ShoppingBag, 'bg-violet-50 text-violet-600'],
  [/food/i, UtensilsCrossed, 'bg-brand-50 text-brand-600'],
];
export const storeVisual = (type?: string | null) =>
  STORE_ICONS.find(([re]) => re.test(type ?? '')) ?? ([/./, StoreIcon, 'bg-slate-100 text-slate-600'] as const);

/** Open now? The database's answer (fn_store_is_open, campus time) wins; the browser clock is a fallback. */
export function storeOpen(store?: Store | null): boolean {
  if (!store) return false;
  if (typeof store.is_open_now === 'boolean') return store.is_open_now;
  return isOpenNow(store.opens_at, store.closes_at) ?? true;
}

function OpenBadge({ store }: { store: Store }) {
  return storeOpen(store) ? <Badge tone="green" dot>Open now</Badge> : <Badge tone="gray" dot>Closed</Badge>;
}

function ClosedNotice({ store }: { store: Store }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200/80">
      <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>
        <b>{store.store_name} is closed right now.</b> It takes orders from {time12(store.opens_at)} to {time12(store.closes_at)}.
        You can browse the menu, but ordering is disabled until it opens.
      </span>
    </div>
  );
}

function QtyStepper({ value, onChange, size = 'md' }: { value: number; onChange: (v: number) => void; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'size-7' : 'size-8';
  return (
    <div className="inline-flex items-center rounded-lg bg-white ring-1 ring-slate-200">
      <button type="button" aria-label="Decrease" onClick={() => onChange(value - 1)} className={cn('flex items-center justify-center rounded-l-lg text-slate-600 hover:bg-slate-50', s)}>
        {value <= 1 ? <Trash2 className="size-3.5 text-rose-500" /> : <Minus className="size-3.5" />}
      </button>
      <span className="w-7 text-center text-sm font-semibold text-navy-900 tabular">{value}</span>
      <button type="button" aria-label="Increase" disabled={value >= 20} onClick={() => onChange(value + 1)} className={cn('flex items-center justify-center rounded-r-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30', s)}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export default function StudentStores() {
  useTitle('Campus Stores');
  const [params, setParams] = useSearchParams();
  const cart = useCart();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [placed, setPlaced] = useState<{ order: OrderDetail; spend: SpendChange } | null>(null);
  const debounced = useDebounce(search, 200);

  useNow(60_000);
  // re-check opening hours every minute so a store opens / closes without a reload
  const stores = useQuery({ queryKey: ['stores'], queryFn: storeApi.list, refetchInterval: 60_000 });
  const selected = params.get('store') ?? stores.data?.[0]?.store_name ?? null;
  const cartOpen = params.get('cart') === '1';
  const store = stores.data?.find((s) => s.store_name === selected);
  const storeIsOpen = storeOpen(store);
  const cartStore = stores.data?.find((s) => s.store_name === cart.store_name);
  const cartStoreOpen = storeOpen(cartStore);

  const menu = useQuery({
    queryKey: ['menu', selected],
    queryFn: () => menuApi.list({ store: selected!, pageSize: 200 }),
    enabled: !!selected,
  });

  useEffect(() => {
    setCategory('ALL');
    setSearch('');
  }, [selected]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const m of menu.data?.rows ?? []) set.set(m.category ?? 'Other', (set.get(m.category ?? 'Other') ?? 0) + 1);
    return [...set.entries()];
  }, [menu.data]);

  const items = (menu.data?.rows ?? []).filter((m) =>
    (category === 'ALL' || (m.category ?? 'Other') === category) &&
    (!debounced || m.item_name.toLowerCase().includes(debounced.toLowerCase())));

  const addItem = async (m: MenuItem) => {
    if (!storeIsOpen) return;
    if (cart.add(m)) return;
    const ok = await confirm({
      title: 'Start a new cart?',
      message: <>Your cart has items from <b>{cart.store_name}</b>. An order can only contain items from one store - the database enforces this with a composite foreign key. Replace the cart with this item?</>,
      confirmText: 'Replace cart',
    });
    if (ok) cart.replaceWith(m);
  };

  const place = useMutation({
    mutationFn: () => orderApi.place(cart.store_name!, cart.lines.map((l) => ({ item_name: l.item_name, quantity: l.quantity }))),
    onSuccess: (res) => {
      cart.clear();
      setParam('cart', null);
      setPlaced(res);
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-spend'] });
      qc.invalidateQueries({ queryKey: ['menu'] });
    },
    onError: (e) => {
      notifyError(e, 'Order not placed');
      qc.invalidateQueries({ queryKey: ['stores'] }); // e.g. the store just closed
    },
  });

  return (
    <div className={cn('space-y-6', cart.count > 0 && 'pb-20')}>
      <PageHeader
        title="Campus Stores"
        description="Order from canteens, cafés and stores across campus. One store per order."
        actions={
          <Button variant="secondary" icon={<ShoppingCart className="size-4" />} onClick={() => setParam('cart', '1')}>
            Cart {cart.count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white tabular">{cart.count}</span>}
          </Button>
        }
      />

      {stores.error ? <ErrorState error={stores.error} onRetry={() => stores.refetch()} /> : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {stores.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px] min-w-60" />)}
          {stores.data?.map((s) => {
            const [, Icon, tone] = storeVisual(s.store_type);
            const active = s.store_name === selected;
            return (
              <button
                key={s.store_name}
                type="button"
                onClick={() => setParam('store', s.store_name)}
                className={cn(
                  'focus-ring min-w-60 snap-start rounded-2xl border bg-white p-4 text-left transition sm:min-w-0',
                  active ? 'border-brand-500 shadow-md ring-2 ring-brand-500/20' : 'border-slate-200/80 shadow-card hover:border-slate-300',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">{s.store_name}</p>
                    <p className="truncate text-xs text-slate-500">{s.store_type} · {s.available_count} items</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-slate-500"><Clock className="size-3.5" />{time12(s.opens_at)} – {time12(s.closes_at)}</span>
                  <OpenBadge store={s} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {store && (
        <Card>
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-navy-900">{store.store_name}</h2>
                <OpenBadge store={store} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{store.location}</span>
                <span className="flex items-center gap-1.5"><Clock className="size-3.5" />{time12(store.opens_at)} – {time12(store.closes_at)}</span>
              </p>
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search this menu…" className="w-full lg:w-72" />
          </div>
          {!storeIsOpen && <div className="border-b border-slate-100 px-5 py-3"><ClosedNotice store={store} /></div>}
          {categories.length > 1 && (
            <div className="border-b border-slate-100 px-5 py-3">
              <Segmented
                value={category}
                onChange={setCategory}
                options={[{ value: 'ALL', label: 'All', count: menu.data?.rows.length }, ...categories.map(([c, n]) => ({ value: c, label: c, count: n }))]}
              />
            </div>
          )}
          <div className="p-5">
            {menu.error ? <ErrorState error={menu.error} onRetry={() => menu.refetch()} /> : menu.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((m) => {
                  const qty = cart.quantityOf(m.store_name, m.item_name);
                  return (
                    <div key={m.item_name}
                      className={cn('flex items-center gap-4 rounded-xl border p-4 transition',
                        !m.is_available ? 'border-slate-100 bg-slate-50/70' : qty ? 'border-brand-200 bg-brand-50/30' : 'border-slate-200/80 hover:border-slate-300')}>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-semibold', m.is_available ? 'text-navy-900' : 'text-slate-400')}>{m.item_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{m.category ?? 'Uncategorised'}</p>
                        <p className={cn('mt-2 text-[15px] font-semibold tabular', m.is_available ? 'text-slate-900' : 'text-slate-400')}>{money(m.price)}</p>
                      </div>
                      {!m.is_available ? (
                        <Badge tone="gray">Unavailable</Badge>
                      ) : !storeIsOpen ? (
                        <Button size="sm" variant="secondary" disabled title="Store is closed">Closed</Button>
                      ) : qty ? (
                        <QtyStepper value={qty} onChange={(v) => cart.setQuantity(m.item_name, v)} />
                      ) : (
                        <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => addItem(m)}>Add</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<UtensilsCrossed className="size-6" />} title="No items found" description="Try a different search or category." />
            )}
          </div>
        </Card>
      )}

      {/* Floating cart bar (mobile + desktop) */}
      {cart.count > 0 && !cartOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 lg:pl-64">
          <button onClick={() => setParam('cart', '1')}
            className="pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl bg-navy-900 px-5 py-3.5 text-left text-white shadow-pop transition hover:bg-navy-800">
            <ShoppingCart className="size-5 text-brand-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{cart.count} item{cart.count > 1 ? 's' : ''} · {money(cart.subtotal)}</p>
              <p className="truncate text-xs text-slate-400">{cart.store_name}</p>
            </div>
            <span className="text-sm font-medium text-brand-200">View cart →</span>
          </button>
        </div>
      )}

      <Drawer
        open={cartOpen}
        onClose={() => setParam('cart', null)}
        title="Your cart"
        subtitle={cart.store_name ? `Ordering from ${cart.store_name}` : 'Your cart is empty'}
        footer={cart.count > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal ({cart.count} items)</span><span className="tabular">{money(cart.subtotal)}</span></div>
              <div className="flex justify-between text-base font-semibold text-navy-900"><span>Order total</span><span className="tabular">{money(cart.subtotal)}</span></div>
            </div>
            <p className="flex gap-2 rounded-lg bg-slate-50 p-2.5 text-[12px] leading-relaxed text-slate-500">
              <Database className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              Placed in one transaction via <code className="font-mono">sp_place_order</code>. Prices are snapshotted and the stored total is computed by the database trigger.
            </p>
            {!cartStoreOpen && cartStore && <ClosedNotice store={cartStore} />}
            <Button size="lg" className="w-full" loading={place.isPending} disabled={!cartStoreOpen || place.isPending}
              onClick={() => place.mutate()} icon={<CheckCircle2 className="size-4.5" />}>
              {cartStoreOpen ? `Place order · ${money(cart.subtotal)}` : 'Store closed - cannot order now'}
            </Button>
          </div>
        )}
      >
        {cart.count === 0 ? (
          <EmptyState icon={<ShoppingCart className="size-6" />} title="Your cart is empty" description="Add items from any store to get started."
            action={<Button variant="secondary" size="sm" onClick={() => setParam('cart', null)}>Browse menu</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100 px-5">
            {cart.lines.map((l) => (
              <li key={l.item_name} className="flex items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{l.item_name}</p>
                  <p className="text-xs text-slate-500">{money(l.price)} each</p>
                </div>
                <QtyStepper size="sm" value={l.quantity} onChange={(v) => cart.setQuantity(l.item_name, v)} />
                <p className="w-20 text-right text-sm font-semibold text-slate-900 tabular">{money(l.price * l.quantity)}</p>
              </li>
            ))}
            <li className="py-3">
              <button onClick={cart.clear} className="text-[13px] font-medium text-rose-600 hover:text-rose-700">Clear cart</button>
            </li>
          </ul>
        )}
      </Drawer>

      <Modal
        open={!!placed}
        onClose={() => setPlaced(null)}
        size="sm"
        title="Order placed"
        icon={<CheckCircle2 className="size-5 text-emerald-600" />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlaced(null)}>Keep browsing</Button>
            <Link to={`/student/orders/${placed?.order.order_id}`}><Button icon={<Receipt className="size-4" />}>View order</Button></Link>
          </>
        }
      >
        {placed && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200/70">
              <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase">Order ID</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-emerald-900">#{placed.order.order_id}</p>
              <p className="mt-1 text-sm text-emerald-800">{placed.order.store_name} · {placed.order.items.length} item{placed.order.items.length > 1 ? 's' : ''}</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Total (ORDERS.total_amount)</dt><dd className="font-semibold text-navy-900 tabular">{money(placed.order.total_amount)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Your total spend</dt>
                <dd className="font-medium text-slate-700 tabular">{money(placed.spend.before)} → <span className="font-semibold text-navy-900">{money(placed.spend.after)}</span></dd></div>
            </dl>
            <p className="text-xs leading-relaxed text-slate-500">
              Both values were read back from PostgreSQL after COMMIT - they are maintained by the triggers <code className="font-mono">trg_item</code> and <code className="font-mono">trg_order</code>, not calculated by the app.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
