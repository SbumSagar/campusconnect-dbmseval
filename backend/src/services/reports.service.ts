import { loadNamedQueries, query } from '../db/pool.js';
import { badRequest, notFound } from '../utils/errors.js';
import { escapeLike } from '../utils/validate.js';

/**
 * The SQL text of every report lives in db/reports.sql (single source of
 * truth).  This registry only describes parameters and presentation.
 */
type ParamType = 'date' | 'number' | 'text' | 'store';

interface ParamSpec { name: string; label: string; type: ParamType; placeholder?: string }

export interface ReportMeta {
  key: string;
  title: string;
  description: string;
  group: 'Core reports' | 'Advanced SQL';
  concepts: string[];
  params: ParamSpec[];
  chart?: { type: 'bar' | 'line' | 'pie'; x: string; y: string[] };
}

const REPORTS: ReportMeta[] = [
  {
    key: 'student_spending', title: 'Student-wise spending', group: 'Core reports',
    description: 'Total non-cancelled spending and order counts per student, compared with the trigger-maintained total.',
    concepts: ['JOIN (3 tables)', 'GROUP BY', 'FILTER', 'HAVING'],
    params: [
      { name: 'min_spend', label: 'Minimum spend (₹)', type: 'number', placeholder: '0' },
      { name: 'q', label: 'Student ID / name', type: 'text' },
      { name: 'limit', label: 'Rows', type: 'number', placeholder: '100' },
    ],
    chart: { type: 'bar', x: 'full_name', y: ['total_spend'] },
  },
  {
    key: 'store_sales', title: 'Store-wise sales', group: 'Core reports',
    description: 'Orders, revenue, average order value and revenue share per store; the top store is flagged.',
    concepts: ['CTE', 'LEFT JOIN', 'GROUP BY', 'AVG / COUNT DISTINCT', 'RANK() OVER', 'SUM() OVER ()'],
    params: [{ name: 'from', label: 'From', type: 'date' }, { name: 'to', label: 'To', type: 'date' }],
    chart: { type: 'bar', x: 'store_name', y: ['revenue'] },
  },
  {
    key: 'popular_items', title: 'Most popular menu items', group: 'Core reports',
    description: 'Quantity sold per item, ranked inside each store with RANK() and across stores with DENSE_RANK().',
    concepts: ['JOIN on composite keys', 'GROUP BY', 'RANK() OVER (PARTITION BY)', 'DENSE_RANK()'],
    params: [{ name: 'store', label: 'Store', type: 'store' }, { name: 'top', label: 'Top N per store', type: 'number', placeholder: '5' }],
    chart: { type: 'bar', x: 'item_name', y: ['quantity_sold'] },
  },
  {
    key: 'hostel_occupancy', title: 'Hostel occupancy', group: 'Core reports',
    description: 'Rooms, active allocations and the distribution of residents per room for every hostel.',
    concepts: ['Chained CTEs', 'Correlated subquery', 'FILTER', 'SUM() OVER (PARTITION BY)'],
    params: [],
    chart: { type: 'bar', x: 'hostel_name', y: ['empty_rooms', 'single_rooms', 'double_rooms'] },
  },
  {
    key: 'outpass_analytics', title: 'Outpass analytics', group: 'Core reports',
    description: 'Requests by status, approval percentage, overdue and late returns.',
    concepts: ['CTE', 'Conditional aggregation', 'Date arithmetic', 'NULLIF'],
    params: [{ name: 'from', label: 'From', type: 'date' }, { name: 'to', label: 'To', type: 'date' }],
  },
  {
    key: 'outpass_monthly', title: 'Outpasses per month', group: 'Core reports',
    description: 'Monthly outpass requests by outcome with a running total.',
    concepts: ['date_trunc', 'GROUP BY', 'SUM() OVER (ORDER BY)'],
    params: [],
    chart: { type: 'bar', x: 'month', y: ['approved', 'rejected', 'other'] },
  },
  {
    key: 'monthly_revenue', title: 'Monthly revenue trend', group: 'Advanced SQL',
    description: 'Revenue per month, running total and change versus the previous month.',
    concepts: ['CTE', 'Window SUM() OVER (ORDER BY)', 'LAG()'],
    params: [],
    chart: { type: 'line', x: 'month', y: ['revenue', 'running_revenue'] },
  },
  {
    key: 'above_hostel_average', title: 'Above their hostel\'s average', group: 'Advanced SQL',
    description: 'Students who spend more than the average spender living in the same hostel.',
    concepts: ['Correlated subquery'],
    params: [],
  },
  {
    key: 'all_store_customers', title: 'Customers of every store', group: 'Advanced SQL',
    description: 'Relational division: students for whom there is no store they have not ordered from.',
    concepts: ['Double NOT EXISTS', 'Relational division'],
    params: [],
  },
  {
    key: 'unsold_items', title: 'Never-sold menu items', group: 'Advanced SQL',
    description: 'Menu items that do not appear in any non-cancelled order.',
    concepts: ['Nested query', 'NOT IN on a row-value (composite key)'],
    params: [],
  },
  {
    key: 'premium_items', title: 'Items above store average price', group: 'Advanced SQL',
    description: 'Items whose price exceeds the average price of their store.',
    concepts: ['Derived table in FROM', 'JOIN on aggregate'],
    params: [],
  },
  {
    key: 'frequent_outpass', title: 'Frequent outpass requesters', group: 'Advanced SQL',
    description: 'Students with at least N outpass requests and their outcomes.',
    concepts: ['GROUP BY … HAVING', 'FILTER'],
    params: [{ name: 'min', label: 'Minimum requests', type: 'number', placeholder: '3' }],
  },
  {
    key: 'document_status', title: 'Document verification by type', group: 'Advanced SQL',
    description: 'Pending / verified / rejected documents per type with a grand total row.',
    concepts: ['GROUP BY ROLLUP', 'GROUPING()', 'FILTER'],
    params: [],
    chart: { type: 'bar', x: 'doc_type', y: ['pending', 'verified', 'rejected'] },
  },
];

const sqlFile = loadNamedQueries('reports.sql');
for (const r of REPORTS) if (!sqlFile.has(r.key)) throw new Error(`db/reports.sql has no query named ${r.key}`);

export function listReports() {
  return REPORTS.map((r) => ({ ...r, sql: sqlFile.get(r.key)!.sql }));
}

export async function runReport(key: string, raw: Record<string, unknown>) {
  const meta = REPORTS.find((r) => r.key === key);
  if (!meta) throw notFound('Report');
  const params = meta.params.map((p) => {
    const v = raw[p.name];
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (p.type === 'number') {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) throw badRequest(`${p.label} must be a non-negative number`);
      return n;
    }
    if (p.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`${p.label} must be YYYY-MM-DD`);
    return p.type === 'text' ? escapeLike(s.slice(0, 100)) : s.slice(0, 100);
  });
  const sql = sqlFile.get(key)!.sql;
  const t0 = performance.now();
  const result = await query(sql, params);
  return {
    meta,
    sql,
    params: Object.fromEntries(meta.params.map((p, i) => [p.name, params[i]])),
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount,
    durationMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
