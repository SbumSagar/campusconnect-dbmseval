import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Download, ExternalLink, FileCheck2, FileImage, FileText, Files, RotateCcw, XCircle } from 'lucide-react';
import {
  Avatar, Button, Card, DataTable, DescriptionItem, Drawer, EmptyState, IconButton, PageHeader, Pagination,
  SearchInput, Segmented, Select, Skeleton, StatCard, StatusBadge, type Column,
} from '../../components/ui';
import { useDebounce, useTitle } from '../../hooks';
import { documentApi } from '../../services/endpoints';
import type { DocumentRow, VerifyStatus } from '../../types';
import { displayName, fmtDate, fmtDateTime, fromNow, number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Filter = 'ALL' | VerifyStatus;
const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

function useSetStatus(onDone?: (d: DocumentRow) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: VerifyStatus }) => documentApi.setStatus(id, status),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['admin-documents'] });
      qc.invalidateQueries({ queryKey: ['document-summary'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      const verb = d.verify_status === 'VERIFIED' ? 'verified' : d.verify_status === 'REJECTED' ? 'rejected' : 'reset to pending';
      notifySuccess(`Document ${verb}`, `${d.doc_type} · ${d.student_id}`);
      onDone?.(d);
    },
    onError: (e) => notifyError(e, 'Could not update the document'),
  });
}

