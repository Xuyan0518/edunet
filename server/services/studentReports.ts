import { format } from 'date-fns';
import type { AuthUser } from '../utils/auth';
import type { StudentReportType } from '../schema';
import { parseReportJson, serializeReportJson } from '../utils/reportJson';
import { normalizeStructuredReport } from '../utils/structuredReportNormalize';

export type StudentReportStatus = 'draft' | 'final';

export type StudentReportRowLike = {
  id: string;
  studentId: string;
  reportType: string;
  title: string | null;
  startDate: string | Date;
  endDate: string | Date;
  year: number | null;
  summaryText: string;
  analyticsJson: unknown;
  structuredReportJson: unknown;
  finalReportJson: unknown;
  rawAiResponse: string | null;
  parseError: string | null;
  status: string;
  visibleToParent: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  updatedByName: string | null;
};

export const isManagerRole = (role: string | undefined) => role === 'teacher' || role === 'admin';

export const normalizeReportType = (value: unknown): StudentReportType | null => {
  if (value === 'quarterly' || value === 'yearly') return value;
  return null;
};

export const normalizeReportStatus = (value: unknown): StudentReportStatus => {
  return value === 'final' ? 'final' : 'draft';
};

export const parseBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') return true;
    if (lowered === 'false' || lowered === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

export const toDateOnly = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return format(value, 'yyyy-MM-dd');
};

export const summaryPreview = (text: string, max = 120) => {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
};

const extractDataQualityNotes = (analytics: unknown): string[] => {
  if (!analytics || typeof analytics !== 'object') return [];
  const ag = (analytics as Record<string, unknown>).aiGuidance;
  if (!ag || typeof ag !== 'object') return [];
  const notes = (ag as Record<string, unknown>).dataQualityNotes;
  if (!Array.isArray(notes)) return [];
  return notes
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);
};

export const normalizeReportPayload = (input: {
  reportType: StudentReportType;
  structuredReport: unknown;
  finalReport: unknown;
  analytics: unknown;
}) => {
  const fallbackNotes = extractDataQualityNotes(input.analytics);
  const normalizedStructured = normalizeStructuredReport(input.structuredReport, input.reportType, fallbackNotes);
  const normalizedFinal = normalizeStructuredReport(
    input.finalReport ?? input.structuredReport,
    input.reportType,
    fallbackNotes,
  );

  return {
    structuredReportJson: serializeReportJson(normalizedStructured),
    finalReportJson: serializeReportJson(normalizedFinal),
  };
};

export const sanitizeReportForRole = (
  report: Record<string, unknown>,
  role: string,
): Record<string, unknown> => {
  if (role === 'parent' || role === 'student') {
    const { rawAiResponse: _rawAiResponse, parseError: _parseError, ...rest } = report;
    return rest;
  }
  return report;
};

export const hydrateStudentReport = (
  row: StudentReportRowLike,
  role: string,
  options?: { includeHeavyFields?: boolean },
): Record<string, unknown> => {
  const analyticsParsed = parseReportJson(row.analyticsJson);
  const structuredParsed = parseReportJson(row.structuredReportJson);
  const finalParsed = parseReportJson(row.finalReportJson);

  const hydrated: Record<string, unknown> = {
    id: row.id,
    studentId: row.studentId,
    reportType: row.reportType,
    title: row.title,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    year: row.year,
    summary: row.summaryText,
    status: row.status,
    visibleToParent: row.visibleToParent,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedByName: row.updatedByName,
    analytics: analyticsParsed.value,
    structuredReport: structuredParsed.value,
    finalReport: finalParsed.value,
    rawAiResponse: row.rawAiResponse,
    parseError: row.parseError,
  };

  const parseIssues = [analyticsParsed, structuredParsed, finalParsed]
    .map((item) => item.parseError)
    .filter((item): item is string => Boolean(item));
  if (parseIssues.length && role !== 'parent' && role !== 'student') {
    hydrated.jsonParseWarnings = parseIssues;
  }

  if (!options?.includeHeavyFields) {
    delete hydrated.analytics;
    delete hydrated.structuredReport;
    delete hydrated.finalReport;
    delete hydrated.rawAiResponse;
    delete hydrated.parseError;
    hydrated.summaryPreview = summaryPreview(row.summaryText);
  }

  return sanitizeReportForRole(hydrated, role);
};

export const canUserAccessReport = (params: {
  user: AuthUser;
  studentParentId: string | null;
  reportVisibleToParent: boolean;
  studentId: string;
}): boolean => {
  const { user, studentParentId, reportVisibleToParent, studentId } = params;
  const role = user.role as string;
  if (isManagerRole(role)) return true;
  if (role === 'parent') {
    return studentParentId === user.id && reportVisibleToParent;
  }
  if (role === 'student') {
    return user.id === studentId && reportVisibleToParent;
  }
  return false;
};

export const canUserListStudentReports = (params: {
  user: AuthUser;
  studentParentId: string | null;
}): boolean => {
  const { user, studentParentId } = params;
  const role = user.role as string;
  if (isManagerRole(role)) return true;
  if (role === 'parent') return studentParentId === user.id;
  if (role === 'student') return true;
  return false;
};
