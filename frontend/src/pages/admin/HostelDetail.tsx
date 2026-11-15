import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, DoorClosed, Info, Layers, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, DataTable, Drawer, EmptyState, ErrorState, Field, IconButton, Input, LoadingBlock,
  Meter, Modal, PageHeader, Pagination, SearchInput, Segmented, Select, StatCard, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { hostelApi, roomApi } from '../../services/endpoints';
import type { Room } from '../../types';
import { cn } from '../../utils/cn';
import { displayName, fmtDate, number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

const floorLabel = (f: number) => (f === 0 ? 'Ground' : `Floor ${f}`);

function OccupancyPill({ n }: { n: number }) {
  return (
    <span className={cn(
      'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular',
      n === 0 ? 'bg-slate-100 text-slate-500' : n === 1 ? 'bg-brand-50 text-brand-700' : n === 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
    )}>
      {n}
    </span>
  );
}

function RoomFormModal({
  hostel, room, open, onClose,
}: { hostel: string; room: Room | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [roomNo, setRoomNo] = useState('');
  const [floor, setFloor] = useState('0');
  useEffect(() => {
    if (open) {
      setRoomNo(room?.room_no ?? '');
      setFloor(String(room?.floor_no ?? 0));
    }
  }, [open, room]);

  const save = useMutation({
    mutationFn: () => {
      const body = { room_no: roomNo.trim(), floor_no: Number(floor) };
      return room
        ? roomApi.update(hostel, room.room_no, body)
        : roomApi.create({ hostel_name: hostel, ...body });
    },
    onSuccess: (r) => {
      notifySuccess(room ? 'Room updated' : 'Room created', `${hostel} · ${r.room_no}`);
      qc.invalidateQueries({ queryKey: ['rooms', hostel] });
      qc.invalidateQueries({ queryKey: ['hostel', hostel] });
      qc.invalidateQueries({ queryKey: ['hostels'] });
      onClose();
    },
    onError: (e) => notifyError(e, room ? 'Could not update room' : 'Could not create room'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={room ? `Edit room ${room.room_no}` : 'Create room'}
      description={hostel}
      icon={<DoorClosed className="size-4.5" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="room-form" loading={save.isPending}>{room ? 'Save' : 'Create room'}</Button>
        </>
      }
    >
      <form id="room-form" className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Room number" required hint={room ? 'Renaming a room with allocation history is refused by the foreign key.' : 'Unique within the hostel, e.g. A-012'}>
          <Input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} required maxLength={10} />
        </Field>
        <Field label="Floor" required hint="CHECK floor_no ≥ 0 is enforced by PostgreSQL">
          <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} required />
        </Field>
        <div className="flex gap-2.5 rounded-xl bg-brand-50/60 p-3 text-[13px] text-brand-900 ring-1 ring-brand-100">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <p>Occupancy is not editable: it is the number of ACTIVE allocations and is maintained by the <code className="font-mono text-xs">trg_alloc_occupancy</code> trigger.</p>
        </div>
      </form>
    </Modal>
  );
}

function RoomDrawer({ hostel, roomNo, onClose }: { hostel: string; roomNo: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['room', hostel, roomNo],
    queryFn: () => roomApi.get(hostel, roomNo!),
    enabled: !!roomNo,
  });
  return (
    <Drawer open={!!roomNo} onClose={onClose} title={`Room ${roomNo ?? ''}`} subtitle={hostel}>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs text-slate-500">Floor</p>
              <p className="mt-1 text-lg font-semibold text-navy-900">{floorLabel(q.data.floor_no)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs text-slate-500">Occupancy (trigger)</p>
              <p className="mt-1 text-lg font-semibold text-navy-900 tabular">{q.data.occupancy}</p>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-navy-900">Allocation history</h3>
            {q.data.allocations.length === 0 ? (
              <EmptyState icon={<BedDouble className="size-6" />} title="Never allocated" className="py-8" />
            ) : (
              <ol className="relative space-y-3 border-l border-slate-200 pl-5">
                {q.data.allocations.map((a) => (
                  <li key={`${a.student_id}-${a.start_date}`} className="relative">
                    <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white', a.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300')} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/admin/students/${encodeURIComponent(a.student_id)}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                          {displayName(a.full_name)}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{a.student_id}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{fmtDate(a.start_date)} → {a.end_date ? fmtDate(a.end_date) : 'present'}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default function HostelDetail() {
  const { name = '' } = useParams();
  useTitle(name);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [floor, setFloor] = useState('');
  const [occ, setOcc] = useState<'' | 'empty' | 'occupied'>('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [viewRoom, setViewRoom] = useState<string | null>(null);
  useEffect(() => setPage(1), [floor, occ, q]);

  const hostel = useQuery({ queryKey: ['hostel', name], queryFn: () => hostelApi.get(name) });
  const rooms = useQuery({
    queryKey: ['rooms', name, { floor, occ, q, page }],
    queryFn: () => roomApi.list({ hostel: name, floor: floor === '' ? undefined : Number(floor), occupancy: occ, q, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (r: Room) => roomApi.remove(name, r.room_no),
    onSuccess: (_d, r) => {
      notifySuccess('Room deleted', `${name} · ${r.room_no}`);
      qc.invalidateQueries({ queryKey: ['rooms', name] });
      qc.invalidateQueries({ queryKey: ['hostel', name] });
      qc.invalidateQueries({ queryKey: ['hostels'] });
    },
    onError: (e) => notifyError(e, 'Could not delete room'),
  });

  const askDelete = async (r: Room) => {
    const ok = await confirm({
      title: `Delete room ${r.room_no}?`,
      tone: 'danger',
      confirmText: 'Delete room',
      message: 'Rooms with any allocation history (active or ended) cannot be deleted: ROOM_ALLOCATION references the room restrictively, so PostgreSQL will refuse.',
    });
    if (ok) remove.mutate(r);
  };

  if (hostel.isLoading) return <LoadingBlock label="Loading hostel…" />;
  if (hostel.error || !hostel.data) return <ErrorState error={hostel.error} onRetry={() => hostel.refetch()} />;
  const h = hostel.data;
  const pct = h.total_rooms ? Math.round((h.occupied_rooms / h.total_rooms) * 100) : 0;

  const columns: Column<Room>[] = [
    { key: 'room', header: 'Room', render: (r) => <span className="font-mono text-[13px] font-semibold text-slate-900">{r.room_no}</span> },
    { key: 'floor', header: 'Floor', render: (r) => <span className="text-slate-600">{floorLabel(r.floor_no)}</span> },
    { key: 'occ', header: 'Occupancy', align: 'center', render: (r) => <OccupancyPill n={r.occupancy} /> },
    {
      key: 'residents',
      header: 'Residents',
      render: (r) =>
        r.residents?.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {r.residents.map((s) => (
              <Link key={s.student_id} to={`/admin/students/${encodeURIComponent(s.student_id)}`} onClick={(e) => e.stopPropagation()}
                className="text-[13px] font-medium text-slate-700 hover:text-brand-700">
                {displayName(s.full_name)}
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-[13px] text-slate-400">Vacant</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label="Edit room" onClick={() => { setEditRoom(r); setFormOpen(true); }}><Pencil className="size-3.5" /></IconButton>
          <IconButton label="Delete room" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => askDelete(r)}><Trash2 className="size-3.5" /></IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Hostels & Rooms', to: '/admin/hostels' }, { label: h.hostel_name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {h.hostel_name} <StatusBadge status={h.gender} />
          </span>
        }
        description={`${h.hostel_type} · Warden: ${h.warden_name ?? 'not assigned'}`}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => { setEditRoom(null); setFormOpen(true); }}>Create room</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Residents" value={number(h.residents)} icon={<Users className="size-5" />} accent="green" />
        <StatCard label="Rooms" value={number(h.total_rooms)} icon={<DoorClosed className="size-5" />} />
        <StatCard label="Rooms in use" value={`${pct}%`} sub={`${number(h.occupied_rooms)} occupied`} icon={<BedDouble className="size-5" />} accent="violet" />
        <StatCard label="Empty rooms" value={number(h.empty_rooms)} icon={<Layers className="size-5" />} accent="amber" />
      </div>

      {!!h.floors?.length && (
        <Card>
          <CardHeader title="Floors" subtitle="Rooms and residents per floor (GROUP BY floor_no)" />
          <div className="grid gap-px overflow-hidden rounded-b-2xl bg-slate-100 sm:grid-cols-3 lg:grid-cols-5">
            {h.floors.map((f) => (
              <button key={f.floor_no} type="button" onClick={() => setFloor(floor === String(f.floor_no) ? '' : String(f.floor_no))}
                className={cn('bg-white p-4 text-left transition hover:bg-brand-50/40', floor === String(f.floor_no) && 'bg-brand-50/70')}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-navy-900">{floorLabel(f.floor_no)}</p>
                  {floor === String(f.floor_no) && <Badge tone="blue">Filtered</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500 tabular">{f.residents} residents · {f.rooms} rooms · {f.empty_rooms} empty</p>
                <Meter className="mt-3" value={f.rooms - f.empty_rooms} max={f.rooms} />
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Room number or resident…" className="lg:w-72" />
          <Select value={floor} onChange={(e) => setFloor(e.target.value)} className="lg:w-40" aria-label="Floor">
            <option value="">All floors</option>
            {h.floors?.map((f) => <option key={f.floor_no} value={f.floor_no}>{floorLabel(f.floor_no)}</option>)}
          </Select>
          <Segmented
            value={occ}
            onChange={setOcc}
            options={[{ value: '', label: 'All rooms' }, { value: 'occupied', label: 'Occupied' }, { value: 'empty', label: 'Empty' }]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rooms.data?.rows}
          rowKey={(r) => r.room_no}
          loading={rooms.isFetching}
          error={rooms.error}
          onRetry={() => rooms.refetch()}
          onRowClick={(r) => setViewRoom(r.room_no)}
          dense
          empty={<EmptyState icon={<DoorClosed className="size-6" />} title="No rooms match" description="Change the floor or occupancy filter." />}
        />
        {rooms.data && (
          <Pagination page={rooms.data.page} pages={rooms.data.pages} total={rooms.data.total} pageSize={rooms.data.pageSize} onPage={setPage} />
        )}
      </Card>

      <RoomFormModal hostel={name} room={editRoom} open={formOpen} onClose={() => setFormOpen(false)} />
      <RoomDrawer hostel={name} roomNo={viewRoom} onClose={() => setViewRoom(null)} />
    </div>
  );
}
