import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, BedDouble, DoorOpen, ExternalLink, FileText, Mail, Pencil, Phone, Receipt, Trash2, Wallet,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, DescriptionItem, EmptyState, ErrorState, Field, Input,
  LoadingBlock, Modal, PageHeader, Segmented, Select, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { documentApi, studentApi } from '../../services/endpoints';
import type { Allocation, DocumentRow, OrderSummary, Outpass, Student } from '../../types';
import { displayName, fmtDate, isDemoId, money, smartDateTime } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Tab = 'allocations' | 'orders' | 'outpasses' | 'documents';

function EditStudentModal({ student, open, onClose }: { student: Student; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const init = () => ({
    full_name: student.full_name, email: student.email, phone: student.phone ?? '',
    gender: student.gender ?? '', program: student.program ?? '',
  });
  const [f, setF] = useState(init);
  useEffect(() => { if (open) setF(init()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof init>) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => studentApi.update(student.student_id, {
      full_name: f.full_name.trim(),
      email: f.email.trim(),
      phone: f.phone.trim() || null,
      gender: (f.gender || null) as Student['gender'],
      program: f.program.trim() || null,
    }),
    onSuccess: () => {
      notifySuccess('Student updated');
      qc.invalidateQueries({ queryKey: ['student', student.student_id] });
      qc.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (e) => notifyError(e, 'Could not update student'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit student"
      description={student.student_id}
      icon={<Pencil className="size-4.5" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-student" loading={save.isPending}>Save changes</Button>
        </>
      }
    >
      <form id="edit-student" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={f.full_name} onChange={set('full_name')} required maxLength={150} />
        </Field>
        <Field label="E-mail" required className="sm:col-span-2" hint="Must be unique (student_email_key)">
          <Input type="email" value={f.email} onChange={set('email')} required />
        </Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} maxLength={20} /></Field>
        <Field label="Gender">
          <Select value={f.gender} onChange={set('gender')}>
            <option value="">Not specified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Program" className="sm:col-span-2"><Input value={f.program} onChange={set('program')} maxLength={100} /></Field>
      </form>
    </Modal>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm ring-1 ring-slate-200/70">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-navy-900 tabular">{value}</p>
      </div>
    </div>
  );
}

export default function StudentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('allocations');
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['student', id], queryFn: () => studentApi.detail(id) });
  useTitle(q.data ? displayName(q.data.profile.full_name) : 'Student');

  const remove = useMutation({
    mutationFn: () => studentApi.remove(id),
    onSuccess: () => {
      notifySuccess('Student deleted');
      qc.invalidateQueries({ queryKey: ['students'] });
      navigate('/admin/students', { replace: true });
    },
    onError: (e) => notifyError(e, 'Could not delete student'),
  });

  if (q.isLoading) return <LoadingBlock label="Loading student…" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { profile: s, allocations, orders, outpasses, documents } = q.data;
  const active = allocations.find((a) => a.status === 'ACTIVE');

  const doDelete = async () => {
    const ok = await confirm({
      title: 'Delete this student?',
      tone: 'danger',
      confirmText: 'Delete student',
      message: (
        <>
          <p><strong>{displayName(s.full_name)}</strong> ({s.student_id}) will be removed.</p>
          <p className="mt-2">Students with room allocations, orders or outpasses cannot be deleted - the restrictive foreign
            keys make PostgreSQL refuse so that history is never lost. Documents cascade.</p>
        </>
      ),
    });
    if (ok) remove.mutate();
  };

  const allocCols: Column<Allocation>[] = [
    { key: 'hostel', header: 'Hostel', render: (a) => <span className="font-medium text-slate-900">{a.hostel_name}</span> },
    { key: 'room', header: 'Room', render: (a) => <span className="font-mono text-[13px]">{a.room_no}</span> },
    { key: 'floor', header: 'Floor', hideOnMobile: true, render: (a) => (a.floor_no === 0 ? 'Ground' : a.floor_no ?? '—') },
    { key: 'start', header: 'From', render: (a) => fmtDate(a.start_date) },
    { key: 'end', header: 'To', render: (a) => (a.end_date ? fmtDate(a.end_date) : <span className="text-slate-400">Present</span>) },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];
  const orderCols: Column<OrderSummary>[] = [
    { key: 'id', header: 'Order', render: (o) => <span className="font-mono text-[13px] text-slate-900">#{o.order_id}</span> },
    { key: 'store', header: 'Store', render: (o) => o.store_name },
    { key: 'at', header: 'Placed', hideOnMobile: true, render: (o) => smartDateTime(o.ordered_at) },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'total', header: 'Total', align: 'right', render: (o) => <span className={o.status === 'CANCELLED' ? 'text-slate-400 line-through tabular' : 'font-medium tabular'}>{money(o.total_amount)}</span> },
  ];
  const outCols: Column<Outpass>[] = [
    { key: 'id', header: 'Request', render: (o) => <span className="font-mono text-[13px] text-slate-900">#{o.request_id}</span> },
    { key: 'reason', header: 'Reason', render: (o) => <span className="line-clamp-1 max-w-64">{o.reason}</span> },
    { key: 'out', header: 'Out', hideOnMobile: true, render: (o) => smartDateTime(o.out_at) },
    { key: 'ret', header: 'Return by', hideOnMobile: true, render: (o) => smartDateTime(o.return_by) },
    {
      key: 'status', header: 'Status',
      render: (o) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={o.status} />
          {o.is_overdue && <StatusBadge status="OVERDUE" />}
          {o.returned_at && <Badge tone={o.returned_late ? 'orange' : 'sky'}>{o.returned_late ? 'Returned late' : 'Returned'}</Badge>}
        </div>
      ),
    },
    { key: 'rev', header: 'Reviewed by', hideOnMobile: true, render: (o) => o.reviewer_name ?? <span className="text-slate-400">—</span> },
  ];
  const docCols: Column<DocumentRow>[] = [
    { key: 'type', header: 'Type', render: (d) => <span className="font-medium text-slate-900">{d.doc_type}</span> },
    { key: 'file', header: 'File', hideOnMobile: true, render: (d) => <span className="font-mono text-xs text-slate-500">{d.file_name}</span> },
    { key: 'at', header: 'Uploaded', render: (d) => fmtDate(d.uploaded_at) },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.verify_status} /> },
    {
      key: 'open', header: '', align: 'right',
      render: (d) => (
        <a href={documentApi.fileUrl(d.document_id)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">
          Open <ExternalLink className="size-3.5" />
        </a>
      ),
    },
  ];

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'allocations', label: 'Allocations', count: allocations.length },
    { value: 'orders', label: 'Orders', count: orders.length },
    { value: 'outpasses', label: 'Outpasses', count: outpasses.length },
    { value: 'documents', label: 'Documents', count: documents.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Students', to: '/admin/students' }, { label: s.student_id }]}
        title={displayName(s.full_name)}
        actions={
          <>
            <Link to={`/admin/allocations?student=${encodeURIComponent(s.student_id)}`}>
              <Button variant="secondary" icon={<ArrowLeftRight className="size-4" />}>{active ? 'Transfer / vacate' : 'Allocate room'}</Button>
            </Link>
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={doDelete}>Delete</Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start">
          <Avatar name={s.full_name} size="xl" />
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-600">{s.student_id}</span>
              {s.gender && <StatusBadge status={s.gender} />}
              {isDemoId(s.student_id) && <Badge tone="violet">Synthetic demo account</Badge>}
              {active ? <Badge tone="green" dot>Resident</Badge> : <Badge tone="amber" dot>No active room</Badge>}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <DescriptionItem label="E-mail"><span className="flex items-center gap-1.5"><Mail className="size-3.5 text-slate-400" />{s.email}</span></DescriptionItem>
              <DescriptionItem label="Phone"><span className="flex items-center gap-1.5"><Phone className="size-3.5 text-slate-400" />{s.phone ?? '—'}</span></DescriptionItem>
              <DescriptionItem label="Program">{s.program ?? '—'}</DescriptionItem>
            </dl>
          </div>
        </div>
        <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat icon={<BedDouble className="size-4" />} label="Current room"
            value={active ? `${active.hostel_name} · ${active.room_no}` : 'Not allocated'} />
          <MiniStat icon={<Wallet className="size-4" />} label="Total spend (trigger-maintained)" value={money(s.total_deductions_amount)} />
          <MiniStat icon={<DoorOpen className="size-4" />} label="Outpass requests" value={outpasses.length} />
          <MiniStat icon={<FileText className="size-4" />} label="Documents"
            value={`${documents.filter((d) => d.verify_status === 'VERIFIED').length} verified / ${documents.length}`} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Records"
          subtitle="Rows from ROOM_ALLOCATION, ORDERS, OUTPASS_REQUEST and DOCUMENT for this student"
          actions={<Segmented value={tab} onChange={setTab} options={tabs} className="hidden md:inline-flex" />}
        />
        <div className="border-b border-slate-100 px-4 py-3 md:hidden">
          <Segmented value={tab} onChange={setTab} options={tabs} />
        </div>
        {tab === 'allocations' && (
          <DataTable columns={allocCols} rows={allocations} rowKey={(a) => `${a.hostel_name}-${a.room_no}-${a.start_date}`}
            empty={<EmptyState icon={<BedDouble className="size-6" />} title="No allocations" description="This student has never been allocated a room." />} />
        )}
        {tab === 'orders' && (
          <DataTable columns={orderCols} rows={orders} rowKey={(o) => o.order_id}
            empty={<EmptyState icon={<Receipt className="size-6" />} title="No orders" description="Orders placed by the student will appear here (latest 25)." />} />
        )}
        {tab === 'outpasses' && (
          <DataTable columns={outCols} rows={outpasses} rowKey={(o) => o.request_id}
            empty={<EmptyState icon={<DoorOpen className="size-6" />} title="No outpass requests" />} />
        )}
        {tab === 'documents' && (
          <DataTable columns={docCols} rows={documents} rowKey={(d) => d.document_id}
            empty={<EmptyState icon={<FileText className="size-6" />} title="No documents uploaded" />} />
        )}
      </Card>

      <EditStudentModal student={s} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
