import { describe, expect, it } from 'vitest';
import { normalizeStructuredReport } from '../../server/utils/structuredReportNormalize';
import { parseReportJson, serializeReportJson } from '../../server/utils/reportJson';
import {
  canUserAccessReport,
  canUserListStudentReports,
  canUserManageReport,
  normalizeReportPayload,
} from '../../server/services/studentReports';

describe('report json helpers', () => {
  it('serializes object and parses safely', () => {
    const value = { a: 1, b: ['x'] };
    const serialized = serializeReportJson(value);
    const parsed = parseReportJson(serialized);
    expect(parsed.value).toEqual(value);
    expect(parsed.parseError).toBeNull();
  });

  it('parses invalid json string without crash', () => {
    const parsed = parseReportJson('{broken');
    expect(parsed.value).toBeNull();
    expect(parsed.rawText).toContain('{broken');
    expect(typeof parsed.parseError).toBe('string');
  });
});

describe('normalizeStructuredReport', () => {
  it('fills missing arrays and normalizes priority for quarterly', () => {
    const out = normalizeStructuredReport(
      {
        reportTitle: 'Q',
        nextStageRecommendations: [{ area: '数学', recommendation: '加强练习', priority: 'urgent' }],
      },
      'quarterly',
      ['数据质量提示A'],
    );

    expect(out).toBeTruthy();
    expect(Array.isArray(out?.subjectReports)).toBe(true);
    expect(Array.isArray(out?.nextStageRecommendations)).toBe(true);
    const rec = (out?.nextStageRecommendations as Array<Record<string, unknown>>)[0];
    expect(rec.priority).toBe('medium');
    expect(out?.dataQualityNotesForTeacher).toEqual(['数据质量提示A']);
  });

  it('fills missing nextYearRecommendations for yearly', () => {
    const out = normalizeStructuredReport({ annualExecutiveSummary: 'Y' }, 'yearly', []);
    expect(out?.reportType).toBe('yearly');
    expect(Array.isArray(out?.subjectReports)).toBe(true);
    expect(Array.isArray(out?.nextYearRecommendations)).toBe(true);
    expect(out?.englishSpecialAnalysis).toBeTruthy();
    expect(Array.isArray((out?.englishSpecialAnalysis as Record<string, unknown>).skillReports)).toBe(true);
  });
});

describe('student report permissions', () => {
  it('allows manager roles to access any report', () => {
    expect(
      canUserAccessReport({
        user: { id: 't1', role: 'teacher', name: 'T' },
        studentParentId: 'p1',
        reportVisibleToParent: false,
        studentId: 's1',
      }),
    ).toBe(true);
  });

  it('allows parent only when assigned and visible', () => {
    expect(
      canUserAccessReport({
        user: { id: 'p1', role: 'parent', name: 'P' },
        studentParentId: 'p1',
        reportVisibleToParent: true,
        studentId: 's1',
      }),
    ).toBe(true);

    expect(
      canUserAccessReport({
        user: { id: 'p1', role: 'parent', name: 'P' },
        studentParentId: 'p1',
        reportVisibleToParent: false,
        studentId: 's1',
      }),
    ).toBe(false);
  });

  it('allows parent to list only assigned student reports', () => {
    expect(
      canUserListStudentReports({
        user: { id: 'p1', role: 'parent', name: 'P' },
        studentParentId: 'p1',
      }),
    ).toBe(true);

    expect(
      canUserListStudentReports({
        user: { id: 'p1', role: 'parent', name: 'P' },
        studentParentId: 'p2',
      }),
    ).toBe(false);
  });

  it('allows only manager roles to manage/delete reports', () => {
    expect(
      canUserManageReport({
        user: { id: 't1', role: 'teacher', name: 'T' },
        studentParentId: 'p1',
        studentId: 's1',
      }),
    ).toBe(true);
    expect(
      canUserManageReport({
        user: { id: 'a1', role: 'admin', name: 'A' },
        studentParentId: 'p1',
        studentId: 's1',
      }),
    ).toBe(true);
    expect(
      canUserManageReport({
        user: { id: 'p1', role: 'parent', name: 'P' },
        studentParentId: 'p1',
        studentId: 's1',
      }),
    ).toBe(false);
  });
});

describe('normalizeReportPayload', () => {
  it('defaults finalReport to structuredReport and keeps normalized shape', () => {
    const out = normalizeReportPayload({
      reportType: 'quarterly',
      structuredReport: { executiveSummary: 'ok' },
      finalReport: null,
      analytics: { aiGuidance: { dataQualityNotes: ['A'] } },
    });

    expect(out.structuredReportJson).toBeTruthy();
    expect(out.finalReportJson).toBeTruthy();
    expect(out.structuredReportJson).toEqual(out.finalReportJson);
  });
});
