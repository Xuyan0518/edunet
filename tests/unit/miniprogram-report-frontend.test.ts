import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('miniprogram report api helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).getApp = () => ({ globalData: { apiBaseUrl: 'https://api.example.com/api' } });
    (globalThis as any).wx = {
      getStorageSync: vi.fn((key: string) => (key === 'token' ? 'token-123' : null)),
      request: vi.fn(),
    };
  });

  it('calls quarterly AI endpoint with saveReport payload', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { summary: 'ok', reportId: 'r-1' } });
    });

    const data = await reportApi.generateQuarterlyReport('s-1', '2026-01-01', '2026-03-31', true);

    expect(data.reportId).toBe('r-1');
    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/ai/quarterly-summary',
        method: 'POST',
        data: {
          studentId: 's-1',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          saveReport: true,
        },
      })
    );
  });

  it('calls yearly AI endpoint with optional date range payload', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { summary: 'ok', reportId: 'r-year-1' } });
    });

    const data = await reportApi.generateYearlyReport(
      's-1',
      2026,
      true,
      { startDate: '2026-02-01', endDate: '2026-11-30' }
    );

    expect(data.reportId).toBe('r-year-1');
    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/ai/yearly-summary',
        method: 'POST',
        data: {
          studentId: 's-1',
          year: 2026,
          saveReport: true,
          startDate: '2026-02-01',
          endDate: '2026-11-30',
        },
      })
    );
  });

  it('normalizes list and detail report shapes', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      if (String(options.url).includes('/students/s-1/reports')) {
        options.success({
          statusCode: 200,
          data: [{ id: 'r-1', reportType: 'quarterly', summary: 'summary text', visibleToParent: true }],
        });
        return;
      }

      options.success({
        statusCode: 200,
        data: {
          id: 'r-2',
          reportType: 'yearly',
          summary: 'year summary',
          analytics: { overview: { activeDays: 10 } },
          structuredReport: { reportType: 'yearly' },
          finalReport: { reportType: 'yearly' },
        },
      });
    });

    const list = await reportApi.listStudentReports('s-1');
    expect(list[0]).toMatchObject({
      id: 'r-1',
      reportType: 'quarterly',
      visibleToParent: true,
    });
    expect(typeof list[0].summaryPreview).toBe('string');

    const detail = await reportApi.getReport('r-2');
    expect(detail).toMatchObject({
      id: 'r-2',
      reportType: 'yearly',
      analytics: { overview: { activeDays: 10 } },
    });
  });

  it('updates visibility via dedicated endpoint', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { id: 'r-1', visibleToParent: true } });
    });

    const data = await reportApi.updateReportVisibility('r-1', true);

    expect(data.visibleToParent).toBe(true);
    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/reports/r-1/visibility',
        method: 'PATCH',
        data: { visibleToParent: true },
      })
    );
  });

  it('calls delete report endpoint', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { success: true } });
    });

    const data = await reportApi.deleteReport('r-del-1');
    expect(data).toEqual({ success: true });
    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/reports/r-del-1',
        method: 'DELETE',
      })
    );
  });

  it('resolves role flags for manager and readonly roles', () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');

    expect(reportApi.resolveRoleFlags('teacher')).toEqual({
      isManager: true,
      isParent: false,
      isStudent: false,
    });
    expect(reportApi.resolveRoleFlags('admin')).toEqual({
      isManager: true,
      isParent: false,
      isStudent: false,
    });
    expect(reportApi.resolveRoleFlags('parent')).toEqual({
      isManager: false,
      isParent: true,
      isStudent: false,
    });
    expect(reportApi.resolveRoleFlags('student')).toEqual({
      isManager: false,
      isParent: false,
      isStudent: true,
    });
    expect(reportApi.resolveRoleFlags('guest')).toEqual({
      isManager: false,
      isParent: false,
      isStudent: false,
    });
  });
});

