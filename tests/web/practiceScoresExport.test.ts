import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePracticeExportRequest, pastMonthRange } from '../../src/domain/practiceExport';
import { practiceAttempts, practiceScoreSheets, loadPracticeScores } from '../../server/services/practiceScoresExport';
import { createMockDb } from '../helpers/mockDb';
import type { Database } from '../../server/db';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const date = '2026-10-11';
const paper = (score: number | null, total: number | null = 10) => ({ paper: { id: 'paper', studentId: a, date, subjectName: 'Math', description: 'Fractions', score, total }, type: 'Practice', school: 'QA school' }) as Parameters<typeof practiceAttempts>[0][number];
const daily = (activities: Record<string, unknown>[]) => ({ id: 'daily', studentId: a, date, activities });
afterEach(() => vi.useRealTimers());

describe('practice export selection and reporting dates', () => {
  it.each([
    ['2026-10-11', '2026-09-11'], ['2026-03-31', '2026-02-28'],
    ['2024-03-31', '2024-02-29'], ['2026-01-31', '2025-12-31'],
  ])('defaults to the past calendar month ending %s', (endDate, startDate) => expect(pastMonthRange(endDate)).toEqual({ startDate, endDate }));
  it('uses the school calendar date for omitted or empty dates', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T17:00:00Z'));
    expect(parsePracticeExportRequest({ scope: 'all', startDate: '', endDate: '' })).toMatchObject({ success: true, data: { startDate: '2026-09-11', endDate: date } });
  });
  it('deduplicates selected students and accepts a single-day range', () => {
    expect(parsePracticeExportRequest({ scope: 'selected', studentIds: [a, a, b], startDate: date, endDate: date })).toMatchObject({ success: true, data: { studentIds: [a, b], startDate: date, endDate: date } });
  });
  it.each([
    { scope: 'selected', studentIds: [] }, { scope: 'selected', studentIds: ['invalid'] },
    { scope: 'grade', grade: ' ' }, { scope: 'other' },
    { scope: 'all', startDate: '2026-02-30' }, { scope: 'all', startDate: '2026-10-12', endDate: date },
    { scope: 'all', endDate: ['2026-10-11'] },
  ])('rejects invalid selections and dates %#', input => expect(parsePracticeExportRequest(input).success).toBe(false));
  it('defaults a missing start relative to the requested end', () => expect(parsePracticeExportRequest({ scope: 'grade', grade: '中一', endDate: '2026-03-31' })).toMatchObject({ success: true, data: { startDate: '2026-02-28', grade: '中一' } }));
});

describe('individual practice score rows', () => {
  it('preserves actual zero, unscored papers, and missing maximum scores', () => {
    const attempts = practiceAttempts([paper(0), paper(null, null)], []);
    const parsed = parsePracticeExportRequest({ scope: 'all', startDate: date, endDate: date });
    if (!parsed.success) throw new Error('invalid fixture');
    const sheets = practiceScoreSheets(parsed.data, { students: [{ id: a, name: '=Not a formula', grade: '中一' }, { id: b, name: 'No practices', grade: '中二' }], attempts });
    expect(sheets[2].rows[1].slice(8, 11)).toEqual([0, 10, 0]);
    expect(sheets[2].rows[2].slice(8, 11)).toEqual([null, null, null]);
    expect(sheets[1].rows[2]).toEqual([b, 'No practices', '中二', 0]);
  });
  it('exports every English exercise once instead of duplicating the task aggregate', () => {
    const attempts = practiceAttempts([], [daily([{ subjectName: 'English', english: { reading: { score: 9, totalScore: 10, articleCount: 2, exercises: [{ score: 0, totalScore: 10, problems: 'A' }, { score: 8, totalScore: 10, problems: 'B' }] } }, englishTasks: [{ key: 'reading', score: 9 }] }])]);
    expect(attempts.map(row => [row.attempt, row.score, row.notes])).toEqual([[1, 0, 'A'], [2, 8, 'B']]);
    expect(new Set(attempts.map(row => row.sourceId)).size).toBe(2);
  });
  it('includes legacy, essay and custom tasks with their available scores', () => {
    const attempts = practiceAttempts([], [daily([{ english: { editing: { score: '5/10', exerciseCount: 3 }, essay: { score: 17, totalScore: 20, title: 'My day', completed: true } }, englishTasks: [{ key: 'oral', displayName: 'Oral practice', exercises: [{ score: 7, maxScore: 10 }, { score: null, maxScore: 10 }] }] }])]);
    expect(attempts.map(row => [row.name, row.score, row.total])).toEqual([['Editing', 5, 10], ['My day', 17, 20], ['Oral practice', 7, 10], ['Oral practice', null, 10]]);
    expect(attempts[0].notes).toContain('individual attempt scores are unavailable');
  });
  it('does not invent an English practice from a blank activity or duplicate embedded paper references', () => expect(practiceAttempts([paper(8)], [daily([{ english: {}, papers: [{ id: 'paper', score: 8 }] }])])).toHaveLength(1));
  it('provides a valid empty workbook structure', () => {
    const request = parsePracticeExportRequest({ scope: 'grade', grade: 'Empty', startDate: date, endDate: date });
    if (!request.success) throw new Error('invalid fixture');
    const sheets = practiceScoreSheets(request.data, { students: [], attempts: [] });
    expect(sheets.map(sheet => sheet.name)).toEqual(['Export summary', 'Students', 'Practice scores']);
    expect(sheets[2].rows).toHaveLength(1);
  });
  it('rejects a stale selected student instead of silently exporting a partial selection', async () => {
    const database = createMockDb(); database.queueSelect([{ id: a, name: 'QA', grade: '中一' }]);
    const request = parsePracticeExportRequest({ scope: 'selected', studentIds: [a, b], startDate: date, endDate: date });
    if (!request.success) throw new Error('invalid fixture');
    await expect(loadPracticeScores(database as unknown as Database, request.data)).rejects.toThrow('STUDENT_SELECTION_NOT_FOUND');
  });
});
