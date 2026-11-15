import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';

export function PageHeader({
  title, description, actions, breadcrumbs, className,
}: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[]; className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-2 flex items-center gap-1 text-[13px] text-slate-500">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-slate-400" />}
                {b.to ? <Link to={b.to} className="hover:text-brand-600">{b.label}</Link> : <span className="text-slate-700">{b.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const accents = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-rose-50 text-rose-600',
  violet: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
  navy: 'bg-navy-900 text-white',
};

export function StatCard({
  label, value, sub, icon, accent = 'blue', to, className,
}: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode;
  accent?: keyof typeof accents; to?: string; className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex size-10 items-center justify-center rounded-xl', accents[accent])}>{icon}</div>
        {to && <ArrowUpRight className="size-4 text-slate-300 transition group-hover:text-brand-500" />}
      </div>
      <p className="mt-4 text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 tabular">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </>
  );
  const cls = cn('group block min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition', to && 'hover:border-brand-200 hover:shadow-md', className);
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

const avatarColors = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700'];

export function Avatar({ name, size = 'md', className }: { name?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const n = name ?? '?';
  const color = avatarColors[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarColors.length];
  const sz = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-sm', xl: 'size-16 text-lg' }[size];
  return <div className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', color, sz, className)}>{initials(n)}</div>;
}

/** Thin progress bar (e.g. occupancy). */
export function Meter({ value, max, tone = 'blue', className }: { value: number; max: number; tone?: 'blue' | 'green' | 'amber' | 'red'; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { blue: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