describe('miniprogram report view helpers', () => {
  const viewModel = require('../../miniprogram/utils/reportViewModel.js');
  const { buildReportMarkdown } = require('../../miniprogram/utils/reportMarkdown.js');
  const { getSubjectDisplayName } = require('../../miniprogram/utils/subjectDisplayName.js');

  it('falls back from finalReport to structuredReport to summary', () => {
    const withFinal = {
      reportType: 'quarterly',
      summary: 'fallback summary',
      finalReport: { reportType: 'quarterly', executiveSummary: 'final summary' },
      structuredReport: { reportType: 'quarterly', executiveSummary: 'structured summary' },
    };
    const withStructured = {
      reportType: 'quarterly',
      summary: 'fallback summary',
      finalReport: null,
      structuredReport: { reportType: 'quarterly', executiveSummary: 'structured summary' },
    };
    const withOnlySummary = {
      reportType: 'quarterly',
      summary: 'plain summary',
      finalReport: null,
      structuredReport: null,
    };

    expect(viewModel.resolveDisplayReport(withFinal)?.executiveSummary).toBe('final summary');
    expect(viewModel.resolveDisplayReport(withStructured)?.executiveSummary).toBe('structured summary');
    expect(viewModel.resolveDisplayReport(withOnlySummary)).toBeNull();
    expect(viewModel.resolveDisplaySummary(withOnlySummary)).toBe('plain summary');
  });

  it('builds summary string from quarterly/yearly structured reports', () => {
    const quarterlySummary = viewModel.buildSummaryFromStructured('quarterly', {
      executiveSummary: '季度总评',
      keyHighlights: ['亮点 A'],
      subjectReports: [{ subjectName: '数学', summary: '保持稳定' }],
    });
    const yearlySummary = viewModel.buildSummaryFromStructured('yearly', {
      annualExecutiveSummary: '年度总评',
      annualGrowthHighlights: ['成长 A'],
      subjectReports: [{ subjectName: '英语', annualSummary: '稳步提升' }],
    });

    expect(quarterlySummary).toContain('季度总评');
    expect(quarterlySummary).toContain('数学');
    expect(yearlySummary).toContain('年度总评');
    expect(yearlySummary).toContain('英文');
  });

  it('builds finalReport payload for quarterly and yearly edit forms', () => {
    const quarterlyPayload = viewModel.buildFinalReportPayload(
      { reportType: 'quarterly', finalReport: { reportType: 'quarterly' } },
      {
        reportType: 'quarterly',
        executiveSummary: '新总评',
        keyHighlightsText: '亮点1\n亮点2',
        keyConcernsText: '关注1',
        nextStageRecommendationsText: '数学|每天练习20分钟|high',
        teacherComment: '继续保持',
        subjectReports: [{ subjectName: '数学', summary: '本期稳定' }],
      }
    );

    const yearlyPayload = viewModel.buildFinalReportPayload(
      { reportType: 'yearly', finalReport: { reportType: 'yearly' } },
      {
        reportType: 'yearly',
        annualExecutiveSummary: '年度新总评',
        annualGrowthHighlightsText: '成长1',
        longTermConcernsText: '关注1',
        nextYearRecommendationsText: '英语|坚持阅读|medium',
        teacherAnnualComment: '继续提升',
        subjectReports: [{ subjectName: '英语', annualSummary: '明显提升' }],
      }
    );

    expect(quarterlyPayload.keyHighlights).toEqual(['亮点1', '亮点2']);
    expect(quarterlyPayload.nextStageRecommendations[0]).toMatchObject({ area: '数学', priority: 'high' });
    expect(yearlyPayload.annualGrowthHighlights).toEqual(['成长1']);
    expect(yearlyPayload.nextYearRecommendations[0]).toMatchObject({ area: '英语', priority: 'medium' });
  });

  it('uses summary as editable fallback when structured report is missing', () => {
    const form = viewModel.buildEditableForm({
      reportType: 'quarterly',
      summary: '这是一段旧版纯文本总结',
      finalReport: null,
      structuredReport: null,
    });
    expect(form.executiveSummary).toBe('这是一段旧版纯文本总结');
  });

  it('keeps unedited subject fields in edit payload', () => {
    const payload = viewModel.buildFinalReportPayload(
      {
        reportType: 'quarterly',
        finalReport: {
          reportType: 'quarterly',
          subjectReports: [
            {
              subjectName: '数学',
              summary: '旧总结',
              evidence: ['证据1'],
              customField: 'keep-me',
            },
          ],
        },
      },
      {
        reportType: 'quarterly',
        executiveSummary: '新总评',
        keyHighlightsText: '',
        keyConcernsText: '',
        nextStageRecommendationsText: '',
        teacherComment: '',
        subjectReports: [
          {
            subjectName: '数学',
            summary: '新总结',
            evidence: ['证据1'],
            customField: 'keep-me',
          },
        ],
      }
    );

    expect(payload.subjectReports[0].customField).toBe('keep-me');
    expect(payload.subjectReports[0].summary).toBe('新总结');
  });

  it('builds markdown with title/date/subjects/recommendation/comment', () => {
    const markdown = buildReportMarkdown({
      title: '学生学期学习报告',
      reportType: 'quarterly',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      summary: 'fallback summary',
      status: 'final',
      visibleToParent: true,
      analytics: { overview: { activeDays: 20, totalSubjects: 3, totalPapers: 2, totalExams: 1 } },
      finalReport: {
        reportType: 'quarterly',
        executiveSummary: '本期学习稳中有升',
        keyHighlights: ['学习投入较高'],
        keyConcerns: ['计算准确率待提高'],
        subjectReports: [{ subjectName: '数学', summary: '表现稳定', strengths: ['思路清晰'] }],
        nextStageRecommendations: [{ area: '数学', recommendation: '每日限时训练', priority: 'high' }],
        teacherComment: '继续保持学习节奏',
      },
    });

    expect(markdown).toContain('# 学生学期学习报告');
    expect(markdown).toContain('2026-01-01 ~ 2026-03-31');
    expect(markdown).toContain('### 数学');
    expect(markdown).toContain('每日限时训练');
    expect(markdown).toContain('继续保持学习节奏');
  });

  it('builds yearly markdown without analytics and without crash', () => {
    const markdown = buildReportMarkdown({
      title: '学生年度学习报告',
      reportType: 'yearly',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
      summary: '年度总结',
      finalReport: {
        reportType: 'yearly',
        annualExecutiveSummary: '年度表现稳定',
        annualGrowthHighlights: ['阅读习惯提升'],
        longTermConcerns: ['计算细节'],
        subjectReports: [{ subjectName: '英语', annualSummary: '稳步进步' }],
        nextYearRecommendations: [{ area: '英语', recommendation: '保持精读', priority: 'medium' }],
        teacherAnnualComment: '整体向好',
      },
    });

    expect(markdown).toContain('# 学生年度学习报告');
    expect(markdown).toContain('2026 年');
    expect(markdown).toContain('### 英文');
    expect(markdown).toContain('保持精读');
    expect(markdown).toContain('整体向好');
  });

  it('formats date text and hides raw ISO in list helpers', async () => {
    const reportApi = require('../../miniprogram/utils/reportApi.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({
        statusCode: 200,
        data: [{
          id: 'r-date-1',
          reportType: 'quarterly',
          summary: 'summary',
          updatedAt: '2026-05-16T03:36:23.376Z',
        }],
      });
    });
    const list = await reportApi.listStudentReports('s-1');
    expect(list[0].updatedAtText).toMatch(/^2026-05-16 \d{2}:\d{2}$/);
  });

  it('builds weekly activity rows from weeklyActivity first', () => {
    const rows = viewModel.buildWeeklyActivityRows({
      learningActivity: {
        weeklyActivity: [{ weekStart: '2026-05-05', weekEnd: '2026-05-11', activeDays: 3, activityCount: 7, subjectCount: 4 }],
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].activityCount).toBe(7);
  });

  it('builds weekly activity rows from dailyActivity fallback safely', () => {
    const rows = viewModel.buildWeeklyActivityRows({
      learningActivity: {
        dailyActivity: [
          { date: '2026-05-05', activityCount: 2, subjectCount: 2 },
          { date: '2026-05-06', activityCount: 1, subjectCount: 1 },
        ],
      },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].activityCount).toBeGreaterThan(0);
  });

  it('maps subject names to Chinese display names', () => {
    expect(getSubjectDisplayName('English')).toBe('英文');
    expect(getSubjectDisplayName('Secondary 3/4 G3 Additional Mathematics')).toBe('高等数学');
    expect(getSubjectDisplayName('Secondary 3/4 G3 Math')).toBe('数学');
    expect(getSubjectDisplayName('Secondary 3/4 Pure Chemistry')).toBe('化学');
    expect(getSubjectDisplayName('Social Studies (Upper Secondary G3)')).toBe('社会研究');
  });

  it('resolves tag class by tag type', () => {
    expect(viewModel.getTagClass('strength')).toBe('tag-strength');
    expect(viewModel.getTagClass('improvement')).toBe('tag-improve');
    expect(viewModel.getTagClass('next')).toBe('tag-next');
    expect(viewModel.getTagClass('evidence')).toBe('tag-evidence');
  });

  it('markdown uses Chinese subject names', () => {
    const markdown = buildReportMarkdown({
      title: '学生学期学习报告',
      reportType: 'quarterly',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      summary: 'fallback summary',
      finalReport: {
        reportType: 'quarterly',
        executiveSummary: '总评',
        subjectReports: [{ subjectName: 'Secondary 3/4 G3 Additional Mathematics', summary: '稳定' }],
      },
    });
    expect(markdown).toContain('### 高等数学');
  });

  it('builds english special section from analytics with fallback summary', () => {
    const section = viewModel.buildEnglishSpecialSection(
      'quarterly',
      {},
      {
        englishAnalytics: {
          hasEnglishData: true,
          skillBreakdown: {
            editing: { key: 'editing', label: 'Editing', activityCount: 3, scoreRecordCount: 2, averageScore: 72, latestScore: 76, trend: 'improving', scorePoints: [{ percentage: 70 }, { percentage: 76 }] },
            composition: { key: 'composition', label: '作文', activityCount: 1, scoreRecordCount: 0, averageScore: null, latestScore: null, trend: 'insufficient_data', scorePoints: [] },
            readingComprehension: { key: 'readingComprehension', label: '阅读理解', activityCount: 2, scoreRecordCount: 1, averageScore: 68, latestScore: 68, trend: 'stable', scorePoints: [{ percentage: 68 }] },
            grammar: { key: 'grammar', label: '语法', activityCount: 2, scoreRecordCount: 1, averageScore: 65, latestScore: 65, trend: 'stable', scorePoints: [{ percentage: 65 }] },
          },
          vocabularyStats: {
            vocabularyItemsCount: null,
            sentenceItemsCount: 10,
            totalLanguageItemsCount: null,
            recordsWithVocabulary: 2,
            recordsWithSentences: 1,
          },
        },
      }
    );
    expect(section.shouldShow).toBe(true);
    expect(section.skillCards[0].label).toBe('Editing');
    expect(section.skillCards[0].miniTrendBars.length).toBeGreaterThan(0);
    expect(section.vocabularyNote).toContain('有词汇练习记录');
  });

  it('does not crash when structured report misses englishSpecialAnalysis', () => {
    const section = viewModel.buildEnglishSpecialSection('yearly', { reportType: 'yearly' }, { englishAnalytics: null });
    expect(section.shouldShow).toBe(false);
  });

  it('markdown includes english special analysis', () => {
    const markdown = buildReportMarkdown({
      title: '学生学期学习报告',
      reportType: 'quarterly',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      summary: 'fallback summary',
      analytics: {
        overview: { activeDays: 10, totalSubjects: 2, totalPapers: 3, totalExams: 1 },
        englishAnalytics: {
          hasEnglishData: true,
          skillBreakdown: {
            editing: { label: 'Editing', activityCount: 4, averageScore: 75, trend: 'improving' },
            composition: { label: '作文', activityCount: 1, averageScore: null, trend: 'insufficient_data' },
            readingComprehension: { label: '阅读理解', activityCount: 2, averageScore: 68, trend: 'stable' },
            grammar: { label: '语法', activityCount: 2, averageScore: 70, trend: 'stable' },
          },
          vocabularyStats: {
            vocabularyItemsCount: 25,
            sentenceItemsCount: 10,
            totalLanguageItemsCount: 35,
          },
        },
      },
      finalReport: {
        reportType: 'quarterly',
        executiveSummary: '整体稳定',
        subjectReports: [{ subjectName: 'English', summary: '专项训练有效' }],
        englishSpecialAnalysis: {
          summary: '英文专项总体向好',
          teacherSuggestion: '继续保持每周精读训练',
        },
      },
    });
    expect(markdown).toContain('## 英文专项分析');
    expect(markdown).toContain('英文专项总体向好');
    expect(markdown).toContain('继续保持每周精读训练');
  });
});
