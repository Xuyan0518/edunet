import { describe, expect, it } from 'vitest';
import {
  defaultHalfYearPeriod,
  defaultYearPeriod,
  enumerateDefaultCycles,
  periodLengthDays,
  previousPeriod,
} from '../../server/utils/studentAnalytics';

describe('periodLengthDays', () => {
  it('inclusive day count for single day', () => {
    expect(periodLengthDays('2026-05-01', '2026-05-01')).toBe(1);
  });

  it('365 days for non-leap year', () => {
    expect(periodLengthDays('2026-01-01', '2026-12-31')).toBe(365);
  });

  it('366 days for leap year', () => {
    expect(periodLengthDays('2024-01-01', '2024-12-31')).toBe(366);
  });
});

describe('previousPeriod', () => {
  it('mirrors a year window to the prior calendar year', () => {
    expect(previousPeriod({ startDate: '2026-01-01', endDate: '2026-12-31' })).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
  });

  it('mirrors a half-year H1 to the prior H2', () => {
    expect(previousPeriod({ startDate: '2026-01-01', endDate: '2026-06-30' })).toEqual({
      startDate: '2025-07-04',
      endDate: '2025-12-31',
    });
  });

  it('preserves length for arbitrary term windows', () => {
    const current = { startDate: '2026-04-01', endDate: '2026-04-30' };
    const prev = previousPeriod(current);
    expect(periodLengthDays(prev.startDate, prev.endDate)).toBe(periodLengthDays(current.startDate, current.endDate));
    expect(prev.endDate).toBe('2026-03-31');
  });
});

describe('defaultYearPeriod', () => {
  it('returns Jan 1 → Dec 31 of the year of `today`', () => {
    expect(defaultYearPeriod('2026-05-15')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });
});

describe('defaultHalfYearPeriod', () => {
  it('H1 when month <= 6', () => {
    expect(defaultHalfYearPeriod('2026-04-01')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      half: 'H1',
    });
    expect(defaultHalfYearPeriod('2026-06-30')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      half: 'H1',
    });
  });

  it('H2 when month >= 7', () => {
    expect(defaultHalfYearPeriod('2026-07-01')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      half: 'H2',
    });
    expect(defaultHalfYearPeriod('2026-12-31')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      half: 'H2',
    });
  });
});

describe('enumerateDefaultCycles', () => {
  it('lists Sun→Thu cycles fully within the window', () => {
    // 2026-05-03 is a Sunday; cycles every 7 days.
    const out = enumerateDefaultCycles('2026-05-01', '2026-05-31');
    // First Sunday in window is 2026-05-03 → 2026-05-07.
    // Subsequent cycles every 7 days: 2026-05-10..14, 2026-05-17..21, 2026-05-24..28, 2026-05-31 alone is Sun but +4 = Jun 4 outside.
    expect(out).toEqual([
      { startDate: '2026-05-03', endDate: '2026-05-07' },
      { startDate: '2026-05-10', endDate: '2026-05-14' },
      { startDate: '2026-05-17', endDate: '2026-05-21' },
      { startDate: '2026-05-24', endDate: '2026-05-28' },
    ]);
  });

  it('returns empty when window contains no full Sun-Thu cycle', () => {
    // 2026-05-02 is Sat; window ends Wed → first Sunday 2026-05-03, Thursday 2026-05-07 > 2026-05-06, so excluded.
    expect(enumerateDefaultCycles('2026-05-02', '2026-05-06')).toEqual([]);
  });

  it('handles a single-cycle window exactly', () => {
    expect(enumerateDefaultCycles('2026-05-03', '2026-05-07')).toEqual([
      { startDate: '2026-05-03', endDate: '2026-05-07' },
    ]);
  });
});