export default function Documents() {
  useTitle('Document Verification');
  const [status, setStatus] = useState<Filter>('PENDING');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const search = useDebounce(q);

  const summary = useQuery({ queryKey: ['document-summary'], queryFn: documentApi.summary });
  const types = useQuery({ queryKey: ['document-types'], queryFn: documentApi.types, staleTime: Infinity });
  const list = useQuery({
    queryKey: ['admin-documents', status, type, search, page],
    queryFn: () => documentApi.list({ status: status === 'ALL' ? undefined : status, type, q: search, page, pageSize: 15 }),
    placeholderData: (p) => p,
  });
  const setDocStatus = useSetStatus((d) => setPreview((p) => (p && p.document_id === d.document_id ? { ...p, ...d } : p)));
  const s = summary.data;

  const actions = (d: DocumentRow) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <IconButton label="Open in new tab" onClick={() => window.open(documentApi.fileUrl(d.document_id), '_blank', 'noopener')}>
        <ExternalLink className="size-4" />
      </IconButton>
      <a href={documentApi.fileUrl(d.document_id, true)} aria-label="Download" title="Download"
        className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
        <Download className="size-4" />
      </a>
      {d.verify_status !== 'VERIFIED' && (
        <IconButton label="Verify" className="hover:bg-emerald-50 hover:text-emerald-700"
          onClick={() => setDocStatus.mutate({ id: d.document_id, status: 'VERIFIED' })}>
          <CheckCircle2 className="size-4" />
        </IconButton>
      )}
      {d.verify_status !== 'REJECTED' && (
        <IconButton label="Reject" className="hover:bg-rose-50 hover:text-rose-700"
          onClick={() => setDocStatus.mutate({ id: d.document_id, status: 'REJECTED' })}>
          <XCircle className="size-4" />
        </IconButton>
      )}
      {d.verify_status !== 'PENDING' && (
        <IconButton label="Reset to pending" onClick={() => setDocStatus.mutate({ id: d.document_id, status: 'PENDING' })}>
          <RotateCcw className="size-4" />
        </IconButton>
      )}
    </div>
  );

  const columns: Column<DocumentRow>[] = [
    {
      key: 'student', header: 'Student', render: (d) => (
        <div className="flex items-center gap-3">
          <Avatar name={d.student_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{displayName(d.student_name)}</p>
            <p className="font-mono text-[11px] text-slate-500">{d.student_id}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (d) => <span className="font-medium text-slate-800">{d.doc_type}</span> },
    {
      key: 'file', header: 'File', hideOnMobile: true, render: (d) => (
        <span className="flex max-w-[220px] items-center gap-2 text-slate-600">
          {isImage(d.file_name) ? <FileImage className="size-4 shrink-0 text-violet-500" /> : <FileText className="size-4 shrink-0 text-rose-500" />}
          <span className="truncate" title={d.file_name}>{d.file_name}</span>
        </span>
      ),
    },
    {
      key: 'uploaded', header: 'Uploaded', hideOnMobile: true, render: (d) => (
        <div className="text-[13px] whitespace-nowrap"><p className="text-slate-800">{fmtDate(d.uploaded_at)}</p><p className="text-slate-500">{fromNow(d.uploaded_at)}</p></div>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.verify_status} /> },
    { key: 'actions', header: '', align: 'right', render: actions },
  ];

  return (
    <div>
      <PageHeader
        title="Document Verification"
        description="Review documents uploaded by students. Files are stored on the server; the DOCUMENT relation holds only metadata and the file path."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!s ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />) : (
          <>
            <StatCard label="Awaiting verification" value={number(s.pending)} icon={<Clock className="size-5" />} accent="amber" />
            <StatCard label="Verified" value={number(s.verified)} icon={<CheckCircle2 className="size-5" />} accent="green" />
            <StatCard label="Rejected" value={number(s.rejected)} icon={<XCircle className="size-5" />} accent="red" />
            <StatCard label="Total documents" value={number(s.total)} icon={<Files className="size-5" />} accent="blue" />
          </>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented<Filter>
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: 'PENDING', label: 'Pending', count: s?.pending },
              { value: 'VERIFIED', label: 'Verified', count: s?.verified },
              { value: 'REJECTED', label: 'Rejected', count: s?.rejected },
              { value: 'ALL', label: 'All', count: s?.total },
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-[200px_1fr] lg:w-[520px]">
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Document type">
              <option value="">All types</option>
              {types.data?.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search student ID or name…" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.rows}
          rowKey={(d) => d.document_id}
          loading={list.isFetching}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={setPreview}
          empty={<EmptyState icon={<FileCheck2 className="size-6" />} title="No documents" description={status === 'PENDING' ? 'All caught up - nothing is waiting for verification.' : 'Nothing matches these filters.'} />}
        />
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Card>

      <Drawer
        open={!!preview}
        onClose={() => setPreview(null)}
        width="max-w-2xl"
        title={preview?.doc_type ?? ''}
        subtitle={preview ? `${displayName(preview.student_name)} · ${preview.student_id}` : undefined}
        footer={preview && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={documentApi.fileUrl(preview.document_id, true)}>
              <Button variant="secondary" icon={<Download className="size-4" />}>Download</Button>
            </a>
            <div className="flex gap-2">
              {preview.verify_status !== 'PENDING' && (
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} disabled={setDocStatus.isPending}
                  onClick={() => setDocStatus.mutate({ id: preview.document_id, status: 'PENDING' })}>Reset</Button>
              )}
              <Button variant="danger" icon={<XCircle className="size-4" />} disabled={preview.verify_status === 'REJECTED'}
                loading={setDocStatus.isPending && setDocStatus.variables?.status === 'REJECTED'}
                onClick={() => setDocStatus.mutate({ id: preview.document_id, status: 'REJECTED' })}>Reject</Button>
              <Button variant="success" icon={<CheckCircle2 className="size-4" />} disabled={preview.verify_status === 'VERIFIED'}
                loading={setDocStatus.isPending && setDocStatus.variables?.status === 'VERIFIED'}
                onClick={() => setDocStatus.mutate({ id: preview.document_id, status: 'VERIFIED' })}>Verify</Button>
            </div>
          </div>
        )}
      >
        {preview && (
          <div className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DescriptionItem label="Status"><StatusBadge status={preview.verify_status} /></DescriptionItem>
              <DescriptionItem label="Uploaded">{fmtDateTime(preview.uploaded_at)}</DescriptionItem>
              <DescriptionItem label="Document ID">#{preview.document_id}</DescriptionItem>
              <DescriptionItem label="Stored path" className="col-span-2 sm:col-span-3">
                <span className="font-mono text-xs text-slate-600">{preview.file_path}</span>
              </DescriptionItem>
            </dl>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {isImage(preview.file_name) ? (
                <img src={documentApi.fileUrl(preview.document_id)} alt={preview.file_name} className="mx-auto max-h-[60vh] object-contain" />
              ) : (
                <iframe title={preview.file_name} src={documentApi.fileUrl(preview.document_id)} className="h-[60vh] w-full bg-white" />
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
