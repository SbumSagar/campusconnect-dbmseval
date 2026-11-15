import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select,
  StatusBadge, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { hostelApi, studentApi } from '../../services/endpoints';
import type { Student } from '../../types';
import { displayName, isDemoId, money } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

const PAGE_SIZE = 20;

const SORTS = [
  { value: '', label: 'Student ID (A–Z)' },
  { value: 'full_name', label: 'Name (A–Z)' },
  { value: '-full_name', label: 'Name (Z–A)' },
  { value: 'hostel', label: 'Hostel' },
  { value: '-spend', label: 'Highest spend' },
];

function AddStudentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const blank = { student_id: '', full_name: '', email: '', phone: '', gender: '', program: '' };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () => studentApi.create({
      student_id: f.student_id.trim().toUpperCase(),
      full_name: f.full_name.trim(),
      email: f.email.trim(),
      phone: f.phone.trim() || null,
      gender: (f.gender || null) as Student['gender'],
      program: f.program.trim() || null,
    }),
    onSuccess: (s) => {
      notifySuccess('Student added', `${s.student_id} · ${displayName(s.full_name)}`);
      qc.invalidateQueries({ queryKey: ['students'] });
      setF(blank);
      onClose();
      navigate(`/admin/students/${encodeURIComponent(s.student_id)}`);
    },
    onError: (e) => notifyError(e, 'Could not add student'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add student"
      description="Creates a row in STUDENT. Uniqueness of the ID and e-mail is enforced by PostgreSQL."
      icon={<UserPlus className="size-4.5" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-student" loading={create.isPending}>Add student</Button>
        </>
      }
    >
      <form id="add-student" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Student ID" required hint="Letters and digits, up to 20 characters">
          <Input value={f.student_id} onChange={set('student_id')} placeholder="2026A7PS0001H" required maxLength={20} />
        </Field>
        <Field label="Gender">
          <Select value={f.gender} onChange={set('gender')}>
            <option value="">Not specified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={f.full_name} onChange={set('full_name')} required maxLength={150} />
        </Field>
        <Field label="E-mail" required className="sm:col-span-2">
          <Input type="email" value={f.email} onChange={set('email')} placeholder="name@students.campusconnect.invalid" required />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={set('phone')} maxLength={20} />
        </Field>
        <Field label="Program">
          <Input value={f.program} onChange={set('program')} placeholder="B.E. Computer Science" maxLength={100} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Students() {
  useTitle('Students');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounce(search.trim(), 300);
  const gender = params.get('gender') ?? '';
  const hostel = params.get('hostel') ?? '';
  const allocated = params.get('allocated') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const [adding, setAdding] = useState(false);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // keep ?q= in sync with the debounced search box
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hostels = useQuery({ queryKey: ['hostels'], queryFn: hostelApi.list, staleTime: 60_000 });
  const list = useQuery({
    queryKey: ['students', { q, gender, hostel, allocated, sort, page }],
    queryFn: () => studentApi.list({ q, gender, hostel, allocated, sort, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.full_name} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium text-slate-900">
              {displayName(s.full_name)}
              {isDemoId(s.student_id) && <Badge tone="violet">Demo</Badge>}
            </p>
            <p className="font-mono text-xs text-slate-500">{s.student_id}</p>
          </div>
        </div>
      ),
    },
    { key: 'gender', header: 'Gender', render: (s) => (s.gender ? <StatusBadge status={s.gender} /> : <span className="text-slate-400">—</span>) },
    {
      key: 'room',
      header: 'Hostel / room',
      render: (s) =>
        s.hostel_name ? (
          <span className="whitespace-nowrap">
            <span className="font-medium text-slate-800">{s.hostel_name}</span>
            <span className="ml-1.5 font-mono text-xs text-slate-500">{s.room_no}</span>
          </span>
        ) : (
          <Badge tone="amber">Unallocated</Badge>
        ),
    },
    { key: 'program', header: 'Program', hideOnMobile: true, render: (s) => <span className="text-slate-600">{s.program ?? '—'}</span> },
    {
      key: 'spend',
      header: 'Spend',
      align: 'right',
      hideOnMobile: true,
      render: (s) => <span className="font-medium text-slate-900 tabular">{money(s.total_deductions_amount)}</span>,
    },
  ];

  const data = list.data;
  const filtersActive = !!(q || gender || hostel || allocated);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="All students on the roster, with their current room and trigger-maintained spending."
        actions={<Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Add student</Button>}
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by ID, name or e-mail…" className="lg:w-80" />
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            <Select value={gender} onChange={(e) => update({ gender: e.target.value })} aria-label="Gender">
              <option value="">All genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
            <Select value={hostel} onChange={(e) => update({ hostel: e.target.value })} aria-label="Hostel">
              <option value="">All hostels</option>
              {hostels.data?.map((h) => <option key={h.hostel_name} value={h.hostel_name}>{h.hostel_name}</option>)}
            </Select>
            <Select value={allocated} onChange={(e) => update({ allocated: e.target.value })} aria-label="Allocation">
              <option value="">Any allocation</option>
              <option value="yes">Has a room</option>
              <option value="no">Unallocated</option>
            </Select>
            <Select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear</Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={data?.rows}
          rowKey={(s) => s.student_id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(s) => navigate(`/admin/students/${encodeURIComponent(s.student_id)}`)}
          empty={
            <div className="flex flex-col items-center py-14 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Users className="size-6" /></div>
              <p className="text-[15px] font-semibold text-navy-900">No students found</p>
              <p className="mt-1 text-sm text-slate-500">Try a different search or clear the filters.</p>
            </div>
          }
        />
        {data && (
          <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize}
            onPage={(p) => update({ page: String(p) })} />
        )}
      </Card>

      <AddStudentModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
