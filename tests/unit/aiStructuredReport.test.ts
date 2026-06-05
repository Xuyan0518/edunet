import { describe, expect, it } from 'vitest';
import {
  buildCompactReportContext,
  buildCompatibilitySummary,
  parseAiStructuredReportResponse,
} from '../../server/utils/aiStructuredReport';

describe('parseAiStructuredReportResponse', () => {
  it('parses valid JSON structured report', () => {
    const raw = JSON.stringify({
      reportType: 'quarterly',
      executiveSummary: '整体学习节奏稳定。',
      keyHighlights: ['学习活跃率较高'],
      keyConcerns: ['数学计算准确率需提升'],
      subjectReports: [{ subjectName: '数学', summary: '本阶段有波动。' }],
      nextStageRecommendations: [{ area: '数学', recommendation: '强化计算训练', priority: 'high' }],
      teacherComment: '保持积极学习状态。',
    });

    const out = parseAiStructuredReportResponse(raw, 'quarterly');
    expect(out.structuredReport).not.toBeNull();
    expect(out.parseError).toBeNull();
    expect(out.summaryText).toContain('整体学习节奏稳定');
    expect(out.summaryText).toContain('数学');
  });

  it('parses markdown fenced JSON', () => {
    const payload = JSON.stringify({
      reportType: 'quarterly',
      executiveSummary: '有明显学习投入。',
      subjectReports: [],
    });
    const out = parseAiStructuredReportResponse(`\`\`\`json\n${payload}\n\`\`\``, 'quarterly');
    expect(out.structuredReport).not.toBeNull();
    expect(out.parseError).toBeNull();
    expect(out.summaryText).toContain('有明显学习投入');
  });

  it('parses JSON embedded in prose', () => {
    const payload = JSON.stringify({
      reportType: 'yearly',
      annualExecutiveSummary: '年度总体稳定。',
      subjectReports: [],
      nextYearRecommendations: [],
      teacherAnnualComment: '继续保持。',
    });
    const raw = `以下是报告：${payload} 请审核。`;
    const out = parseAiStructuredReportResponse(raw, 'yearly');
    expect(out.structuredReport).not.toBeNull();
    expect(out.parseError).toBeNull();
    expect(out.summaryText).toContain('年度总体稳定');
  });

  it('falls back safely on pure text', () => {
    const raw = '本学期学习态度良好，但成绩数据不足以判断趋势。';
    const out = parseAiStructuredReportResponse(raw, 'quarterly');
    expect(out.structuredReport).toBeNull();
    expect(out.summaryText).toBe(raw);
    expect(out.parseError).toBeTypeOf('string');
  });

  it('falls back safely on empty string', () => {
    const out = parseAiStructuredReportResponse('', 'quarterly');
    expect(out.structuredReport).toBeNull();
    expect(out.summaryText).toContain('当前AI未返回有效报告内容');
    expect(out.parseError).toBeTypeOf('string');
  });
});

describe('buildCompatibilitySummary', () => {
  it('builds quarterly summary text from structured report', () => {
    const summary = buildCompatibilitySummary('quarterly', {
      executiveSummary: '执行摘要A',
      keyHighlights: ['亮点1', '亮点2'],
      keyConcerns: ['关注1'],
      subjectReports: [{ subjectName: '英文', summary: '英语整体稳定。' }],
      nextStageRecommendations: [{ area: '英文', recommendation: '坚持精读', priority: 'medium' }],
      teacherComment: '老师评语A',
    }, '');

    expect(summary).toContain('执行摘要A');
    expect(summary).toContain('亮点：亮点1；亮点2');
    expect(summary).toContain('英文：英语整体稳定');
    expect(summary).toContain('老师评语A');
  });

  it('builds yearly summary text from structured report', () => {
    const summary = buildCompatibilitySummary('yearly', {
      annualExecutiveSummary: '年度执行摘要B',
      annualGrowthHighlights: ['成长1'],
      longTermConcerns: ['长期关注1'],
      subjectReports: [{ subjectName: '数学', annualSummary: '数学年度表现有起伏。' }],
      nextYearRecommendations: [{ area: '数学', recommendation: '夯实基础', priority: 'high' }],
      teacherAnnualComment: '年度评语B',
    }, '');

    expect(summary).toContain('年度执行摘要B');
    expect(summary).toContain('年度成长亮点：成长1');
    expect(summary).toContain('数学：数学年度表现有起伏');
    expect(summary).toContain('年度评语B');
  });
});

describe('buildCompactReportContext', () => {
  it('keeps score pairs and percentages for non-100 daily English scores', () => {
    const context = buildCompactReportContext({
      student: { id: 's-1', name: 'Alice' },
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      reportType: 'quarterly',
      dailyProgress: [
        {
          date: '2026-01-04',
          activities: [
            {
              type: 'english',
              subjectName: 'English',
              english: {
                editing: { score: 28, totalScore: 30, exerciseCount: 1 },
                grammar: { score: 14, totalScore: 28, exerciseCount: 1 },
              },
            },
          ],
        },
      ],
      weeklyReports: [],
      papers: [],
      exams: [],
      analytics: {},
      previousQuarterSummary: null,
      quarterlySummaries: [],
    });

    const english = context.dailyProgress[0].activities[0].english;
    expect(english.editing).toMatchObject({ score: 28, totalScore: 30, scoreText: '28/30', percentage: 93.3 });
    expect(english.grammar).toMatchObject({ score: 14, totalScore: 28, scoreText: '14/28', percentage: 50 });
  });
});
