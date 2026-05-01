import { describe, expect, it } from 'vitest';
import { pickCurrentTerm } from '../../server/utils/academicTerms';

describe('pickCurrentTerm', () => {
  const rows = [
    { id: 'A', year: 2026, termType: 'WA1', startDate: '2026-01-05', endDate: '2026-03-15', notes: null },
    { id: 'B', year: 2026, termType: 'WA2', startDate: '2026-04-01', endDate: '2026-06-15', notes: null },
    { id: 'C', year: 2026, termType: 'WA3', startDate: '2026-07-15', endDate: '2026-09-15', notes: null },
    { id: 'D', year: 2026, termType: 'FINALS', startDate: '2026-10-01', endDate: '2026-11-30', notes: null },
  ];

  it('returns the term whose window contains the date', () => {
    expect(pickCurrentTerm(rows, '2026-02-10')?.id).toBe('A');
    expect(pickCurrentTerm(rows, '2026-05-01')?.id).toBe('B');
    expect(pickCurrentTerm(rows, '2026-09-14')?.id).toBe('C');
    expect(pickCurrentTerm(rows, '2026-11-30')?.id).toBe('D');
  });

  it('returns null when no term covers the date (gap)', () => {
    expect(pickCurrentTerm(rows, '2026-03-20')).toBeNull(); // between WA1 and WA2
    expect(pickCurrentTerm(rows, '2026-12-15')).toBeNull(); // after FINALS
  });

  it('returns the most-recently-started term on overlap', () => {
    const overlap = [
      ...rows,
      { id: 'X', year: 2026, termType: 'EXTRA', startDate: '2026-04-10', endDate: '2026-04-30', notes: null },
    ];
    // 2026-04-15 is covered by both B (Apr 1..Jun 15) and X (Apr 10..Apr 30).
    // X starts later → wins.
    expect(pickCurrentTerm(overlap, '2026-04-15')?.id).toBe('X');
  });

  it('handles drizzle Date objects in start/end columns', () => {
    const dateRows = [
      {
        id: 'Y',
        year: 2026,
        termType: 'WA2',
        startDate: new Date('2026-04-01T00:00:00Z'),
        endDate: new Date('2026-06-15T00:00:00Z'),
        notes: null,
      },
    ];
    expect(pickCurrentTerm(dateRows, '2026-05-01')?.id).toBe('Y');
  });

  it('returns null on empty input', () => {
    expect(pickCurrentTerm([], '2026-05-01')).toBeNull();
  });
});
