import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RotateCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { errorMessage } from '../../services/api';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function LoadingBlock({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500', className)}>
      <Spinner className="size-6" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon, title, description, action, className,
}: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <h3 className="text-[15px] font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <AlertCircle className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold text-navy-900">Couldn't load this</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
