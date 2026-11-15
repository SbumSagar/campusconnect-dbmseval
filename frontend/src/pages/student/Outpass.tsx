import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, differenceInMinutes } from 'date-fns';
import {
  ArrowRight, CalendarClock, CheckCircle2, Clock, DoorOpen, Hourglass, LogIn, Plus, ShieldCheck, XCircle,
} from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Segmented, Skeleton,
  StatCard, StatusBadge, Textarea, useConfirm,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { outpassApi } from '../../services/endpoints';
import type { Outpass, OutpassStatus } from '../../types';
import { fmtDateTime, fromLocalInput, smartDateTime, toLocalInput } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Filter = 'ALL' | OutpassStatus;

function duration(a: string, b: string) {
  const m = differenceInMinutes(new Date(b), new Date(a));
  if (m <= 0) return 'invalid window';
  const h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
}

function NewOutpassModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const defaultOut = addHours(new Date(), 24);
  defaultOut.setMinutes(0, 0, 0);
  const [reason, setReason] = useState('');
  const [outAt, setOutAt] = useState(toLocalInput(defaultOut));
  const [returnBy, setReturnBy] = useState(toLocalInput(addHours(defaultOut, 10)));
  const [err, setErr] = useState<string | null>(null);
  const windowInvalid = outAt && returnBy && new Date(returnBy) <= new Date(outAt);

  const create = useMutation({
    mutationFn: () => outpassApi.create({ reason: reason.trim(), out_at: fromLocalInput(outAt), return_by: fromLocalInput(returnBy) }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['my-outpasses'] });
      qc.invalidateQueries({ queryKey: ['outpass-summary'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Outpass requested', `Request #${o.request_id} is pending review by the hostel office.`);
      setReason('');
      onClose();
    },
    onError: (e) => notifyError(e, 'Request not submitted'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setErr('Please describe why you are leaving campus.');
    if (!outAt || !returnBy) return setErr('Choose both departure and return times.');
    setErr(null);
    create.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="Request an outpass" description="Your warden reviews the request before you leave."
      icon={<DoorOpen className="size-4.5" />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="outpass-form" loading={create.isPending}>Submit request</Button>
      </>}>
      <form id="outpass-form" onSubmit={submit} className="space-y-4">
        <Field label="Reason" required error={err}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Going home for the weekend" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departure" required>
            <Input type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
          </Field>
          <Field label="Expected return" required>
            <Input type="datetime-local" value={returnBy} onChange={(e) => setReturnBy(e.target.value)} invalid={!!windowInvalid} />
          </Field>
        </div>
        {outAt && returnBy && (
          <div className={windowInvalid
            ? 'rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200'
            : 'flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200/70'}>
            {windowInvalid ? (
              <>The return time is not after the departure. If you submit, PostgreSQL will reject the row with the check constraint <code className="font-mono">chk_outpass_window</code> (return_by &gt; out_at).</>
            ) : (
              <><Hourglass className="size-3.5 text-slate-400" /> You will be away for <b className="text-slate-800">{duration(fromLocalInput(outAt), fromLocalInput(returnBy))}</b>.</>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

function ReturnModal({ outpass, onClose }: { outpass: Outpass | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [at, setAt] = useState(toLocalInput(new Date()));
  const m = useMutation({
    mutationFn: () => outpassApi.recordReturn(outpass!.request_id, fromLocalInput(at)),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['my-outpasses'] });
      qc.invalidateQueries({ queryKey: ['outpass-summary'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Welcome back!', o.returned_late ? 'Your return was recorded after the expected time.' : 'Your return was recorded on time.');
      onClose();
    },
    onError: (e) => notifyError(e, 'Return not recorded'),
  });
  return (
    <Modal open={!!outpass} onClose={onClose} size="sm" title="Record your return" icon={<LogIn className="size-4.5" />}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Record return</Button></>}>
      {outpass && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600 ring-1 ring-slate-200/70">
            <p className="font-medium text-slate-800">{outpass.reason}</p>
            <p className="mt-1">Left {fmtDateTime(outpass.out_at)} · due back {fmtDateTime(outpass.return_by)}</p>
          </div>
          <Field label="Returned at" hint="A time before departure is rejected by chk_outpass_returned.">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function OutpassCard({ o, onReturn }: { o: Outpass; onReturn: (o: Outpass) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const cancel = useMutation({
    mutationFn: () => outpassApi.cancel(o.request_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-outpasses'] });
      qc.invalidateQueries({ queryKey: ['outpass-summary'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Outpass cancelled');
    },
    onError: (e) => notifyError(e),
  });
  const notLeft = new Date(o.out_at) > new Date();
  const canCancel = o.status === 'PENDING' || (o.status === 'APPROVED' && notLeft && !o.returned_at);
  const canReturn = o.status === 'APPROVED' && !o.returned_at && !notLeft; // only after departure

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            {o.is_overdue && <Badge tone="red" dot>Overdue</Badge>}
            {o.returned_at && <Badge tone={o.returned_late ? 'orange' : 'sky'} dot>{o.returned_late ? 'Returned late' : 'Returned'}</Badge>}
            <span className="font-mono text-xs text-slate-400">#{o.request_id}</span>
          </div>
          <p className="mt-2.5 text-[15px] font-semibold text-navy-900">{o.reason}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5 text-slate-400" />{smartDateTime(o.out_at)}</span>
            <ArrowRight className="size-3.5 text-slate-300" />
            <span>{smartDateTime(o.return_by)}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{duration(o.out_at, o.return_by)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {canReturn && <Button size="sm" icon={<LogIn className="size-3.5" />} onClick={() => onReturn(o)}>I'm back</Button>}
          {canCancel && (
            <Button size="sm" variant="secondary" loading={cancel.isPending}
              onClick={async () => (await confirm({ title: 'Cancel this outpass?', confirmText: 'Cancel outpass', cancelText: 'Keep', tone: 'danger' })) && cancel.mutate()}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {(o.reviewed_at || o.returned_at) && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {o.reviewed_at && (
            <span className="flex items-center gap-1.5">
              {o.status === 'REJECTED' ? <XCircle className="size-3.5 text-rose-500" /> : <ShieldCheck className="size-3.5 text-emerald-500" />}
              {o.status === 'REJECTED' ? 'Rejected' : 'Reviewed'} by <b className="font-medium text-slate-700">{o.reviewer_name ?? 'admin'}</b>
              {o.reviewer_role && <span className="text-slate-400">({o.reviewer_role})</span>} · {smartDateTime(o.reviewed_at)}
            </span>
          )}
          {o.returned_at && (
            <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-sky-500" /> Returned {smartDateTime(o.returned_at)}</span>
          )}
        </div>
      )}
    </Card>
  );
}

export default function StudentOutpass() {
  useTitle('Outpass');
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState<Outpass | null>(null);
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as Filter;
  const page = Number(params.get('page') ?? 1) || 1;
  const setStatus = (v: Filter) => setParams(v === 'ALL' ? {} : { status: v });
  const setPage = (p: number) => setParams({ ...(status !== 'ALL' && { status }), page: String(p) });
  const summary = useQuery({ queryKey: ['outpass-summary'], queryFn: outpassApi.summary });
  const list = useQuery({
    queryKey: ['my-outpasses', status, page],
    queryFn: () => outpassApi.list({ status: status === 'ALL' ? undefined : status, page, pageSize: 8 }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Outpass" description="Request permission to leave campus and record your return."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New outpass</Button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending review" value={s?.pending ?? '…'} icon={<Clock className="size-5" />} accent="amber" />
        <StatCard label="Approved" value={s?.approved ?? '…'} icon={<CheckCircle2 className="size-5" />} accent="green" sub={s ? `${s.out_now} currently out` : undefined} />
        <StatCard label="Rejected" value={s?.rejected ?? '…'} icon={<XCircle className="size-5" />} accent="red" />
        <StatCard label="Overdue" value={s?.overdue ?? '…'} icon={<Hourglass className="size-5" />} accent={s?.overdue ? 'red' : 'sky'} sub="Approved, past return time" />
      </div>

      <div className="flex justify-start">
        <Segmented<Filter> value={status} onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All', count: s?.total }, { value: 'PENDING', label: 'Pending', count: s?.pending },
            { value: 'APPROVED', label: 'Approved', count: s?.approved }, { value: 'REJECTED', label: 'Rejected', count: s?.rejected },
            { value: 'CANCELLED', label: 'Cancelled', count: s?.cancelled },
          ]} />
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : list.data?.rows.length ? (
        <>
          <div className="space-y-3">{list.data.rows.map((o) => <OutpassCard key={o.request_id} o={o} onReturn={setReturning} />)}</div>
          <Card><Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} className="border-0" /></Card>
        </>
      ) : (
        <Card>
          <EmptyState icon={<DoorOpen className="size-6" />} title="No outpasses here" description="Requests you submit will be listed here."
            action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New outpass</Button>} />
        </Card>
      )}

      <NewOutpassModal open={open} onClose={() => setOpen(false)} />
      <ReturnModal key={returning?.request_id} outpass={returning} onClose={() => setReturning(null)} />
    </div>
  );
}
