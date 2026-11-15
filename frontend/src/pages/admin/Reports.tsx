import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BarChart3, Check, ChevronDown, Clock, Copy, Database, Download, FileSpreadsheet, Play, RotateCcw, Sigma,
} from 'lucide-react';
import { BarChartCard, LineChartCard } from '../../components/charts/Charts';
import {
  Badge, Button, Card, CardBody, CardHeader, Column, DataTable, EmptyState, ErrorState, Field, Input, LoadingBlock,
  PageHeader, Select, Skeleton, StatCard,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { reportApi, storeApi } from '../../services/endpoints';
import type { ReportMeta, ReportResult } from '../../types';
import { cn } from '../../utils/cn';
import { fmtDateTime, money, moneyCompact, number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

// ---------------------------------------------------------------- column helpers
const ACRONYMS: Record<string, string> = { id: 'ID', pct: '%', avg: 'Avg' };
const humanise = (col: string) =>
  col.split('_').map((w, i) => ACRONYMS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

const isMoney = (c: string) => /(spend|revenue|value|price|amount|change_vs)/.test(c) && !/pct/.test(c);
const isPct = (c: string) => /pct$/.test(c);
const isDate = (c: string) => /_at$/.test(c);

function formatCell(col: string, v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-300">—</span>;
  if (typeof v === 'boolean') return <Badge tone={v ? 'green' : 'gray'}>{v ? 'Yes' : 'No'}</Badge>;
  if (isDate(col)) return <span className="whitespace-nowrap text-slate-600">{fmtDateTime(String(v))}</span>;
  if (typeof v === 'number') {
    if (isMoney(col)) return money(v);
    if (isPct(col)) return `${v}%`;
    return number(v);
  }
  return String(v);
}

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- SQL panel
function SqlBlock({ sql, className }: { sql: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyError(new Error('Clipboard is not available'), 'Copy failed');
    }
  };
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-navy-950 ring-1 ring-navy-800', className)}>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/20"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="max-h-[420px] overflow-auto p-4 pr-20 font-mono text-[12.5px] leading-relaxed text-slate-200 scrollbar-thin">
        <code>{sql}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------- chart
function ReportChart({ result }: { result: ReportResult }) {
  const chart = result.meta.chart!;
  const key = result.meta.key;
  let rows = result.rows.filter((r) => r[chart.x] !== 'ALL TYPES');
  const single = chart.y.length === 1;
  let horizontal = false;
  let x = chart.x;

  if (chart.type === 'bar' && single && rows.length > 8) {
    horizontal = true;
    rows = [...rows].sort((a, b) => Number(b[chart.y[0]]) - Number(a[chart.y[0]])).slice(0, 12);
  }
  if (key === 'popular_items') {
    rows = rows.map((r) => ({ ...r, __label: `${r.item_name} · ${String(r.store_name).split(' ')[0]}` }));
    x = '__label';
  }
  if (!rows.length) return null;

  const moneyY = chart.y.every(isMoney);
  const series = chart.y.map((k) => ({ key: k, label: humanise(k) }));
  const fmt = moneyY ? (v: number) => money(v) : (v: number) => number(v);
  const axisFmt = moneyY ? (v: number) => moneyCompact(v) : (v: number) => number(v);
  const height = horizontal ? Math.max(220, rows.length * 32 + 40) : 280;
  const stacked = chart.y.length > 1 && chart.type === 'bar';
  const title = single ? humanise(chart.y[0]) : series.map((s) => s.label).join(' · ');

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={horizontal && result.rows.length > rows.length ? `Top ${rows.length} of ${result.rows.length} rows` : `By ${humanise(chart.x).toLowerCase()}`}
        icon={<BarChart3 className="size-4" />}
      />
      <CardBody>
        {chart.type === 'line' ? (
          <LineChartCard data={rows} x={x} series={series} fmt={fmt} axisFmt={axisFmt} />
        ) : (
          <BarChartCard data={rows} x={x} series={series} horizontal={horizontal} stacked={stacked} fmt={fmt} axisFmt={axisFmt} height={height} />
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- outpass summary tiles
function OutpassTiles({ row }: { row: Record<string, unknown> }) {
  const n = (k: string) => number(Number(row[k] ?? 0));
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total requests" value={n('total_requests')} icon={<Sigma className="size-5" />} accent="navy" />
      <StatCard label="Approved" value={n('approved')} icon={<Check className="size-5" />} accent="green" sub={`${row.approval_rate_pct ?? 0}% approval rate`} />
      <StatCard label="Rejected" value={n('rejected')} icon={<RotateCcw className="size-5" />} accent="red" />
      <StatCard label="Pending" value={n('pending')} icon={<Clock className="size-5" />} accent="amber" sub={`${n('cancelled')} cancelled`} />
      <StatCard label="Overdue now" value={n('overdue_now')} icon={<Clock className="size-5" />} accent="red" sub="Approved, not returned" />
      <StatCard label="Returned late" value={n('returned_late')} icon={<Clock className="size-5" />} accent="violet" sub={`${n('returned_on_time')} on time`} />
    </div>
  );
}

// ---------------------------------------------------------------- parameter form
type ParamValues = Record<string, string>;

function ParamForm({ meta, onRun, running }: { meta: ReportMeta; onRun: (p: ParamValues) => void; running: boolean }) {
  const [values, setValues] = useState<ParamValues>({});
  const stores = useQuery({ queryKey: ['stores'], queryFn: storeApi.list, enabled: meta.params.some((p) => p.type === 'store') });
  useEffect(() => setValues({}), [meta.key]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onRun(values);
  };
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {meta.params.map((p) => (
        <Field key={p.name} label={p.label} htmlFor={`p-${p.name}`} className="sm:w-48">
          {p.type === 'store' ? (
            <Select id={`p-${p.name}`} value={values[p.name] ?? ''} onChange={(e) => set(p.name, e.target.value)}>
              <option value="">All stores</option>
              {stores.data?.map((s) => <option key={s.store_name} value={s.store_name}>{s.store_name}</option>)}
            </Select>
          ) : (
            <Input
              id={`p-${p.name}`}
              type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
              min={p.type === 'number' ? 0 : undefined}
              placeholder={p.placeholder ?? (p.type === 'text' ? 'Any' : undefined)}
              value={values[p.name] ?? ''}
              onChange={(e) => set(p.name, e.target.value)}
            />
          )}
        </Field>
      ))}
      <div className="flex gap-2">
        <Button type="submit" loading={running} icon={<Play className="size-4" />}>Run query</Button>
        {meta.params.length > 0 && Object.values(values).some(Boolean) && (
          <Button variant="ghost" onClick={() => { setValues({}); onRun({}); }}>Reset</Button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- page
export default function Reports() {
  useTitle('Reports & Analytics');
  const [search, setSearch] = useSearchParams();
  const list = useQuery({ queryKey: ['reports'], queryFn: reportApi.list, staleTime: Infinity });
  const selectedKey = search.get('r') ?? list.data?.[0]?.key ?? null;
  const meta = list.data?.find((r) => r.key === selectedKey) ?? null;
  const [params, setParams] = useState<ParamValues>({});
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    setParams({});
    setShowSql(false);
  }, [selectedKey]);

  const result = useQuery({
    queryKey: ['report', selectedKey, params],
    queryFn: () => reportApi.run(selectedKey!, params),
    enabled: !!selectedKey && !!meta,
    placeholderData: keepPreviousData,
  });

  const groups = useMemo(() => {
    const g = new Map<string, ReportMeta[]>();
    for (const r of list.data ?? []) {
      if (!g.has(r.group)) g.set(r.group, []);
      g.get(r.group)!.push(r);
    }
    return [...g.entries()];
  }, [list.data]);

  const data = result.data && result.data.meta.key === selectedKey ? result.data : undefined;

  const columns: Column<Record<string, unknown>>[] = useMemo(() => (data?.columns ?? []).map((c) => {
    const numeric = data!.rows.some((r) => typeof r[c] === 'number');
    return {
      key: c,
      header: humanise(c),
      align: numeric ? 'right' as const : 'left' as const,
      className: cn(numeric && 'tabular whitespace-nowrap', c === data!.columns[0] && 'font-medium text-slate-900'),
      render: (row: Record<string, unknown>) => formatCell(c, row[c]),
    };
  }), [data]);

  const exportCsv = () => {
    if (!data) return;
    download(`${data.meta.key}.csv`, toCsv(data.columns, data.rows));
    notifySuccess('CSV exported', `${data.rowCount} rows`);
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Non-trivial SQL reports executed live on PostgreSQL. The query text comes from db/reports.sql - nothing is precomputed."
      />

      {list.error ? (
        <Card><ErrorState error={list.error} onRetry={() => list.refetch()} /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* report list */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden">
              {list.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : (
                <nav className="max-h-[calc(100vh-8rem)] overflow-y-auto p-2 scrollbar-thin">
                  {groups.map(([group, reports]) => (
                    <div key={group} className="mb-2 last:mb-0">
                      <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{group}</p>
                      {reports.map((r) => {
                        const active = r.key === selectedKey;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onClick={() => setSearch({ r: r.key }, { replace: true })}
                            className={cn(
                              'focus-ring block w-full rounded-xl px-3 py-2.5 text-left transition',
                              active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50',
                            )}
                          >
                            <p className={cn('text-[13.5px] font-medium', active ? 'text-brand-800' : 'text-slate-800')}>{r.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.concepts.slice(0, 3).map((c) => (
                                <span key={c} className={cn('rounded px-1.5 py-px text-[10.5px] font-medium', active ? 'bg-white text-brand-700' : 'bg-slate-100 text-slate-500')}>{c}</span>
                              ))}
                              {r.concepts.length > 3 && <span className="px-1 text-[10.5px] text-slate-400">+{r.concepts.length - 3}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              )}
            </Card>
          </aside>

          {/* selected report */}
          <section className="min-w-0 space-y-6">
            {!meta ? (
              list.isLoading ? <Card><LoadingBlock label="Loading reports…" /></Card>
                : <Card><EmptyState icon={<Database className="size-6" />} title="Choose a report" description="Select a report from the list to run it." /></Card>
            ) : (
              <>
                <Card>
                  <div className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">{meta.group}</p>
                        <h2 className="mt-0.5 text-lg font-semibold text-navy-900">{meta.title}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">{meta.description}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!data?.rows.length}>
                          Export CSV
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {meta.concepts.map((c) => <Badge key={c} tone="violet">{c}</Badge>)}
                    </div>
                    {meta.params.length > 0 && (
                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <ParamForm meta={meta} running={result.isFetching} onRun={setParams} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[12.5px] text-slate-500">
                    <span className="flex items-center gap-2">
                      <Database className="size-3.5 text-brand-500" />
                      {data ? (
                        <>
                          <span className="font-medium text-slate-700 tabular">{number(data.rowCount)} rows</span>·
                          <span className="tabular">{data.durationMs} ms</span>·
                          <span>executed live on PostgreSQL</span>
                        </>
                      ) : result.isFetching ? 'Running query…' : '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSql((s) => !s)}
                      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800"
                    >
                      {showSql ? 'Hide SQL' : 'View SQL'}
                      <ChevronDown className={cn('size-3.5 transition', showSql && 'rotate-180')} />
                    </button>
                  </div>
                  {showSql && (
                    <div className="border-t border-slate-100 p-4">
                      <SqlBlock sql={data?.sql ?? meta.sql} />
                      {data && Object.values(data.params).some((v) => v !== null) && (
                        <p className="mt-2 text-xs text-slate-500">
                          Parameters:{' '}
                          {Object.entries(data.params).map(([k, v], i) => (
                            <span key={k} className="font-mono">{i > 0 && ', '}${i + 1} {k} = {v === null ? 'NULL' : String(v)}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  )}
                </Card>

                {result.error ? (
                  <Card><ErrorState error={result.error} onRetry={() => result.refetch()} /></Card>
                ) : !data ? (
                  <Card><LoadingBlock label="Running query on PostgreSQL…" /></Card>
                ) : (
                  <>
                    {meta.key === 'outpass_analytics' && data.rows[0] && <OutpassTiles row={data.rows[0]} />}
                    {meta.chart && data.rows.length > 0 && <ReportChart result={data} />}
                    <Card className="overflow-hidden">
                      <CardHeader
                        title="Result set"
                        subtitle={`${data.columns.length} columns · ${number(data.rowCount)} rows`}
                        icon={<FileSpreadsheet className="size-4" />}
                      />
                      <DataTable
                        columns={columns}
                        rows={data.rows}
                        rowKey={(r) => data.rows.indexOf(r)}
                        loading={result.isFetching}
                        dense
                        empty={<EmptyState title="No rows returned" description="The query ran successfully but no rows matched. Try different parameters." />}
                      />
                    </Card>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
