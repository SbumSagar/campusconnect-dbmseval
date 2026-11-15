import { toast } from 'sonner';
import { ApiError, errorMessage } from '../services/api';

/**
 * Error toast.  When PostgreSQL rejected the operation the toast also shows
 * the SQLSTATE and the constraint / trigger responsible - so the user (and
 * the examiner) can see the rule was enforced by the database.
 */
export function notifyError(err: unknown, title = 'Action failed') {
  if (err instanceof ApiError && err.fromDatabase) {
    toast.error(err.message, {
      description: (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Rejected by PostgreSQL</span>
          <code className="rounded bg-rose-100/70 px-1.5 py-0.5 font-mono text-[11px] text-rose-800">{err.sqlstate}</code>
          {err.constraint && <code className="rounded bg-rose-100/70 px-1.5 py-0.5 font-mono text-[11px] text-rose-800">{err.constraint}</code>}
        </span>
      ),
      duration: 7000,
    });
    return;
  }
  if (err instanceof ApiError && err.code === 'APP_RULE') {
    toast.error(err.message, { description: 'Rejected by an application business rule', duration: 6000 });
    return;
  }
  toast.error(title, { description: errorMessage(err) });
}

export const notifySuccess = (msg: string, description?: string) => toast.success(msg, { description });
