// Academic-term picker (Part 8). Pure function; DB queries live at the
// endpoint level so this file stays trivially testable.

const ymd = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dateColToYmd = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return ymd(v);
};

export type AcademicTermRow = {
  id: string;
  year: number;
  termType: string;
  startDate: string | Date;
  endDate: string | Date;
  notes?: string | null;
};

export type ResolvedAcademicTerm = {
  id: string;
  year: number;
  termType: string;
  startDate: string;
  endDate: string;
  notes: string | null;
};

/**
 * Pick the academic term covering `dateStr`. When multiple terms overlap (a
 * configuration error, but possible), prefer the one whose start is closest
 * to `dateStr` — interpreting overlap as "the most recent term started".
 *
 * Returns null when no row covers the date.
 */
export function pickCurrentTerm(
  rows: AcademicTermRow[],
  dateStr: string,
): ResolvedAcademicTerm | null {
  const candidates = rows
    .map((r) => {
      const start = dateColToYmd(r.startDate);
      const end = dateColToYmd(r.endDate);
      if (!start || !end) return null;
      return {
        id: r.id,
        year: r.year,
        termType: r.termType,
        startDate: start,
        endDate: end,
        notes: r.notes ?? null,
      };
    })
    .filter((r): r is ResolvedAcademicTerm => r !== null && r.startDate <= dateStr && dateStr <= r.endDate);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
  return candidates[0];
}
