import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Info, Lock, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, DescriptionItem, ErrorState, Field, Input, LoadingBlock, PageHeader, StatusBadge,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { studentApi } from '../../services/endpoints';
import { batchOf, displayName, fmtDate, isDemoId, money } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

export default function StudentProfile() {
  useTitle('Profile');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: studentApi.me });
  const [phone, setPhone] = useState('');
  useEffect(() => setPhone(q.data?.phone ?? ''), [q.data?.phone]);

  const save = useMutation({
    mutationFn: () => studentApi.updateMe({ phone: phone.trim() || null }),
    onSuccess: (s) => {
      qc.setQueryData(['me'], (old: object | undefined) => ({ ...old, ...s }));
      notifySuccess('Profile updated');
    },
    onError: (e) => notifyError(e, 'Could not save'),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your record in the STUDENT relation." />
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-navy-900 via-navy-700 to-brand-600" />
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar name={s.full_name} size="xl" className="-mt-8 ring-4 ring-white" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-navy-900">{displayName(s.full_name)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-mono text-[13px]">{s.student_id}</span>
              {s.gender && <StatusBadge status={s.gender} />}
              {isDemoId(s.student_id) && <Badge tone="violet">Synthetic demo account</Badge>}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal details" icon={<UserRound className="size-4" />} />
          <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
            <DescriptionItem label="Full name">{displayName(s.full_name)}</DescriptionItem>
            <DescriptionItem label="Student ID"><span className="font-mono">{s.student_id}</span></DescriptionItem>
            <DescriptionItem label="Programme">{s.program ?? <span className="text-slate-400">Not recorded</span>}</DescriptionItem>
            <DescriptionItem label="Batch">{batchOf(s.student_id) ?? '—'}</DescriptionItem>
            <DescriptionItem label="E-mail"><span className="flex items-center gap-1.5"><Mail className="size-3.5 text-slate-400" />{s.email}</span></DescriptionItem>
            <DescriptionItem label="Gender">{s.gender ? s.gender.charAt(0) + s.gender.slice(1).toLowerCase() : '—'}</DescriptionItem>
            <DescriptionItem label="Residence">
              {s.hostel_name ? <span className="flex items-center gap-1.5"><BedDouble className="size-3.5 text-slate-400" />{s.hostel_name} · {s.room_no}</span> : 'Not allocated'}
            </DescriptionItem>
            <DescriptionItem label="Allocated since">{fmtDate(s.allocated_since)}</DescriptionItem>
            <DescriptionItem label="Total spend (trigger-maintained)">{money(s.total_deductions_amount)}</DescriptionItem>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact number" icon={<Phone className="size-4" />} />
            <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <Field label="Phone" hint="Optional. Digits, spaces and + - ( ) only.">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Not provided" maxLength={20} inputMode="tel" />
              </Field>
              <Button type="submit" size="sm" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={(s.phone ?? '') === phone.trim()}>
                Save
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <div className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Lock className="size-4" /></div>
              <div className="text-[13px] leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-800">Managed by the SWD office</p>
                Name, e-mail, programme and room are maintained by administrators. Contact the SWD office for corrections.
              </div>
            </div>
            <div className="mt-4 flex gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span><ShieldCheck className="mr-1 inline size-3.5" />Demo sign-in only: authentication is an application-layer concern and is not stored in the domain schema.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
