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
    expect(yearlySummary).toContain('英语');
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
    expect(markdown).toContain('### 英语');
    expect(markdown).toContain('保持精读');
    expect(markdown).toContain('整体向好');
  });
});
