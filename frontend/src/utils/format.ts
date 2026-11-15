import { format, formatDistanceToNowStrict, isSameDay, isToday, isTomorrow, isYesterday } from 'date-fns';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('en-IN');

export const money = (v: number | string | null | undefined) => inr.format(Number(v ?? 0));
export const moneyCompact = (v: number | string | null | undefined) => inrCompact.format(Number(v ?? 0));
export const number = (v: number | string | null | undefined) => num.format(Number(v ?? 0));

const d = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

export const fmtDate = (v?: string | Date | null) => (v ? format(d(v), 'd MMM yyyy') : '—');
export const fmtDateShort = (v?: string | Date | null) => (v ? format(d(v), 'd MMM') : '—');
export const fmtTime = (v?: string | Date | null) => (v ? format(d(v), 'h:mm a') : '—');
export const fmtDateTime = (v?: string | Date | null) => (v ? format(d(v), 'd MMM yyyy, h:mm a') : '—');
export const fromNow = (v?: string | Date | null) => (v ? formatDistanceToNowStrict(d(v), { addSuffix: true }) : '—');

/** "Today, 4:30 PM" / "Tomorrow, 9:00 AM" / "12 Nov, 4:30 PM" */
export function smartDateTime(v?: string | Date | null) {
  if (!v) return '—';
  const x = d(v);
  if (isToday(x)) return `Today, ${format(x, 'h:mm a')}`;
  if (isTomorrow(x)) return `Tomorrow, ${format(x, 'h:mm a')}`;
  if (isYesterday(x)) return `Yesterday, ${format(x, 'h:mm a')}`;
  return format(x, x.getFullYear() === new Date().getFullYear() ? 'd MMM, h:mm a' : 'd MMM yyyy, h:mm a');
}

/** Date range text for calendar entries */
export function dateRange(start: string, end?: string | null) {
  const s = new Date(start);
  if (!end) return format(s, 'EEE, d MMM yyyy · h:mm a');
  const e = new Date(end);
  const allDay = format(s, 'HH:mm') === '00:00' && format(e, 'HH:mm') === '23:59';
  if (isSameDay(s, e)) return allDay ? format(s, 'EEE, d MMM yyyy') : `${format(s, 'EEE, d MMM yyyy · h:mm a')} – ${format(e, 'h:mm a')}`;
  return allDay ? `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}` : `${format(s, 'd MMM, h:mm a')} – ${format(e, 'd MMM yyyy, h:mm a')}`;
}

/** Value for <input type="datetime-local"> in local time */
export function toLocalInput(v?: string | Date | null) {
  if (!v) return '';
  return format(d(v), "yyyy-MM-dd'T'HH:mm");
}
/** <input type="datetime-local"> value → ISO string with the browser's offset */
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : '';
}
export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/** Roster names are stored in capitals ("GURRAM ADITH REDDY") - show them in title case. */
export function displayName(name?: string | null) {
  if (!name) return '—';
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

export function initials(name?: string | null) {
  if (!name) return '?';
  const parts = displayName(name).replace(/\(.*?\)/g, '').replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

const campusClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Is a store open at `now`? Hours are campus time (Asia/Kolkata), like the
 * database's fn_store_is_open. Handles stores that close after midnight (20:00-03:00).
 * The API's is_open_now is authoritative; this is only a fallback.
 */
export function isOpenNow(opens?: string | null, closes?: string | null, now = new Date()) {
  if (!opens || !closes) return null;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const cur = m(campusClock.format(now));
  const o = m(opens), c = m(closes);
  return o <= c ? cur >= o && cur < c : cur >= o || cur < c;
}

export const time12 = (t?: string | null) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return format(new Date(2000, 0, 1, h, m), 'h:mm a');
};

/** Student batch year from the institute ID ("2024A7PS0001H" → 2024). */
export const batchOf = (id: string) => /(20\d\d)/.exec(id)?.[1] ?? null;
export const isDemoId = (id?: string) => !!id && id.toUpperCase().startsWith('DEMO');
