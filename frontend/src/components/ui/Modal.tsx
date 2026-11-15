import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

/**
 * Body scroll lock shared by every overlay.  A counter (not "remember the
 * previous value") so that one overlay closing while another opens in the
 * same render - e.g. the cart drawer closing as the order confirmation opens -
 * can never leave the page stuck with overflow:hidden.
 */
let scrollLocks = 0;
function lockScroll() {
  scrollLocks += 1;
  document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = '';
}

function useEscape(open: boolean, onClose: () => void) {
  // keep the latest onClose without re-running the effects on every render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    lockScroll();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', h);
    return () => {
      document.removeEventListener('keydown', h);
      unlockScroll();
    };
  }, [open]);
}

export function Modal({
  open, onClose, title, description, children, footer, size = 'md', icon,
}: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode;
  footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; icon?: ReactNode;
}) {
  useEscape(open, onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea')?.focus(), 30);
  }, [open]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panel} className={cn('relative flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl', widths[size])}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
          {icon && <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-navy-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="focus-ring -mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open, onClose, title, subtitle, children, footer, width = 'max-w-md',
}: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={cn('absolute inset-y-0 right-0 flex w-full animate-slide-in flex-col bg-white shadow-pop', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-navy-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="focus-ring -mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-white px-5 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- confirm dialog (promise based)
interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary' | 'success';
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title}
        icon={state?.tone === 'danger' ? <AlertTriangle className="size-4.5 text-rose-600" /> : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{state?.cancelText ?? 'Cancel'}</Button>
            <Button variant={state?.tone ?? 'primary'} onClick={() => close(true)} autoFocus>{state?.confirmText ?? 'Confirm'}</Button>
          </>
        }
      >
        {state?.message && <div className="text-sm leading-relaxed text-slate-600">{state.message}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
