import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Updates document.title for each page. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · CampusConnect`;
  }, [title]);
}

/** Re-renders every `ms` (used for "open now" badges, countdowns). */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
