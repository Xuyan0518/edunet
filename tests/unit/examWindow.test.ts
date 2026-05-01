import { describe, expect, it } from 'vitest';
import {
  daysUntilExam,
  effectiveReminderDate,
  isExamUpcoming,
} from '../../server/utils/examWindow';

describe('effectiveReminderDate', () => {
  it('returns the stored reminder when provided', () => {
    expect(effectiveReminderDate('2026-05-20', '2026-05-15')).toBe('2026-05-15');
  });

  it('defaults to examDate - 7 days when stored is null', () => {
    expect(effectiveReminderDate('2026-05-20', null)).toBe('2026-05-13');
  });

  it('defaults to examDate - 7 days when stored is empty string', () => {
    expect(effectiveReminderDate('2026-05-20', '')).toBe('2026-05-13');
  });

  it('handles Date objects from drizzle', () => {
    expect(
      effectiveReminderDate(new Date('2026-05-20T00:00:00Z'), null),
    ).toBe('2026-05-13');
  });

  it('returns null when examDate is invalid', () => {
    expect(effectiveReminderDate('not-a-date', null)).toBeNull();
    expect(effectiveReminderDate(null, null)).toBeNull();
  });

  it('falls back to default when stored reminder is malformed', () => {
    expect(effectiveReminderDate('2026-05-20', 'garbage')).toBe('2026-05-13');
  });
});

describe('isExamUpcoming', () => {
  it('true when today equals examDate (last day of window)', () => {
    expect(isExamUpcoming('2026-05-20', '2026-05-20', '2026-05-13')).toBe(true);
  });

  it('true when today equals reminderDate (first day of window)', () => {
    expect(isExamUpcoming('2026-05-13', '2026-05-20', '2026-05-13')).toBe(true);
  });

  it('false when today is one day before reminderDate', () => {
    expect(isExamUpcoming('2026-05-12', '2026-05-20', '2026-05-13')).toBe(false);
  });

  it('false when today is one day after examDate (exam is past)', () => {
    expect(isExamUpcoming('2026-05-21', '2026-05-20', '2026-05-13')).toBe(false);
  });

  it('uses default reminder window when storedReminderDate is null', () => {
    expect(isExamUpcoming('2026-05-13', '2026-05-20', null)).toBe(true);
    expect(isExamUpcoming('2026-05-12', '2026-05-20', null)).toBe(false);
  });

  it('false on invalid dates', () => {
    expect(isExamUpcoming('garbage', '2026-05-20', null)).toBe(false);
    expect(isExamUpcoming('2026-05-13', 'garbage', null)).toBe(false);
  });
});

describe('daysUntilExam', () => {
  it('positive when exam is in the future', () => {
    expect(daysUntilExam('2026-05-13', '2026-05-20')).toBe(7);
  });

  it('zero on exam day', () => {
    expect(daysUntilExam('2026-05-20', '2026-05-20')).toBe(0);
  });

  it('negative when exam has passed', () => {
    expect(daysUntilExam('2026-05-22', '2026-05-20')).toBe(-2);
  });

  it('NaN on invalid dates', () => {
    expect(daysUntilExam('bad', '2026-05-20')).toBeNaN();
  });
});
