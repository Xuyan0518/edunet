// Server-side counterpart to miniprogram/utils/chinaDate.js. We standardise on
// Asia/Shanghai for all "today" semantics because evening study runs ~21:00
// CST and teachers expect "今日" to follow their wall clock, not the server's.

const SHANGHAI_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Return the current date in Asia/Shanghai as a YYYY-MM-DD string. */
export function chinaTodayDateString(now: Date = new Date()): string {
  // en-CA produces "YYYY-MM-DD" which matches our `daily_progress.date` column.
  return SHANGHAI_DATE_FMT.format(now);
}

/** Validate a YYYY-MM-DD string; return it normalised, or null if invalid. */
export function parseDateString(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yi = Number(y);
  const moi = Number(mo);
  const di = Number(d);
  if (moi < 1 || moi > 12 || di < 1 || di > 31) return null;
  // Sanity-check via Date round-trip (catches e.g. 2025-02-30).
  const probe = new Date(Date.UTC(yi, moi - 1, di));
  if (
    probe.getUTCFullYear() !== yi ||
    probe.getUTCMonth() !== moi - 1 ||
    probe.getUTCDate() !== di
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}
