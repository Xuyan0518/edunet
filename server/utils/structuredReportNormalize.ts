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

  const existingDataNotes = asStringArray(out.dataQualityNotesForTeacher);
  out.dataQualityNotesForTeacher = existingDataNotes.length ? existingDataNotes : fallbackDataQualityNotes;

  return out;
};
