import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { number } from '../../utils/format';
import { EmptyState, ErrorState, Skeleton } from './Feedback';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
  /** hide on small screens */
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, onRowClick, empty, className, dense, rowClassName }: Props<T>) {
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200/80 bg-slate-50/70">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase first:pl-5 last:pr-5',
                  align(c.align), c.hideOnMobile && 'hidden md:table-cell', c.headerClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3.5 first:pl-5 last:pr-5', c.hideOnMobile && 'hidden md:table-cell')}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-brand-50/40', loading && 'opacity-60', rowClassName?.(row))}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 text-slate-700 first:pl-5 last:pr-5', dense ? 'py-2.5' : 'py-3.5',
                        align(c.align), c.hideOnMobile && 'hidden md:table-cell', c.className,
                      )}
                    >
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="Nothing here yet" description="No records match the current filters." />)}
    </div>
  );
}

export function Pagination({
  page, pages, total, pageSize, onPage, className,
}: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; className?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const btn = 'focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium transition';
  return (
    <div className={cn('flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row', className)}>
      <p className="text-[13px] text-slate-500">
        Showing <span className="font-medium text-slate-700 tabular">{number(from)}–{number(to)}</span> of{' '}
        <span className="font-medium text-slate-700 tabular">{number(total)}</span>
      </p>
      <div className="flex items-center gap-1">
        <button className={cn(btn, 'text-slate-500 hover:bg-slate-100 disabled:opacity-30')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="px-1 text-slate-400">…</span>
          ) : (
            <button key={n} onClick={() => onPage(n)}
              className={cn(btn, 'tabular', n === page ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
              {n}
            </button>
          ),
        )}
        <button className={cn(btn, 'text-slate-500 hover:bg-slate-100 disabled:opacity-30')} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
