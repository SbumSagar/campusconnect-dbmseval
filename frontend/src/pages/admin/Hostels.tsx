import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Building2, DoorClosed, Pencil, UserRound, Users } from 'lucide-react';
import { BarChartCard } from '../../components/charts/Charts';
import {
  Button, Card, CardBody, CardHeader, ErrorState, Field, IconButton, Input, Meter, Modal, PageHeader, Skeleton,
  StatCard, StatusBadge,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { hostelApi } from '../../services/endpoints';
import type { Hostel } from '../../types';
import { number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

function EditHostelModal({ hostel, onClose }: { hostel: Hostel | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [warden, setWarden] = useState('');
  useEffect(() => {
    if (hostel) {
      setType(hostel.hostel_type);
      setWarden(hostel.warden_name ?? '');
    }
  }, [hostel]);
  const save = useMutation({
    mutationFn: () => hostelApi.update(hostel!.hostel_name, { hostel_type: type.trim(), warden_name: warden.trim() || null }),
    onSuccess: () => {
      notifySuccess('Hostel updated', hostel!.hostel_name);
      qc.invalidateQueries({ queryKey: ['hostels'] });
      qc.invalidateQueries({ queryKey: ['hostel', hostel!.hostel_name] });
      onClose();
    },
    onError: (e) => notifyError(e, 'Could not update hostel'),
  });
  return (
    <Modal
      open={!!hostel}
      onClose={onClose}
      title={`Edit ${hostel?.hostel_name ?? ''}`}
      description="The hostel name is the primary key and gender is fixed for the dataset."
      icon={<Building2 className="size-4.5" />}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-hostel" loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form id="edit-hostel" className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Hostel type" required>
          <Input value={type} onChange={(e) => setType(e.target.value)} required maxLength={50} />
        </Field>
        <Field label="Warden">
          <Input value={warden} onChange={(e) => setWarden(e.target.value)} maxLength={100} />
        </Field>
      </form>
    </Modal>
  );
}

function HostelCard({ h, onEdit }: { h: Hostel; onEdit: () => void }) {
  const navigate = useNavigate();
  const pct = h.total_rooms ? Math.round((h.occupied_rooms / h.total_rooms) * 100) : 0;
  return (
    <Card
      className="group cursor-pointer p-5 transition hover:border-brand-200 hover:shadow-md"
      onClick={() => navigate(`/admin/hostels/${encodeURIComponent(h.hostel_name)}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex size-11 items-center justify-center rounded-xl ${h.gender === 'FEMALE' ? 'bg-pink-50 text-pink-600' : 'bg-sky-50 text-sky-600'}`}>
            <Building2 className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-navy-900 group-hover:text-brand-700">{h.hostel_name}</h3>
            <p className="text-[13px] text-slate-500">{h.hostel_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={h.gender} />
          <IconButton label={`Edit ${h.hostel_name}`} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[13px] text-slate-600">
        <UserRound className="size-3.5 text-slate-400" /> {h.warden_name ?? 'No warden assigned'}
      </p>

      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3 ring-1 ring-slate-200/60">
        {[
          ['Residents', h.residents],
          ['Rooms', h.total_rooms],
          ['Empty', h.empty_rooms],
        ].map(([label, v]) => (
          <div key={label} className="px-3 text-center">
            <p className="text-lg font-semibold text-navy-900 tabular">{number(v as number)}</p>
            <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500">Rooms in use</span>
          <span className="font-semibold text-slate-700 tabular">{number(h.occupied_rooms)} / {number(h.total_rooms)} · {pct}%</span>
        </div>
        <Meter value={h.occupied_rooms} max={h.total_rooms} tone={pct > 95 ? 'red' : pct > 85 ? 'amber' : 'blue'} />
        <p className="mt-2 text-xs text-slate-500">Average {h.avg_per_room} residents per room · max {h.max_room_occupancy}</p>
      </div>
    </Card>
  );
}

export default function Hostels() {
  useTitle('Hostels & Rooms');
  const q = useQuery({ queryKey: ['hostels'], queryFn: hostelApi.list });
  const [editing, setEditing] = useState<Hostel | null>(null);
  const hostels = q.data ?? [];
  const sum = (k: keyof Hostel) => hostels.reduce((s, h) => s + Number(h[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostels & Rooms"
        description="Live occupancy from the v_hostel_occupancy view. ROOM.occupancy is maintained by the trg_alloc_occupancy trigger."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Hostels" value={q.isLoading ? '…' : hostels.length} icon={<Building2 className="size-5" />} />
        <StatCard label="Rooms" value={q.isLoading ? '…' : number(sum('total_rooms'))} icon={<DoorClosed className="size-5" />} accent="violet" />
        <StatCard label="Residents" value={q.isLoading ? '…' : number(sum('residents'))} icon={<Users className="size-5" />} accent="green" />
        <StatCard label="Empty rooms" value={q.isLoading ? '…' : number(sum('empty_rooms'))} icon={<BedDouble className="size-5" />} accent="amber" />
      </div>

      {q.error ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {q.isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
            : hostels.map((h) => <HostelCard key={h.hostel_name} h={h} onEdit={() => setEditing(h)} />)}
        </div>
      )}

      {!!hostels.length && (
        <Card>
          <CardHeader title="Residents per hostel" subtitle="Sum of ROOM.occupancy (active allocations) per hostel" />
          <CardBody>
            <BarChartCard
              data={hostels.map((h) => ({ hostel_name: h.hostel_name, residents: h.residents }))}
              x="hostel_name"
              series={[{ key: 'residents', label: 'Residents' }]}
              fmt={(v) => number(v)}
              height={280}
            />
          </CardBody>
        </Card>
      )}

      <EditHostelModal hostel={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
