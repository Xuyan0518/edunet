import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import {
  INPUT_LIMITS,
  validateDailyProgressExtremes,
  validateDateRange,
  validateExamSubjects,
  validatePaperPayload,
  validateReportInput,
} from '../../server/utils/inputValidation';
import { buildCompactReportContext } from '../../server/utils/aiStructuredReport';
import { buildCompactWeeklySummaryContext } from '../../server/utils/aiWeeklySummary';

const require = createRequire(import.meta.url);
const { sanitizeScorePoints } = require('../../miniprogram/utils/validation.js');
const { buildReportMarkdown } = require('../../miniprogram/utils/reportMarkdown.js');

describe('input hardening helpers', () => {
  it('rejects paper score=1000', () => {
    const issues = validatePaperPayload({ score: 1000, total: 100, date: '2026-05-01' }, 'paper');
    expect(issues.some((x) => x.field === 'paper.score')).toBe(true);
  });

  it('rejects paper score=-1', () => {
    const issues = validatePaperPayload({ score: -1, total: 100, date: '2026-05-01' }, 'paper');
    expect(issues.some((x) => x.field === 'paper.score')).toBe(true);
  });

  it('rejects NaN score', () => {
    const issues = validatePaperPayload({ score: 'NaN', total: 100, date: '2026-05-01' }, 'paper');
    expect(issues.some((x) => x.field === 'paper.score')).toBe(true);
  });

  it('rejects percentage-like extremes in exam subjects', () => {
    const issues = validateExamSubjects([{ name: 'Math', score: '999' }]);
    expect(issues.some((x) => x.field.endsWith('.score'))).toBe(true);
  });

  it('rejects maxScore=0 style exam score', () => {
    const issues = validateExamSubjects([{ name: 'English', score: '88/0' }]);
    expect(issues.some((x) => x.field.endsWith('.score'))).toBe(true);
  });

  it('rejects excessive english vocabulary/sentence counts', () => {
    const issues = validateDailyProgressExtremes([
      {
        english: {
          vocab: {
            vocabularyWordCount: 1000,
            vocabularySentenceCount: 1000,
          },
        },
      },
    ]);
    expect(issues.some((x) => x.field.includes('vocabularyWordCount'))).toBe(true);
    expect(issues.some((x) => x.field.includes('vocabularySentenceCount'))).toBe(true);
  });

  it('rejects overlong report text payload', () => {
    const issues = validateReportInput({ summary: 'a'.repeat(INPUT_LIMITS.reportTextMax + 1) });
    expect(issues.some((x) => x.field === 'summary')).toBe(true);
  });

  it('rejects startDate > endDate', () => {
    const issues = validateDateRange({
      startDate: '2026-05-10',
      endDate: '2026-05-01',
      maxDays: 30,
      fieldPrefix: 'range',
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('rejects excessive date range span', () => {
    const issues = validateDateRange({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      maxDays: 30,
      fieldPrefix: 'range',
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('limits scorePoints render count and sanitizes values', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ percentage: i % 2 === 0 ? 999 : -10 }));
    const limited = sanitizeScorePoints(points, 30);
    expect(limited).toHaveLength(30);
    expect(limited.every((p: any) => p.percentage >= 0 && p.percentage <= 100)).toBe(true);
  });

  it('markdown export truncates very long arrays', () => {
    const markdown = buildReportMarkdown({
      reportType: 'quarterly',
      title: '测试报告',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      status: 'draft',
      visibleToParent: false,
      finalReport: {
        executiveSummary: 'ok',
        keyHighlights: Array.from({ length: 120 }, (_, i) => `highlight-${i}`),
        keyConcerns: Array.from({ length: 120 }, (_, i) => `concern-${i}`),
        subjectReports: Array.from({ length: 120 }, (_, i) => ({ subjectName: `科目${i}`, summary: `内容${i}` })),
        nextStageRecommendations: Array.from({ length: 120 }, (_, i) => ({ area: `area${i}`, recommendation: `rec${i}`, priority: 'high' })),
      },
      analytics: { overview: {} },
    });
    const subjectHeadingCount = (markdown.match(/^###\s/gm) || []).length;
    expect(subjectHeadingCount).toBeLessThanOrEqual(30);
  });

  it('truncates compact ai contexts', () => {
    const dailyRows = Array.from({ length: 500 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, activities: [] }));
    const compact = buildCompactReportContext({
      student: { id: 's1' },
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      analytics: {},
      dailyProgress: dailyRows,
      weeklyReports: Array.from({ length: 200 }, () => ({ summary: 'x' })),
      papers: Array.from({ length: 200 }, () => ({ description: 'p' })),
      exams: Array.from({ length: 200 }, () => ({ subjects: [] })),
      reportType: 'quarterly',
      previousQuarterSummary: null,
      quarterlySummaries: [],
    });
    expect(compact.dailyProgress.length).toBeLessThanOrEqual(120);
    expect(compact.weeklyReports.length).toBeLessThanOrEqual(40);
    expect(compact.papers.length).toBeLessThanOrEqual(60);

    const weeklyCompact = buildCompactWeeklySummaryContext({
      student: { id: 's1' },
      weekStarting: '2026-05-01',
      weekEnding: '2026-05-07',
      recordWeekEnding: '2026-05-07',
      attendance: {},
      englishStats: {},
      subjectBreakdown: Array.from({ length: 100 }, () => ({ subjectName: 'math' })),
      englishBreakdown: {},
      weeklyPaperBreakdown: {},
      weeklyExamBreakdown: {},
      lossPoints: { byEntry: Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}` })) },
      dailyProgress: Array.from({ length: 100 }, (_, i) => ({ date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`, activities: [] })),
      papers: Array.from({ length: 100 }, () => ({ description: 'paper' })),
      exams: Array.from({ length: 100 }, () => ({ subjects: [] })),
      weeklyFeedback: Array.from({ length: 20 }, () => ({ summary: 'weekly' })),
      subjectProgress: Array.from({ length: 100 }, () => ({ subjectName: 'math' })),
    });
    expect(weeklyCompact.dailyProgress.length).toBeLessThanOrEqual(14);
    expect(weeklyCompact.papers.length).toBeLessThanOrEqual(30);
  });
});
