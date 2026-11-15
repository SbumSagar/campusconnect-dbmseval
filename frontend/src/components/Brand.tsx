import { cn } from '../utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="url(#cc-g)" />
      <path d="M7.5 13.2 16 8.5l8.5 4.7L16 17.9l-8.5-4.7Z" fill="#bfdbfe" />
      <path d="M10.8 16.1v4.6c0 1.5 2.3 2.8 5.2 2.8s5.2-1.3 5.2-2.8v-4.6L16 19l-5.2-2.9Z" fill="#fff" />
      <path d="M24.5 13.2v5.3" stroke="#bfdbfe" strokeWidth="1.4" strokeLinecap="round" />
      <defs>
        <linearGradient id="cc-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#2554eb" />
          <stop offset="1" stopColor="#12295a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ light, className }: { light?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className={cn('text-[15px] font-semibold tracking-tight', light ? 'text-white' : 'text-navy-900')}>
          Campus<span className={light ? 'text-brand-300' : 'text-brand-600'}>Connect</span>
        </p>
        <p className={cn('text-[11px] font-medium', light ? 'text-slate-400' : 'text-slate-500')}>Student Welfare Division</p>
      </div>
    </div>
  );
}
