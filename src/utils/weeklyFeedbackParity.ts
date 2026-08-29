export type WeeklyFeedbackWriteFields = {
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes?: string;
  nextWeekFocus?: string;
};

export type WeeklyFeedbackWritePayload = WeeklyFeedbackWriteFields & {
  updatedAt?: string;
};

export function canonicalWeekStarting(requested: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return null;
  const parsed = new Date(`${requested}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
  return normalized === requested && parsed.getDay() === 0 ? requested : null;
}

export function resolveInitialWeekStarting(requested: string, fallback: string): string {
  return canonicalWeekStarting(requested) || fallback;
}

export function buildWeeklyFeedbackWritePayload(
  fields: WeeklyFeedbackWriteFields,
  updatedAt?: string | null,
): WeeklyFeedbackWritePayload {
  return {
    ...fields,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function describeApiSaveError(body: unknown, status: number): string {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const code = typeof value.error === 'string' ? value.error : '';
  const details = typeof value.details === 'string' ? value.details : '';
  if (status === 409 || code === 'CONFLICT') {
    const editor = typeof value.updatedByName === 'string' && value.updatedByName.trim()
      ? ` by ${value.updatedByName.trim()}`
      : '';
    return `This record was changed${editor}. Reload it before saving again.`;
  }
  if (details) return details;
  if (code) return code;
  return 'Unable to save the record.';
}
