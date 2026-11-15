import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, DoorOpen, LogIn, LogOut, Send, ShieldCheck, XCircle } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, Code, DataTable, DescriptionItem, Drawer, EmptyState, ErrorState, Field, Input,
  PageHeader, Pagination, SearchInput, Segmented, Skeleton, StatCard, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { outpassApi } from '../../services/endpoints';
import type { Outpass, OutpassStatus } from '../../types';
import { cn } from '../../utils/cn';
import { displayName, fmtDateTime, fromLocalInput, fromNow, number, smartDateTime, toLocalInput } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Filter = 'ALL' | OutpassStatus | 'OVERDUE';

export default function Outpasses() {
  useTitle('Outpass Management');
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Outpass | null>(null);
  const search = useDebounce(q);

  const summary = useQuery({ queryKey: ['outpass-summary'], queryFn: outpassApi.summary });
  const list = useQuery({
    queryKey: ['outpasses', filter, search, from, to, page],
    queryFn: () => outpassApi.list({
      status: filter === 'ALL' || filter === 'OVERDUE' ? undefined : filter,
      overdue: filter === 'OVERDUE' ? 'true' : undefined,
      q: search, from, to, page, pageSize: 15,
    }),
    placeholderData: (p) => p,
  });
  const overdue = useQuery({ queryKey: ['outpass-overdue'], queryFn: outpassApi.overdue });

  const s = summary.data;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  const columns: Column<Outpass>[] = [
    {
      key: 'student', header: 'Student', render: (o) => (
        <div className="flex items-center gap-3">
          <Avatar name={o.student_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{displayName(o.student_name)}</p>
            <p className="font-mono text-[11px] text-slate-500">{o.student_id}</p>
          </div>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', hideOnMobile: true, render: (o) => <p className="max-w-[240px] truncate text-slate-600" title={o.reason}>{o.reason}</p> },
    {
      key: 'window', header: 'Out → Return by', render: (o) => (
        <div className="text-[13px] whitespace-nowrap">
          <p className="text-slate-800">{smartDateTime(o.out_at)}</p>
          <p className="text-slate-500">→ {smartDateTime(o.return_by)}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', render: (o) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={o.status} />
          {o.is_overdue && <Badge tone="red">Overdue</Badge>}
          {o.returned_late && <Badge tone="orange">Late return</Badge>}
          {o.returned_at && !o.returned_late && <Badge tone="sky">Returned</Badge>}
        </div>
      ),
    },
    {
      key: 'reviewer', header: 'Reviewed by', hideOnMobile: true, render: (o) => o.reviewer_name
        ? <div className="text-[13px]"><p className="text-slate-800">{o.reviewer_name}</p><p className="text-slate-500">{fromNow(o.reviewed_at)}</p></div>
        : <span className="text-slate-400">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Outpass Management"
        description="Review outpass requests, track students who are out of campus and record their returns."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {summary.isLoading || !s ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />) : (
          <>
            <StatCard label="Pending review" value={number(s.pending)} icon={<Clock className="size-5" />} accent="amber" sub="Awaiting a decision" />
            <StatCard label="Approved" value={number(s.approved)} icon={<CheckCircle2 className="size-5" />} accent="green" />
            <StatCard label="Rejected" value={number(s.rejected)} icon={<XCircle className="size-5" />} accent="red" />
            <StatCard label="Overdue" value={number(s.overdue)} icon={<AlertTriangle className="size-5" />} accent="red" sub="Approved, not returned" />
            <StatCard label="Out right now" value={number(s.out_now)} icon={<DoorOpen className="size-5" />} accent="sky" sub="Within their window" />
          </>
        )}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
            <Segmented<Filter>
              value={filter}
              onChange={(v) => reset(() => setFilter(v))}
              options={[
                { value: 'ALL', label: 'All', count: s?.total },
                { value: 'PENDING', label: 'Pending', count: s?.pending },
                { value: 'APPROVED', label: 'Approved', count: s?.approved },
                { value: 'REJECTED', label: 'Rejected', count: s?.rejected },
                { value: 'CANCELLED', label: 'Cancelled', count: s?.cancelled },
                { value: 'OVERDUE', label: 'Overdue', count: s?.overdue },
              ]}
            />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <SearchInput value={q} onChange={(v) => reset(() => setQ(v))} placeholder="Search student ID, name or reason…" />
              <Input type="date" aria-label="Departure from" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} className="sm:w-40" />
              <Input type="date" aria-label="Departure to" value={to} onChange={(e) => reset(() => setTo(e.target.value))} className="sm:w-40" />
            </div>
          </div>
          <DataTable
            columns={columns}
            rows={list.data?.rows}
            rowKey={(o) => o.request_id}
            loading={list.isFetching}
            error={list.error}
            onRetry={list.refetch}
            onRowClick={setSelected}
            rowClassName={(o) => (o.is_overdue ? 'bg-rose-50/40' : undefined)}
            empty={<EmptyState icon={<ClipboardCheck className="size-6" />} title="No outpass requests" description="Nothing matches these filters." />}
          />
          {list.data && <Pagination {...list.data} onPage={setPage} />}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Overdue now"
            subtitle={<span>Live from the view <Code>v_overdue_outpass</Code></span>}
            icon={<AlertTriangle className="size-4" />}
          />
          {overdue.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : overdue.error ? (
            <ErrorState error={overdue.error} onRetry={overdue.refetch} />
          ) : !overdue.data?.length ? (
            <EmptyState icon={<ShieldCheck className="size-6" />} title="Everyone is back" description="No approved outpass is past its return time." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overdue.data.map((o) => (
                <li key={o.request_id}>
                  <button
                    type="button"
                    onClick={() => outpassApi.get(o.request_id).then(setSelected).catch(notifyError)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-rose-50/40"
                  >
                    <Avatar name={o.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-900">{displayName(o.full_name)}</p>
                      <p className="text-xs text-slate-500">Due {smartDateTime(o.return_by)}</p>
                    </div>
                    <Badge tone="red">{Number(o.hours_overdue).toFixed(1)} h</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <OutpassDrawer outpass={selected} onClose={() => setSelected(null)} onChanged={setSelected} />
    </div>
  );
}

function OutpassDrawer({ outpass, onClose, onChanged }: { outpass: Outpass | null; onClose: () => void; onChanged: (o: Outpass) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [returnAt, setReturnAt] = useState('');

  const refresh = (o: Outpass) => {
    onChanged(o);
    ['outpasses', 'outpass-summary', 'outpass-overdue', 'admin-dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const review = useMutation({
    mutationFn: (d: 'APPROVED' | 'REJECTED') => outpassApi.review(outpass!.request_id, d),
    onSuccess: (o) => {
      refresh(o);
      notifySuccess(`Outpass #${o.request_id} ${o.status.toLowerCase()}`, `Reviewed by ${o.reviewer_name}`);
    },
    onError: (e) => notifyError(e, 'Review failed'),
  });

  const ret = useMutation({
    mutationFn: () => outpassApi.recordReturn(outpass!.request_id, returnAt ? fromLocalInput(returnAt) : undefined),
    onSuccess: (o) => {
      refresh(o);
      setReturnAt('');
      notifySuccess('Return recorded', o.returned_late ? 'The student returned after the deadline.' : 'Returned within the window.');
    },
    onError: (e) => notifyError(e, 'Could not record the return'),
  });

  const decide = async (d: 'APPROVED' | 'REJECTED') => {
    const ok = await confirm({
      title: d === 'APPROVED' ? 'Approve this outpass?' : 'Reject this outpass?',
      message: (
        <div className="space-y-2">
          <p>{displayName(outpass?.student_name)} · {outpass?.reason}</p>
          <p className="text-xs text-slate-500">
            Runs in one transaction: the request row is locked with <Code>SELECT … FOR UPDATE</Code>, then
            <Code>reviewed_by</Code> and <Code>reviewed_at</Code> are written together (<Code>chk_outpass_reviewed</Code>).
          </p>
        </div>
      ),
      confirmText: d === 'APPROVED' ? 'Approve' : 'Reject',
      tone: d === 'APPROVED' ? 'success' : 'danger',
    });
    if (ok) review.mutate(d);
  };

  const o = outpass;
  const departed = o && o.status === 'APPROVED' && new Date(o.out_at) <= new Date();

  return (
    <Drawer
      open={!!o}
      onClose={onClose}
      title={o ? `Outpass #${o.request_id}` : ''}
      subtitle={o ? `${displayName(o.student_name)} · ${o.student_id}` : undefined}
      width="max-w-lg"
      footer={o && o.status === 'PENDING' ? (
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1" icon={<XCircle className="size-4" />} loading={review.isPending && review.variables === 'REJECTED'} onClick={() => decide('REJECTED')}>Reject</Button>
          <Button variant="success" className="flex-1" icon={<CheckCircle2 className="size-4" />} loading={review.isPending && review.variables === 'APPROVED'} onClick={() => decide('APPROVED')}>Approve</Button>
        </div>
      ) : undefined}
    >
      {o && (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={o.status} />
            {o.is_overdue && <Badge tone="red">Overdue</Badge>}
            {o.returned_late && <Badge tone="orange">Late return</Badge>}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Reason</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{o.reason}</p>
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <DescriptionItem label="Departure">{fmtDateTime(o.out_at)}</DescriptionItem>
            <DescriptionItem label="Return by">{fmtDateTime(o.return_by)}</DescriptionItem>
            <DescriptionItem label="Returned at">{o.returned_at ? fmtDateTime(o.returned_at) : '—'}</DescriptionItem>
            <DescriptionItem label="Reviewer">{o.reviewer_name ?? '—'}</DescriptionItem>
          </dl>

          <div>
            <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Timeline</p>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              <TimelineItem icon={<Send className="size-3" />} tone="blue" title="Request submitted" text={`Departure planned ${fmtDateTime(o.out_at)}`} />
              {o.reviewed_at ? (
                <TimelineItem
                  icon={o.status === 'REJECTED' ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                  tone={o.status === 'REJECTED' ? 'red' : 'green'}
                  title={`${o.status === 'REJECTED' ? 'Rejected' : 'Approved'} by ${o.reviewer_name ?? 'admin'}`}
                  text={`${fmtDateTime(o.reviewed_at)}${o.reviewer_role ? ` · ${o.reviewer_role}` : ''}`}
                />
              ) : o.status === 'CANCELLED' ? (
                <TimelineItem icon={<XCircle className="size-3" />} tone="gray" title="Cancelled by the student" />
              ) : (
                <TimelineItem icon={<Clock className="size-3" />} tone="amber" title="Awaiting review" muted />
              )}
              {o.status === 'APPROVED' && (
                <TimelineItem icon={<LogOut className="size-3" />} tone={departed ? 'blue' : 'gray'}
                  title={departed ? 'Left campus' : 'Not yet departed'} text={fmtDateTime(o.out_at)} muted={!departed} />
              )}
              {o.status === 'APPROVED' && (
                o.returned_at ? (
                  <TimelineItem icon={<LogIn className="size-3" />} tone={o.returned_late ? 'red' : 'green'}
                    title={o.returned_late ? 'Returned late' : 'Returned on time'} text={fmtDateTime(o.returned_at)} />
                ) : (
                  <TimelineItem icon={<LogIn className="size-3" />} tone={o.is_overdue ? 'red' : 'gray'}
                    title={o.is_overdue ? `Overdue - was due ${fromNow(o.return_by)}` : 'Return pending'} text={`Due ${fmtDateTime(o.return_by)}`} muted={!o.is_overdue} />
                )
              )}
            </ol>
          </div>

          {o.status === 'APPROVED' && !o.returned_at && (
            <Card className="p-4">
              <p className="text-sm font-semibold text-navy-900">Record return</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Leave empty to use the current time. A time before departure is rejected by <Code>chk_outpass_returned</Code>.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Returned at" className="flex-1">
                  <Input type="datetime-local" value={returnAt} min={toLocalInput(o.out_at)} onChange={(e) => setReturnAt(e.target.value)} />
                </Field>
                <Button icon={<LogIn className="size-4" />} loading={ret.isPending} onClick={() => ret.mutate()}>Record return</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </Drawer>
  );
}

const DOT = {
  blue: 'bg-brand-500', green: 'bg-emerald-500', red: 'bg-rose-500', amber: 'bg-amber-500', gray: 'bg-slate-300',
};

function TimelineItem({ icon, tone, title, text, muted }: { icon: ReactNode; tone: keyof typeof DOT; title: string; text?: string; muted?: boolean }) {
  return (
    <li className="relative">
      <span className={cn('absolute top-0.5 -left-[29px] flex size-4.5 items-center justify-center rounded-full text-white ring-4 ring-white', DOT[tone])}>{icon}</span>
      <p className={cn('text-sm font-medium', muted ? 'text-slate-500' : 'text-slate-900')}>{title}</p>
      {text && <p className="text-xs text-slate-500">{text}</p>}
    </li>
  );
}
