import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  Badge, Button, Card, Code, DataTable, EmptyState, Field, IconButton, Input, Modal, PageHeader, Pagination,
  SearchInput, Segmented, Select, Toggle, useConfirm, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { menuApi, storeApi } from '../../services/endpoints';
import type { MenuItem } from '../../types';
import { cn } from '../../utils/cn';
import { money, number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Avail = 'all' | 'yes' | 'no';

export default function Menu() {
  useTitle('Menu Management');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const store = params.get('store') ?? '';
  const [category, setCategory] = useState('');
  const [avail, setAvail] = useState<Avail>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const search = useDebounce(q);

  const stores = useQuery({ queryKey: ['stores'], queryFn: storeApi.list });
  const categories = useQuery({ queryKey: ['menu-categories', store], queryFn: () => menuApi.categories(store || undefined) });
  const menu = useQuery({
    queryKey: ['admin-menu', store, category, avail, search, sort, page],
    queryFn: () => menuApi.list({ store, category, available: avail === 'all' ? undefined : avail, q: search, sort, page, pageSize: 25 }),
    placeholderData: (p) => p,
  });

  const setStore = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('store', s); else next.delete('store');
    setParams(next, { replace: true });
    setCategory('');
    setPage(1);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-menu'] });
    qc.invalidateQueries({ queryKey: ['menu-categories'] });
    qc.invalidateQueries({ queryKey: ['stores'] });
    qc.invalidateQueries({ queryKey: ['menu'] });
  };

  const toggle = useMutation({
    mutationFn: (m: MenuItem) => menuApi.update(m.store_name, m.item_name, { is_available: !m.is_available }),
    onSuccess: (m) => {
      invalidate();
      notifySuccess(`${m.item_name} is now ${m.is_available ? 'available' : 'unavailable'}`, m.store_name);
    },
    onError: (e) => notifyError(e, 'Could not change availability'),
  });

  const remove = useMutation({
    mutationFn: (m: MenuItem) => menuApi.remove(m.store_name, m.item_name),
    onSuccess: (_d, m) => {
      invalidate();
      notifySuccess('Item deleted', `${m.item_name} · ${m.store_name}`);
    },
    onError: (e) => notifyError(e, 'Could not delete the item'),
  });

  const askDelete = async (m: MenuItem) => {
    if (await confirm({
      title: `Delete ${m.item_name}?`,
      message: (
        <p>
          Items that appear in past orders cannot be deleted - the foreign key
          <Code>order_item → menu_item</Code> is restrictive, so PostgreSQL keeps order history intact.
          Mark the item unavailable instead.
        </p>
      ),
      confirmText: 'Delete item',
      tone: 'danger',
    })) remove.mutate(m);
  };

  const columns: Column<MenuItem>[] = [
    {
      key: 'item', header: 'Item', render: (m) => (
        <div>
          <p className={cn('font-medium', m.is_available ? 'text-slate-900' : 'text-slate-500')}>{m.item_name}</p>
          {!store && <p className="text-xs text-slate-500 md:hidden">{m.store_name}</p>}
        </div>
      ),
    },
    ...(!store ? [{ key: 'store', header: 'Store', hideOnMobile: true, render: (m: MenuItem) => <span className="whitespace-nowrap text-slate-600">{m.store_name}</span> }] : []),
    { key: 'category', header: 'Category', hideOnMobile: true, render: (m) => (m.category ? <Badge tone="gray">{m.category}</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'price', header: 'Price', align: 'right', render: (m) => <span className="font-semibold text-slate-900 tabular">{money(m.price)}</span> },
    { key: 'sold', header: 'Sold', align: 'right', hideOnMobile: true, render: (m) => <span className="text-slate-600 tabular">{number(m.sold ?? 0)}</span> },
    {
      key: 'available', header: 'Available', render: (m) => (
        <Toggle checked={m.is_available} disabled={toggle.isPending && toggle.variables?.item_name === m.item_name && toggle.variables?.store_name === m.store_name}
          onChange={() => toggle.mutate(m)} />
      ),
    },
    {
      key: 'actions', header: '', align: 'right', render: (m) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label="Edit item" onClick={() => setEditing(m)}><Pencil className="size-4" /></IconButton>
          <IconButton label="Delete item" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => askDelete(m)}><Trash2 className="size-4" /></IconButton>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Menu Management"
        description="Prices, categories and availability for every store's menu."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add item</Button>}
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl bg-brand-50/70 px-4 py-3 text-[13px] text-brand-900 ring-1 ring-brand-100">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <p>Changing a price never changes past orders - each order line keeps its own price snapshot in <Code>ORDER_ITEM.unit_price</Code>.</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search item or category…" />
            <Select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Store">
              <option value="">All stores</option>
              {stores.data?.map((s) => <option key={s.store_name} value={s.store_name}>{s.store_name}</option>)}
            </Select>
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category">
              <option value="">All categories</option>
              {categories.data?.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort">
              <option value="">Sort: store & category</option>
              <option value="item_name">Name (A–Z)</option>
              <option value="price">Price (low → high)</option>
              <option value="-price">Price (high → low)</option>
              <option value="-sold">Best selling</option>
            </Select>
          </div>
          <Segmented<Avail>
            value={avail}
            onChange={(v) => { setAvail(v); setPage(1); }}
            options={[{ value: 'all', label: 'All items' }, { value: 'yes', label: 'Available' }, { value: 'no', label: 'Unavailable' }]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={menu.data?.rows}
          rowKey={(m) => `${m.store_name}/${m.item_name}`}
          loading={menu.isFetching}
          error={menu.error}
          onRetry={menu.refetch}
          dense
          empty={<EmptyState icon={<UtensilsCrossed className="size-6" />} title="No menu items" description="Nothing matches these filters." action={<Button size="sm" onClick={() => setEditing('new')}>Add item</Button>} />}
        />
        {menu.data && <Pagination {...menu.data} onPage={setPage} />}
      </Card>

      <ItemModal item={editing} defaultStore={store} stores={stores.data?.map((s) => s.store_name) ?? []} onClose={() => setEditing(null)} onSaved={invalidate} />
    </div>
  );
}

function ItemModal({
  item, defaultStore, stores, onClose, onSaved,
}: { item: MenuItem | 'new' | null; defaultStore: string; stores: string[]; onClose: () => void; onSaved: () => void }) {
  const isNew = item === 'new';
  const [form, setForm] = useState({ store_name: '', item_name: '', category: '', price: '', is_available: true });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    if (item === 'new') setForm({ store_name: defaultStore, item_name: '', category: '', price: '', is_available: true });
    else if (item) setForm({ store_name: item.store_name, item_name: item.item_name, category: item.category ?? '', price: String(item.price), is_available: item.is_available });
  }, [item, defaultStore]);

  const save = useMutation({
    mutationFn: () => {
      const body = { item_name: form.item_name.trim(), category: form.category.trim() || null, price: Number(form.price), is_available: form.is_available };
      return isNew ? menuApi.create(form.store_name, body) : menuApi.update((item as MenuItem).store_name, (item as MenuItem).item_name, body);
    },
    onSuccess: (m) => {
      onSaved();
      notifySuccess(isNew ? 'Item added' : 'Item updated', `${m.item_name} · ${money(m.price)}`);
      onClose();
    },
    onError: (e) => notifyError(e, 'Could not save the item'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isNew && !form.store_name) return setErr('Choose a store');
    if (!form.item_name.trim()) return setErr('Item name is required');
    if (form.price.trim() === '' || Number.isNaN(Number(form.price))) return setErr('Enter a price');
    setErr(null);
    // Negative prices are deliberately NOT blocked here: CHECK menu_item_price_check rejects them.
    save.mutate();
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={isNew ? 'Add menu item' : `Edit ${(item as MenuItem | null)?.item_name ?? ''}`}
      description={isNew ? 'The item belongs to its store (weak entity MENU_ITEM).' : (item as MenuItem | null)?.store_name}
      icon={<UtensilsCrossed className="size-4.5" />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="item-form" loading={save.isPending}>{isNew ? 'Add item' : 'Save changes'}</Button>
      </>}
    >
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <Field label="Store" required className="sm:col-span-2">
            <Select value={form.store_name} onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}>
              <option value="">Choose a store…</option>
              {stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Item name" required className="sm:col-span-2"
          hint={!isNew ? 'Renaming an item that appears in past orders is refused by the foreign key.' : undefined}>
          <Input value={form.item_name} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Masala Dosa" />
        </Field>
        <Field label="Category">
          <Input value={form.category} maxLength={50} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. South Indian" />
        </Field>
        <Field label="Price (₹)" required hint={<>Must be ≥ 0 - enforced by <Code className="text-[11px]">menu_item_price_check</Code></>}>
          <Input type="number" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={form.is_available} onChange={(v) => setForm((f) => ({ ...f, is_available: v }))} label="Available for ordering" />
        </div>
        {err && <p className="text-[13px] font-medium text-rose-600 sm:col-span-2">{err}</p>}
      </form>
    </Modal>
  );
}
