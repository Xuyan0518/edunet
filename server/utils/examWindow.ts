// Upcoming-exam window logic (Part 6).
//
// An exam is "upcoming" relative to `today` when:
//   reminderDate <= today <= examDate
// If no reminderDate is stored, we default it to (examDate - 7 days). Once
// the exam date has passed, the exam is no longer upcoming (it is recorded /
// historical).

import { parseDateString } from './chinaDate';

const MS_PER_DAY = 86_400_000;

const ymd = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dateInUtc = (s: string): Date => new Date(`${s}T00:00:00Z`);

const dateColToYmd = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return ymd(v);
};

/**
 * Effective reminder date: stored value when present, otherwise examDate - 7d.
 * Returns null when examDate itself is invalid.
 */
export function effectiveReminderDate(
  examDate: string | Date | null | undefined,
  storedReminderDate: string | Date | null | undefined,
): string | null {
  const exam = dateColToYmd(examDate);
  if (!exam || !parseDateString(exam)) return null;
  const stored = dateColToYmd(storedReminderDate);
  if (stored && parseDateString(stored)) return stored;
  const d = new Date(dateInUtc(exam).getTime() - 7 * MS_PER_DAY);
  return ymd(d);
}

/**
 * True when `today` is within the exam's reminder window:
 *   reminderDate <= today <= examDate
 */
export function isExamUpcoming(
  today: string,
  examDate: string | Date | null | undefined,
  storedReminderDate: string | Date | null | undefined,
): boolean {
  const t = parseDateString(today);
  if (!t) return false;
  const exam = dateColToYmd(examDate);
  if (!exam || !parseDateString(exam)) return false;
  const reminder = effectiveReminderDate(examDate, storedReminderDate);
  if (!reminder) return false;
  return reminder <= t && t <= exam;
}

/** Inclusive day count between today and examDate; negative if exam is past. */
export function daysUntilExam(
  today: string,
  examDate: string | Date | null | undefined,
): number {
  const t = parseDateString(today);
  const exam = dateColToYmd(examDate);
  if (!t || !exam || !parseDateString(exam)) return NaN;
  const diffMs = dateInUtc(exam).getTime() - dateInUtc(t).getTime();
  return Math.round(diffMs / MS_PER_DAY);
}
