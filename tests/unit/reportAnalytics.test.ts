import { describe, expect, it } from 'vitest';
import { buildStudentReportAnalytics, reportAnalyticsTestUtils } from '../../server/services/reportAnalytics';

const baseInput = {
  student: { id: 's1', name: 'Alice', grade: 'G7' },
  startDate: '2026-01-01',
  endDate: '2026-01-07',
  dailyProgress: [] as unknown[],
  weeklyReports: [] as unknown[],
  papers: [] as unknown[],
  exams: [] as unknown[],
  previousQuarterSummary: null,
  quarterlySummaries: [],
  reportType: 'quarterly' as const,
};

describe('buildStudentReportAnalytics', () => {
  it('handles empty dailyProgress safely', () => {
    const out = buildStudentReportAnalytics(baseInput);
    expect(out.overview.totalDailyProgressRecords).toBe(0);
    expect(out.overview.activeDays).toBe(0);
    expect(out.learningActivity.dailyActivity).toHaveLength(7);
    expect(out.aiGuidance.dataQualityNotes.some((n) => n.includes('No dailyProgress'))).toBe(true);
  });

  it('handles empty weeklyReports safely', () => {
    const out = buildStudentReportAnalytics(baseInput);
    expect(out.overview.totalWeeklyReports).toBe(0);
    expect(out.recurringPatterns.strengths).toEqual([]);
    expect(out.aiGuidance.dataQualityNotes.some((n) => n.includes('No weeklyReports'))).toBe(true);
  });

  it('parses paper score/maxScore and computes percentage', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [{ date: '2026-01-02', subjectName: '数学', description: 'Paper A', score: 45, total: 50 }],
    });
    expect(out.paperSummary.papers).toHaveLength(1);
    expect(out.paperSummary.papers[0].percentage).toBe(90);
    expect(out.paperSummary.overallAveragePercentage).toBe(90);
  });

  it('uses score as percentage when maxScore missing and score in 0-100', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [{ date: '2026-01-02', subjectName: '英文', score: 72 }],
    });
    expect(out.paperSummary.papers[0].percentage).toBe(72);
    expect(out.aiGuidance.dataQualityNotes.some((n) => n.includes('missing maxScore'))).toBe(true);
  });

  it('extracts exam summary with multiple subjects', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      exams: [
        {
          name: 'WA1',
          examDate: '2026-01-03',
          subjects: [{ name: '数学', score: '88' }, { name: '英文', score: '75/100' }],
        },
      ],
    });
    expect(out.examSummary.exams).toHaveLength(1);
    expect(out.examSummary.exams[0].subjects).toHaveLength(2);
    expect(out.examSummary.overallAveragePercentage).not.toBeNull();
  });

  it('marks improving subject trend', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [
        { date: '2026-01-01', subjectName: '英文', score: 60, total: 100 },
        { date: '2026-01-05', subjectName: '英文', score: 72, total: 100 },
      ],
    });
    const english = out.subjectStats.find((s) => s.subjectName === '英文');
    expect(english?.trend).toBe('improving');
    expect(english?.improvement).toBe(12);
  });

  it('marks declining subject trend', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [
        { date: '2026-01-01', subjectName: '数学', score: 90, total: 100 },
        { date: '2026-01-05', subjectName: '数学', score: 70, total: 100 },
      ],
    });
    const math = out.subjectStats.find((s) => s.subjectName === '数学');
    expect(math?.trend).toBe('declining');
    expect(math?.improvement).toBe(-20);
  });

  it('marks insufficient_data when only one valid score exists', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [{ date: '2026-01-03', subjectName: '科学', score: 88, total: 100 }],
    });
    const sci = out.subjectStats.find((s) => s.subjectName === '科学');
    expect(sci?.trend).toBe('insufficient_data');
    expect(sci?.improvement).toBeNull();
  });

  it('applies inclusive start/end filtering', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      startDate: '2026-01-03',
      endDate: '2026-01-03',
      dailyProgress: [
        { date: '2026-01-02', activities: [{ subjectName: '英文' }] },
        { date: '2026-01-03', activities: [{ subjectName: '英文' }] },
      ],
      papers: [
        { date: '2026-01-02', subjectName: '英文', score: 60, total: 100 },
        { date: '2026-01-03', subjectName: '英文', score: 70, total: 100 },
      ],
    });
    expect(out.reportMeta.totalCalendarDays).toBe(1);
    expect(out.overview.totalDailyProgressRecords).toBe(1);
    expect(out.paperSummary.papers).toHaveLength(1);
  });

  it('does not crash on legacy/missing fields', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      dailyProgress: [{ date: '2026-01-02', activities: [{ description: 'legacy row' }, null] }, { date: null, activities: 'bad-shape' }],
      weeklyReports: [{ summary: '需要复习词汇，整体有进步' }],
      papers: [{ date: '2026-01-02', subjectName: '英文', score: 'bad-number' }],
      exams: [{ examDate: 'bad-date', subjects: [{ name: '英文', score: '80' }] }],
    });
    expect(out).toBeTruthy();
    expect(Array.isArray(out.aiGuidance.dataQualityNotes)).toBe(true);
  });

  it('records note when subjectName is missing', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [{ date: '2026-01-02', score: 70, total: 100 }],
      exams: [{ examDate: '2026-01-03', subjects: [{ score: 88 }] }],
      dailyProgress: [{ date: '2026-01-02', activities: [{}] }],
    });
    expect(out.aiGuidance.dataQualityNotes.some((n) => n.toLowerCase().includes('missing subject'))).toBe(true);
  });

  it('records note when maxScore is missing', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [{ date: '2026-01-02', subjectName: '历史', score: 67 }],
      exams: [{ examDate: '2026-01-03', subjects: [{ name: '历史', score: '77' }] }],
    });
    const notes = out.aiGuidance.dataQualityNotes.join('\n');
    expect(notes.includes('missing maxScore')).toBe(true);
  });

  it('recognizes English subject variants and builds englishAnalytics', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      dailyProgress: [
        {
          date: '2026-01-02',
          activities: [
            { subjectName: 'English', taskSummary: 'editing practice', english: { editing: { score: 70, totalScore: 100, exerciseCount: 2 } } },
            { subjectName: 'Secondary English', taskSummary: 'reading comprehension', english: { reading: { score: 16, totalScore: 20, articleCount: 1 } } },
            { subjectName: '英文', taskSummary: 'grammar review', english: { grammar: { score: 18, totalScore: 25, exerciseCount: 1 } } },
          ],
        },
      ],
    });
    expect(out.englishAnalytics.hasEnglishData).toBe(true);
    expect(out.englishAnalytics.subjectNamesMatched).toEqual(expect.arrayContaining(['English', 'Secondary English', '英文']));
    expect(out.englishAnalytics.skillBreakdown.editing.activityCount).toBeGreaterThan(0);
    expect(out.englishAnalytics.skillBreakdown.readingComprehension.activityCount).toBeGreaterThan(0);
    expect(out.englishAnalytics.skillBreakdown.grammar.activityCount).toBeGreaterThan(0);
  });

  it('classifies english skills by keywords', () => {
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('editing and proofreading')).toContain('editing');
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('essay writing composition')).toContain('composition');
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('reading comprehension passage')).toContain('readingComprehension');
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('grammar tense practice')).toContain('grammar');
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('vocabulary words dictation')).toContain('vocabulary');
    expect(reportAnalyticsTestUtils.classifyEnglishActivity('10 sentences and phrases')).toContain('sentences');
  });

  it('extracts vocabulary/sentence counts from explicit text and avoids score misread', () => {
    expect(reportAnalyticsTestUtils.extractVocabularyCount('背了 20 个单词')).toBe(20);
    expect(reportAnalyticsTestUtils.extractVocabularyCount('vocabulary 25 words')).toBe(25);
    expect(reportAnalyticsTestUtils.extractSentenceCount('10 sentences')).toBe(10);
    expect(reportAnalyticsTestUtils.extractVocabularyCount('WA1 100分')).toBeNull();
  });

  it('does not break other subjects when extra English records are present', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [
        { date: '2026-01-02', subjectName: '数学', score: 88, total: 100 },
        { date: '2026-01-03', subjectName: 'English', description: 'Editing quiz', score: 72, total: 100 },
      ],
      dailyProgress: [
        {
          date: '2026-01-03',
          activities: [
            { subjectName: '数学', taskSummary: 'algebra practice' },
            { subjectName: 'English', taskSummary: 'vocabulary 25 words', english: { vocab: { vocabularyWordCount: 25 } } },
          ],
        },
      ],
    });
    const math = out.subjectStats.find((s) => s.subjectName === '数学');
    expect(math?.paperCount).toBe(1);
    expect(out.englishAnalytics.vocabularyStats.vocabularyItemsCount).toBe(25);
  });

  it('computes english skill trend and handles insufficient score data safely', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      papers: [
        { date: '2026-01-01', subjectName: 'English', description: 'Editing quiz', score: 60, total: 100 },
        { date: '2026-01-05', subjectName: 'English', description: 'Editing test', score: 72, total: 100 },
        { date: '2026-01-06', subjectName: 'English', description: 'Vocabulary practice', score: 15, total: 20 },
      ],
    });
    expect(out.englishAnalytics.skillBreakdown.editing.trend).toBe('improving');
    expect(out.englishAnalytics.skillBreakdown.composition.trend).toBe('insufficient_data');
    expect(out.englishAnalytics.overallEnglishScoreTrend.points.length).toBeGreaterThan(0);
  });

  it('handles custom englishTasks records without breaking legacy analytics', () => {
    const out = buildStudentReportAnalytics({
      ...baseInput,
      dailyProgress: [
        {
          date: '2026-01-04',
          activities: [
            {
              subjectName: 'English',
              englishTasks: [
                {
                  taskId: 'listening-1',
                  key: 'listening',
                  displayName: 'Listening',
                  practiceCount: 3,
                  score: 78,
                  maxScore: 100,
                  problems: 'careless mistakes',
                  completed: true,
                  fieldsUsed: ['practiceCount', 'score', 'problems'],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(out.englishAnalytics.hasEnglishData).toBe(true);
    expect(out.englishAnalytics.overallEnglishScoreTrend.points.length).toBeGreaterThan(0);
    expect(out.subjectStats.some((s) => s.subjectName === 'English')).toBe(true);
  });
});
