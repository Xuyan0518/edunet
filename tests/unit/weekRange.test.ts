import { describe, expect, it } from 'vitest';
import { isCanonicalWeeklyRange } from '../../server/utils/weekRange';

describe('isCanonicalWeeklyRange', () => {
  it('accepts only Sunday through Saturday ranges', () => {
    expect(isCanonicalWeeklyRange('2026-08-16', '2026-08-22')).toBe(true);
    expect(isCanonicalWeeklyRange('2026-08-19', '2026-08-25')).toBe(false);
    expect(isCanonicalWeeklyRange('2026-08-16', '2026-08-20')).toBe(false);
  });

  it('rejects malformed calendar dates', () => {
    expect(isCanonicalWeeklyRange('2026-02-30', '2026-03-07')).toBe(false);
  });
});
