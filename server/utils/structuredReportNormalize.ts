import type { StudentReportType } from '../schema';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item).trim())
    .filter(Boolean);
};

const normalizePriority = (value: unknown): 'high' | 'medium' | 'low' => {
  const s = asString(value).trim().toLowerCase();
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
};

const normalizeRecommendationArray = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      ...item,
      priority: normalizePriority(item.priority),
    }));
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeEnglishSpecialAnalysis = (
  value: unknown,
  reportType: StudentReportType,
) => {
  const input = asRecord(value);
  const normalizedSkillReports = Array.isArray(input.skillReports)
    ? input.skillReports.map((item) => {
      const row = asRecord(item);
      const base: Record<string, unknown> = {
        ...row,
        skillKey: asString(row.skillKey).trim(),
        skillLabel: asString(row.skillLabel).trim(),
        activityCount: normalizeNullableNumber(row.activityCount) ?? 0,
        averageScore: normalizeNullableNumber(row.averageScore),
        trend: asString(row.trend).trim() || 'insufficient_data',
      };
      if (reportType === 'yearly') {
        base.annualSummary = asString(row.annualSummary).trim();
        base.nextYearFocus = asStringArray(row.nextYearFocus);
      } else {
        base.summary = asString(row.summary).trim();
        base.nextSteps = asStringArray(row.nextSteps);
      }
      return base;
    })
    : [];

  const vocabularySummaryInput = asRecord(input.vocabularySummary);
  return {
    summary: asString(input.summary).trim(),
    skillReports: normalizedSkillReports,
    vocabularySummary: {
      summary: asString(vocabularySummaryInput.summary).trim(),
      vocabularyItemsCount: normalizeNullableNumber(vocabularySummaryInput.vocabularyItemsCount),
      sentenceItemsCount: normalizeNullableNumber(vocabularySummaryInput.sentenceItemsCount),
      totalLanguageItemsCount: normalizeNullableNumber(vocabularySummaryInput.totalLanguageItemsCount),
    },
    teacherSuggestion: asString(input.teacherSuggestion).trim(),
  };
};

export const normalizeStructuredReport = (
  report: unknown,
  reportType: StudentReportType,
  fallbackDataQualityNotes: string[] = [],
): Record<string, unknown> | null => {
  const normalizedInput = asRecord(report);
  if (!Object.keys(normalizedInput).length) return null;

  const out: Record<string, unknown> = {
    ...normalizedInput,
    reportType,
  };

  if (!Array.isArray(out.subjectReports)) out.subjectReports = [];

  if (reportType === 'quarterly') {
    out.nextStageRecommendations = normalizeRecommendationArray(out.nextStageRecommendations);
  }

  if (reportType === 'yearly') {
    out.nextYearRecommendations = normalizeRecommendationArray(out.nextYearRecommendations);
  }

  out.englishSpecialAnalysis = normalizeEnglishSpecialAnalysis(out.englishSpecialAnalysis, reportType);

  const existingDataNotes = asStringArray(out.dataQualityNotesForTeacher);
  out.dataQualityNotesForTeacher = existingDataNotes.length ? existingDataNotes : fallbackDataQualityNotes;

  return out;
};
