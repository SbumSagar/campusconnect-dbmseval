import { useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Clock, Download, Eye, FileImage, FileText, FileUp, Trash2, UploadCloud, X, XCircle,
} from 'lucide-react';
import {
  Button, Card, CardHeader, DataTable, EmptyState, Field, IconButton, PageHeader, Pagination, Segmented, Select,
  StatCard, StatusBadge, useConfirm, type Column,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { documentApi } from '../../services/endpoints';
import type { DocumentRow, VerifyStatus } from '../../types';
import { cn } from '../../utils/cn';
import { fmtDate, fromNow } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX_MB = 5;
type Filter = 'ALL' | VerifyStatus;

const fileIcon = (name: string) => (/\.(png|jpe?g|webp)$/i.test(name) ? FileImage : FileText);
const prettySize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function UploadCard() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const types = useQuery({ queryKey: ['doc-types'], queryFn: documentApi.types, staleTime: Infinity });
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('');
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) return setErr('Only PDF, PNG, JPG or WEBP files are accepted.');
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`The file is larger than ${MAX_MB} MB.`);
    setErr(null);
    setFile(f);
  };

  const upload = useMutation({
    mutationFn: () => documentApi.upload(file!, type, setProgress),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['my-documents'] });
      qc.invalidateQueries({ queryKey: ['doc-summary'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Document uploaded', `${d.doc_type} is now pending verification.`);
      setFile(null);
      setType('');
      setProgress(0);
    },
    onError: (e) => {
      setProgress(0);
      notifyError(e, 'Upload failed');
    },
  });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const FIcon = file ? fileIcon(file.name) : UploadCloud;
  return (
    <Card>
      <CardHeader title="Upload a document" subtitle={`PDF or image, up to ${MAX_MB} MB`} icon={<FileUp className="size-4" />} />
      <div className="space-y-4 p-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !file && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          className={cn(
            'focus-ring flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition',
            drag ? 'border-brand-400 bg-brand-50/60' : file ? 'border-emerald-300 bg-emerald-50/40' : 'cursor-pointer border-slate-200 bg-slate-50/50 hover:border-brand-300 hover:bg-brand-50/30',
          )}
        >
          <div className={cn('flex size-12 items-center justify-center rounded-2xl', file ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-brand-600 shadow-sm ring-1 ring-slate-200')}>
            <FIcon className="size-6" />
          </div>
          {file ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="text-left">
                <p className="max-w-56 truncate text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{prettySize(file.size)}</p>
              </div>
              <IconButton label="Remove file" onClick={(e) => { e.stopPropagation(); setFile(null); }}><X className="size-4" /></IconButton>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium text-slate-800">Drop a file here or <span className="text-brand-600">browse</span></p>
              <p className="mt-0.5 text-xs text-slate-500">PDF, PNG, JPG, WEBP</p>
            </>
          )}
          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {err && <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600"><AlertTriangle className="size-3.5" />{err}</p>}
        <Field label="Document type" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="" disabled>Choose a type…</option>
            {types.data?.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        {upload.isPending && (
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <Button className="w-full" disabled={!file || !type} loading={upload.isPending} onClick={() => upload.mutate()} icon={<UploadCloud className="size-4" />}>
          Upload document
        </Button>
        <p className="text-[12px] leading-relaxed text-slate-500">
          The file is stored on the server; only its path and verification status are saved in the DOCUMENT table.
        </p>
      </div>
    </Card>
  );
}

export default function StudentDocuments() {
  useTitle('Documents');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as Filter;
  const page = Number(params.get('page') ?? 1) || 1;
  const setStatus = (v: Filter) => setParams(v === 'ALL' ? {} : { status: v });
  const setPage = (p: number) => setParams({ ...(status !== 'ALL' && { status }), page: String(p) });
  const summary = useQuery({ queryKey: ['doc-summary'], queryFn: documentApi.summary });
  const list = useQuery({
    queryKey: ['my-documents', status, page],
    queryFn: () => documentApi.list({ status: status === 'ALL' ? undefined : status, page, pageSize: 10 }),
    placeholderData: keepPreviousData,
  });

  const withdraw = useMutation({
    mutationFn: (id: number) => documentApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-documents'] });
      qc.invalidateQueries({ queryKey: ['doc-summary'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      notifySuccess('Document withdrawn');
    },
    onError: (e) => notifyError(e),
  });

  const columns: Column<DocumentRow>[] = [
    {
      key: 'doc', header: 'Document',
      render: (d) => {
        const Icon = fileIcon(d.file_name);
        return (
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Icon className="size-4.5" /></div>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{d.doc_type}</p>
              <p className="max-w-56 truncate text-xs text-slate-500" title={d.file_name}>{d.file_name}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'uploaded', header: 'Uploaded', hideOnMobile: true, render: (d) => <div><p className="text-slate-700">{fmtDate(d.uploaded_at)}</p><p className="text-xs text-slate-500">{fromNow(d.uploaded_at)}</p></div> },
    {
      key: 'status', header: 'Verification',
      render: (d) => (
        <div>
          <StatusBadge status={d.verify_status} />
          {d.verify_status === 'REJECTED' && <p className="mt-1 text-[11px] text-rose-600">Not accepted - upload a corrected copy</p>}
        </div>
      ),
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (d) => (
        <div className="flex justify-end gap-1">
          <a href={documentApi.fileUrl(d.document_id)} target="_blank" rel="noreferrer"><IconButton label="View"><Eye className="size-4" /></IconButton></a>
          <a href={documentApi.fileUrl(d.document_id, true)}><IconButton label="Download"><Download className="size-4" /></IconButton></a>
          {d.verify_status === 'PENDING' && (
            <IconButton label="Withdraw" className="hover:bg-rose-50 hover:text-rose-600"
              onClick={async () => (await confirm({ title: 'Withdraw this document?', message: 'The file and its record will be deleted.', confirmText: 'Withdraw', tone: 'danger' })) && withdraw.mutate(d.document_id)}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  const s = summary.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Documents" description="Upload certificates and receipts and track their verification." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Uploaded" value={s?.total ?? '…'} icon={<FileText className="size-5" />} />
        <StatCard label="Pending" value={s?.pending ?? '…'} icon={<Clock className="size-5" />} accent="amber" />
        <StatCard label="Verified" value={s?.verified ?? '…'} icon={<CheckCircle2 className="size-5" />} accent="green" />
        <StatCard label="Rejected" value={s?.rejected ?? '…'} icon={<XCircle className="size-5" />} accent="red" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1"><UploadCard /></div>
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="px-1 text-[15px] font-semibold text-navy-900">Upload history</h3>
            <Segmented<Filter> value={status} onChange={setStatus}
              options={[{ value: 'ALL', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'VERIFIED', label: 'Verified' }, { value: 'REJECTED', label: 'Rejected' }]} />
          </div>
          <DataTable columns={columns} rows={list.data?.rows} rowKey={(d) => d.document_id} loading={list.isFetching} error={list.error} onRetry={() => list.refetch()}
            empty={<EmptyState icon={<FileText className="size-6" />} title="No documents" description="Documents you upload appear here." />} />
          {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
        </Card>
      </div>
    </div>
  );
}
