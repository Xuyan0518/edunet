import { describe, expect, it } from 'vitest';
import { chinaTodayDateString, parseDateString } from '../../server/utils/chinaDate';

describe('chinaTodayDateString', () => {
  it('returns the Asia/Shanghai date for a UTC instant just before midnight CST', () => {
    // 2026-04-30 15:30:00 UTC = 2026-04-30 23:30:00 CST → "2026-04-30"
    expect(chinaTodayDateString(new Date('2026-04-30T15:30:00Z'))).toBe('2026-04-30');
  });

  it('rolls forward to the next day after midnight CST even when UTC is still on the previous day', () => {
    // 2026-04-30 16:30:00 UTC = 2026-05-01 00:30:00 CST → "2026-05-01"
    expect(chinaTodayDateString(new Date('2026-04-30T16:30:00Z'))).toBe('2026-05-01');
  });

  it('formats YYYY-MM-DD with zero-padded month and day', () => {
    // 2026-01-05 12:00:00 UTC → 20:00 CST same day
    expect(chinaTodayDateString(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});

describe('parseDateString', () => {
  it('accepts a well-formed YYYY-MM-DD', () => {
    expect(parseDateString('2026-05-01')).toBe('2026-05-01');
  });

  it('rejects malformed strings', () => {
    expect(parseDateString('2026-5-1')).toBeNull();
    expect(parseDateString('05/01/2026')).toBeNull();
    expect(parseDateString('not-a-date')).toBeNull();
    expect(parseDateString('')).toBeNull();
  });

  it('rejects out-of-range months and days', () => {
    expect(parseDateString('2026-13-01')).toBeNull();
    expect(parseDateString('2026-00-15')).toBeNull();
    expect(parseDateString('2026-02-30')).toBeNull();
    expect(parseDateString('2026-04-31')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(parseDateString(undefined)).toBeNull();
    expect(parseDateString(null)).toBeNull();
    expect(parseDateString(20260501)).toBeNull();
  });
});
