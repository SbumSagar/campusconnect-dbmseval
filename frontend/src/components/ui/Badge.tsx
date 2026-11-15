import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'sky' | 'navy' | 'pink' | 'orange';

const tones: Record<Tone, { pill: string; dot: string }> = {
  gray: { pill: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  blue: { pill: 'bg-brand-50 text-brand-700 ring-brand-200/70', dot: 'bg-brand-500' },
  green: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70', dot: 'bg-emerald-500' },
  amber: { pill: 'bg-amber-50 text-amber-800 ring-amber-200/80', dot: 'bg-amber-500' },
  red: { pill: 'bg-rose-50 text-rose-700 ring-rose-200/70', dot: 'bg-rose-500' },
  violet: { pill: 'bg-violet-50 text-violet-700 ring-violet-200/70', dot: 'bg-violet-500' },
  sky: { pill: 'bg-sky-50 text-sky-700 ring-sky-200/70', dot: 'bg-sky-500' },
  navy: { pill: 'bg-navy-900 text-white ring-navy-900', dot: 'bg-white' },
  pink: { pill: 'bg-pink-50 text-pink-700 ring-pink-200/70', dot: 'bg-pink-500' },
  orange: { pill: 'bg-orange-50 text-orange-700 ring-orange-200/70', dot: 'bg-orange-500' },
};

export function Badge({ tone = 'gray', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone].pill, className)}>
      {dot && <span className={cn('size-1.5 rounded-full', tones[tone].dot)} />}
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label?: string }> = {
  // orders
  PLACED: { tone: 'blue', label: 'Placed' },
  PREPARING: { tone: 'amber', label: 'Preparing' },
  READY: { tone: 'violet', label: 'Ready for pickup' },
  COMPLETED: { tone: 'green', label: 'Completed' },
  CANCELLED: { tone: 'gray', label: 'Cancelled' },
  // outpasses
  PENDING: { tone: 'amber', label: 'Pending' },
  APPROVED: { tone: 'green', label: 'Approved' },
  REJECTED: { tone: 'red', label: 'Rejected' },
  OVERDUE: { tone: 'red', label: 'Overdue' },
  RETURNED: { tone: 'sky', label: 'Returned' },
  // documents
  VERIFIED: { tone: 'green', label: 'Verified' },
  // allocations
  ACTIVE: { tone: 'green', label: 'Active' },
  ENDED: { tone: 'gray', label: 'Ended' },
  // calendar
  HOLIDAY: { tone: 'green', label: 'Holiday' },
  EVENT: { tone: 'blue', label: 'Event' },
  EXAM: { tone: 'red', label: 'Exam' },
  // gender
  MALE: { tone: 'sky', label: 'Male' },
  FEMALE: { tone: 'pink', label: 'Female' },
  OTHER: { tone: 'violet', label: 'Other' },
  COED: { tone: 'violet', label: 'Co-ed' },
};

/** Consistent colour + label for every enumerated status in the schema. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { tone: 'gray' as Tone };
  return <Badge tone={s.tone} dot className={className}>{s.label ?? status}</Badge>;
}

export const statusTone = (status: string): Tone => STATUS[status]?.tone ?? 'gray';

/** Small monospace chip used to show SQL object names (constraints, triggers, SQLSTATEs). */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn('rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700 ring-1 ring-slate-200/80 ring-inset', className)}>
      {children}
    </code>
  );
}
