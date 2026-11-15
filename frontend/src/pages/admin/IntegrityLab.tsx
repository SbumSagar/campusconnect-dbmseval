import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check, CheckCircle2, ChevronDown, Copy, Database, FlaskConical, KeyRound, Layers, ListChecks, Play, PlayCircle,
  RotateCcw, ShieldCheck, Table2, Timer, Workflow, XCircle, Zap,
} from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, Code, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput,
  Segmented, Skeleton, type Tone,
} from '../../components/ui';
import { useTitle } from '../../hooks';
import { integrityApi } from '../../services/endpoints';
import type { AuditResult, DbCatalog, IntegrityResult, IntegrityTest } from '../../types';
import { cn } from '../../utils/cn';
import { number } from '../../utils/format';
import { notifyError, notifySuccess } from '../../utils/notify';

type Category = IntegrityTest['category'];

const CATEGORY: Record<Category, { tone: Tone; icon: typeof KeyRound }> = {
  Constraint: { tone: 'blue', icon: KeyRound },
  Trigger: { tone: 'violet', icon: Zap },
  'Application rule': { tone: 'orange', icon: ShieldCheck },
  Behaviour: { tone: 'sky', icon: Workflow },
};

// ---------------------------------------------------------------- dark code block
function CodeBlock({ code, maxH = 'max-h-72' }: { code: string; maxH?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyError(new Error('Clipboard is not available'), 'Copy failed');
    }
  };
  return (
    <div className="relative overflow-hidden rounded-xl bg-navy-950 ring-1 ring-navy-800">
      <button type="button" onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/20">
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className={cn('overflow-auto p-4 pr-20 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-slate-200 scrollbar-thin', maxH)}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function PassPill({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
      <Check className="size-3.5" /> PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white">
      <XCircle className="size-3.5" /> FAIL
    </span>
  );
}

// ---------------------------------------------------------------- scenario card
function ScenarioCard({
  test, result, running, onRun,
}: { test: IntegrityTest; result?: IntegrityResult; running: boolean; onRun: () => void }) {
  const [open, setOpen] = useState(true);
  const cat = CATEGORY[test.category];
  const Icon = cat.icon;
  return (
    <Card className={cn('flex flex-col overflow-hidden transition', result && (result.passed ? 'ring-1 ring-emerald-200' : 'ring-1 ring-rose-300'))}>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Badge tone={cat.tone}><Icon className="size-3" /> {test.category}</Badge>
          {result ? <PassPill passed={result.passed} /> : <span className="text-[11px] font-medium text-slate-400">Not run</span>}
        </div>
        <h3 className="mt-3 text-[15px] font-semibold text-navy-900">{test.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{test.rule}</p>
        <dl className="mt-3 space-y-2 text-[12.5px]">
          <div>
            <dt className="font-medium text-slate-500">Enforced by</dt>
            <dd className="mt-0.5 text-slate-700">{test.enforcedBy}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Expected</dt>
            <dd className="mt-0.5 text-slate-700">{test.expected}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <Button size="sm" variant={result ? 'secondary' : 'primary'} loading={running} onClick={onRun}
            icon={result ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}>
            {result ? 'Run again' : 'Run test'}
          </Button>
          {result && (
            <button type="button" onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-slate-500 hover:text-slate-800">
              {open ? 'Hide details' : 'Show details'}
              <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {result && open && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.actual.outcome === 'REJECTED' ? 'red' : 'green'} dot>
              {result.actual.outcome === 'REJECTED' ? 'Rejected' : 'Accepted'}
            </Badge>
            {result.actual.sqlstate && <Code>SQLSTATE {result.actual.sqlstate}</Code>}
            {result.actual.constraint && <Code>{result.actual.constraint}</Code>}
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {result.actual.sqlstate ? 'PostgreSQL said' : 'Result'}
            </p>
            <p className="mt-1 rounded-lg bg-white px-3 py-2 font-mono text-[12px] leading-relaxed break-words text-slate-800 ring-1 ring-slate-200">
              {result.actual.message}
            </p>
            {result.actual.detail && <p className="mt-1.5 font-mono text-[11.5px] break-words text-slate-500">{result.actual.detail}</p>}
          </div>
          {result.notes.length > 0 && (
            <ul className="space-y-1 text-[12.5px] text-slate-600">
              {result.notes.map((n, i) => (
                <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400" />{n}</li>
              ))}
            </ul>
          )}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Operation attempted</p>
            <CodeBlock code={`BEGIN;\n${result.operation}\nROLLBACK;`} maxH="max-h-56" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Timer className="size-3.5" /> {result.durationMs} ms</span>
            {result.rolledBack && (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><RotateCcw className="size-3.5" /> Rolled back ✓ - no data changed</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- audits
function AuditRow({ audit }: { audit: AuditResult }) {
  const [open, setOpen] = useState(false);
  const ok = audit.rowCount === 0;
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50">
        {ok ? <CheckCircle2 className="size-5 shrink-0 text-emerald-500" /> : <XCircle className="size-5 shrink-0 text-rose-500" />}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[13px] font-medium text-navy-900">{audit.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{audit.description}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          {audit.rowCount} rows {ok && '✓'}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-4">
          <CodeBlock code={audit.sql} />
          {!ok && (
            <pre className="overflow-auto rounded-lg bg-rose-50 p-3 font-mono text-[11.5px] text-rose-800 ring-1 ring-rose-200">
              {JSON.stringify(audit.sample, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- catalog
type CatalogTab = 'tables' | 'triggers' | 'indexes' | 'constraints' | 'views' | 'functions';

function CatalogPanel({ data }: { data: DbCatalog }) {
  const [tab, setTab] = useState<CatalogTab>('tables');
  const [q, setQ] = useState('');
  const filter = <T extends Record<string, unknown>>(rows: T[]) => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s))) : rows;
  };
  const constraintsByTable = useMemo(() => {
    const g = new Map<string, DbCatalog['constraints']>();
    for (const c of filter(data.constraints)) {
      if (!g.has(c.table_name)) g.set(c.table_name, []);
      g.get(c.table_name)!.push(c);
    }
    return [...g.entries()];
  }, [data.constraints, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxRows = Math.max(...data.tables.map((t) => t.rows), 1);
  const typeTone: Record<string, Tone> = { 'PRIMARY KEY': 'navy', 'FOREIGN KEY': 'blue', UNIQUE: 'violet', CHECK: 'amber' };

  const Item = ({ title, sub, def, badge }: { title: string; sub?: string; def: string; badge?: ReactNode }) => (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-navy-900">{title}</span>
        {sub && <span className="text-xs text-slate-500">on <span className="font-medium text-slate-700">{sub}</span></span>}
        {badge}
      </div>
      <p className="mt-1.5 font-mono text-[11.5px] leading-relaxed break-words text-slate-600">{def}</p>
    </li>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Database objects"
        subtitle="Read live from pg_catalog / information_schema"
        icon={<Layers className="size-4" />}
      />
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 md:flex-row md:items-center md:justify-between">
        <Segmented<CatalogTab>
          value={tab}
          onChange={(t) => { setTab(t); setQ(''); }}
          options={[
            { value: 'tables', label: 'Tables', count: data.tables.length },
            { value: 'triggers', label: 'Triggers', count: data.triggers.length },
            { value: 'indexes', label: 'Indexes', count: data.indexes.length },
            { value: 'constraints', label: 'Constraints', count: data.constraints.length },
            { value: 'views', label: 'Views', count: data.views.length },
            { value: 'functions', label: 'Functions', count: data.functions.length },
          ]}
        />
        {tab !== 'tables' && <SearchInput value={q} onChange={setQ} placeholder={`Search ${tab}…`} className="md:w-64" />}
      </div>

      <div className="max-h-[560px] overflow-y-auto scrollbar-thin">
        {tab === 'tables' && (
          <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {data.tables.map((t) => (
              <li key={t.table_name} className="bg-white px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-[13px] font-medium text-navy-900">
                    <Table2 className="size-3.5 text-slate-400" />{t.table_name}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 tabular">{number(t.rows)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, (t.rows / maxRows) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'triggers' && (
          <ul className="divide-y divide-slate-100">
            {filter(data.triggers).map((t) => (
              <Item key={t.name + t.table_name} title={t.name} sub={t.table_name} def={t.definition}
                badge={<>{t.deferrable && <Badge tone="violet">deferrable</Badge>}<Code>{t.function_name}()</Code></>} />
            ))}
          </ul>
        )}
        {tab === 'indexes' && (
          <ul className="divide-y divide-slate-100">
            {filter(data.indexes).map((i) => (
              <Item key={i.name} title={i.name} sub={i.table_name} def={i.definition}
                badge={/WHERE/i.test(i.definition) ? <Badge tone="amber">partial</Badge> : /UNIQUE/i.test(i.definition) ? <Badge tone="violet">unique</Badge> : undefined} />
            ))}
          </ul>
        )}
        {tab === 'constraints' && (
          constraintsByTable.length ? constraintsByTable.map(([table, list]) => (
            <div key={table}>
              <p className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50/95 px-5 py-1.5 font-mono text-xs font-semibold text-slate-600 backdrop-blur">
                {table} <span className="font-sans font-normal text-slate-400">· {list.length}</span>
              </p>
              <ul className="divide-y divide-slate-100">
                {list.map((c) => (
                  <Item key={c.name} title={c.name} def={c.definition} badge={<Badge tone={typeTone[c.type] ?? 'gray'}>{c.type}</Badge>} />
                ))}
              </ul>
            </div>
          )) : <EmptyState title="No constraints match" />
        )}
        {tab === 'views' && (
          <ul className="divide-y divide-slate-100">
            {filter(data.views).map((v) => (
              <li key={v.name} className="space-y-2 px-5 py-4">
                <span className="font-mono text-[13px] font-semibold text-navy-900">{v.name}</span>
                <CodeBlock code={v.definition.trim()} maxH="max-h-56" />
              </li>
            ))}
          </ul>
        )}
        {tab === 'functions' && (
          <ul className="divide-y divide-slate-100">
            {filter(data.functions).map((f) => (
              <Item key={f.name + f.args} title={`${f.name}(${f.args})`} def={`RETURNS ${f.returns}`}
                badge={f.returns === 'trigger' ? <Badge tone="violet">trigger fn</Badge> : <Badge tone="green">stored function</Badge>} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- page
type Filter = 'All' | Category;

export default function IntegrityLab() {
  useTitle('Integrity Lab');
  const tests = useQuery({ queryKey: ['integrity-tests'], queryFn: integrityApi.tests, staleTime: Infinity });
  const audits = useQuery({ queryKey: ['integrity-audits'], queryFn: integrityApi.audits });
  const catalog = useQuery({ queryKey: ['integrity-catalog'], queryFn: integrityApi.catalog });
  const [results, setResults] = useState<Record<string, IntegrityResult>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('All');

  const runAll = useMutation({
    mutationFn: integrityApi.runAll,
    onSuccess: (r) => {
      setResults(Object.fromEntries(r.results.map((x) => [x.key, x])));
      audits.refetch();
      if (r.passed === r.total) notifySuccess(`All ${r.total} scenarios passed`, 'Every invalid operation was rejected; every transaction was rolled back.');
      else notifyError(new Error(`${r.total - r.passed} scenario(s) failed`), 'Integrity Lab');
    },
    onError: (e) => notifyError(e, 'Could not run the tests'),
  });

  const runOne = async (key: string) => {
    setRunning((s) => new Set(s).add(key));
    try {
      const r = await integrityApi.run(key);
      setResults((m) => ({ ...m, [key]: r }));
    } catch (e) {
      notifyError(e, 'Test failed to run');
    } finally {
      setRunning((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const ran = Object.values(results);
  const passed = ran.filter((r) => r.passed).length;
  const total = tests.data?.length ?? 0;
  const allRan = total > 0 && ran.length === total;

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: tests.data?.length ?? 0 };
    for (const t of tests.data ?? []) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [tests.data]);
  const visible = (tests.data ?? []).filter((t) => filter === 'All' || t.category === filter);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Database Integrity Lab"
        description="Each scenario sends real SQL to PostgreSQL inside BEGIN … ROLLBACK on a dedicated connection. The outcome, SQLSTATE and constraint shown are exactly what the database returned - and nothing persists."
        actions={
          <Button size="lg" icon={<PlayCircle className="size-4.5" />} loading={runAll.isPending} onClick={() => runAll.mutate()} disabled={!total}>
            Run all tests
          </Button>
        }
      />

      {/* score summary */}
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-slate-100 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:divide-x md:divide-y-0">
          <div className="flex items-center gap-4 p-5">
            <div className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-2xl',
              !ran.length ? 'bg-slate-100 text-slate-400' : passed === ran.length ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white',
            )}>
              {!ran.length ? <FlaskConical className="size-7" /> : passed === ran.length ? <Check className="size-8" strokeWidth={2.5} /> : <XCircle className="size-7" />}
            </div>
            <div>
              <p className="text-[13px] font-medium text-slate-500">Scenarios passed</p>
              <p className="text-3xl font-semibold tracking-tight text-navy-900 tabular">
                {ran.length ? passed : '–'}<span className="text-lg text-slate-400"> / {ran.length || total}</span>
              </p>
              <p className="text-xs text-slate-500">{!ran.length ? 'Run the suite to execute every scenario' : allRan ? 'Full suite executed' : `${ran.length} of ${total} executed`}</p>
            </div>
          </div>
          {[
            { label: 'Rejected by PostgreSQL', value: ran.filter((r) => r.actual.sqlstate).length, icon: Database, tone: 'text-brand-600 bg-brand-50' },
            { label: 'Transactions rolled back', value: ran.filter((r) => r.rolledBack).length, icon: RotateCcw, tone: 'text-emerald-600 bg-emerald-50' },
            {
              label: 'Audit queries clean',
              value: audits.data ? `${audits.data.audits.filter((a) => a.rowCount === 0).length}/${audits.data.audits.length}` : '–',
              icon: ListChecks, tone: 'text-violet-600 bg-violet-50',
            },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 p-5">
              <div className={cn('flex size-10 items-center justify-center rounded-xl', s.tone)}><s.icon className="size-5" /></div>
              <div>
                <p className="text-[12.5px] text-slate-500">{s.label}</p>
                <p className="text-xl font-semibold text-navy-900 tabular">{ran.length || s.label.startsWith('Audit') ? s.value : '–'}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* scenarios */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">Test scenarios</h2>
            <p className="text-sm text-slate-500">Invalid operations that the design must refuse, plus trigger behaviour checks.</p>
          </div>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={(['All', 'Constraint', 'Trigger', 'Application rule', 'Behaviour'] as Filter[]).map((f) => ({ value: f, label: f, count: counts[f] ?? 0 }))}
          />
        </div>
        {tests.error ? (
          <Card><ErrorState error={tests.error} onRetry={() => tests.refetch()} /></Card>
        ) : tests.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <ScenarioCard key={t.key} test={t} result={results[t.key]}
                running={running.has(t.key) || runAll.isPending} onRun={() => runOne(t.key)} />
            ))}
          </div>
        )}
      </section>

      {/* audits */}
      <section className="grid gap-6">
        <Card className="overflow-hidden">
          <CardHeader
            title="Audit queries"
            subtitle="db/audit.sql - every query must return zero rows (derived values and rules are consistent)"
            icon={<ListChecks className="size-4" />}
            actions={
              <Button variant="secondary" size="sm" icon={<RotateCcw className="size-3.5" />} loading={audits.isFetching} onClick={() => audits.refetch()}>
                Re-run
              </Button>
            }
          />
          {audits.error ? <ErrorState error={audits.error} onRetry={() => audits.refetch()} />
            : !audits.data ? <LoadingBlock label="Running audit queries…" />
              : (
                <>
                  <div className={cn('flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium',
                    audits.data.allPassed ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
                    {audits.data.allPassed ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    {audits.data.allPassed ? 'All audits return zero rows - the database is consistent.' : 'Some audits found inconsistent rows.'}
                  </div>
                  <ul className="divide-y divide-slate-100">{audits.data.audits.map((a) => <AuditRow key={a.name} audit={a} />)}</ul>
                </>
              )}
        </Card>

        {catalog.error ? <Card><ErrorState error={catalog.error} onRetry={() => catalog.refetch()} /></Card>
          : !catalog.data ? <Card><CardBody><LoadingBlock label="Reading pg_catalog…" /></CardBody></Card>
            : <CatalogPanel data={catalog.data} />}
      </section>
    </div>
  );
}
