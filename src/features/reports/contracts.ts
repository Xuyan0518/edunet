import { isBusinessDate } from "@/domain/businessDates";
import { record, text } from "@/domain/activityAdapters";
import { readReport } from "@/domain/reportAdapters";
import { buildSummaryFromStructured } from "./compat/reportViewModel";
export type ReportType = "quarterly" | "yearly";
export interface ReportRow {
  id: string;
  studentId: string;
  reportType: ReportType;
  title: string;
  startDate: string;
  endDate: string;
  year: number;
  summary: string;
  summaryPreview?: string;
  status: "draft" | "final";
  visibleToParent: boolean;
  updatedAt: string;
  createdAt?: string;
  finalReport?: unknown;
  structuredReport?: unknown;
  analytics?: unknown;
  parseError?: unknown;
}
export interface LegacyRow {
  id?: string;
  year: number;
  quarter?: number;
  summary: string;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  visibleToParent?: boolean;
  reviewStatus?: string;
}
export function validReportRange(start: string, end: string, max: number) {
  return (
    isBusinessDate(start) &&
    isBusinessDate(end) &&
    start <= end &&
    (Date.parse(end) - Date.parse(start)) / 86400000 + 1 <= max
  );
}
export function generationBody(
  studentId: string,
  type: ReportType,
  year: number,
  startDate: string,
  endDate: string,
  saveReport: boolean
) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new Error("Year must be 2000–2100");
  if (type === "quarterly" && !validReportRange(startDate, endDate, 220))
    throw new Error("Semester range must be at most 220 days");
  return type === "yearly"
    ? { studentId, year, saveReport }
    : { studentId, startDate, endDate, saveReport };
}
export function legacyBody(
  row: LegacyRow,
  type: ReportType,
  summary: string,
  startDate: string,
  endDate: string
) {
  if (summary.length > 5000) throw new Error("Summary exceeds 5000 characters");
  if (row.id && !row.updatedAt) throw new Error("Reload the original version");
  if (
    type === "quarterly" &&
    (!Number.isInteger(row.quarter) ||
      row.quarter < 1 ||
      row.quarter > 4 ||
      !validReportRange(startDate, endDate, 220))
  )
    throw new Error("Invalid quarter or semester range");
  return {
    year: row.year,
    summary,
    ...(type === "quarterly"
      ? { quarter: row.quarter, startDate, endDate }
      : {}),
    ...(row.id ? { updatedAt: row.updatedAt } : {})
  };
}
export function editableReport(row: ReportRow) {
  const view = readReport(row);
  return view.content &&
    typeof view.content === "object" &&
    !Array.isArray(view.content)
    ? structuredClone(record(view.content))
    : null;
}
export const overallField = (type: ReportType) =>
  type === "yearly" ? "teacherAnnualComment" : "teacherComment";
export const subjectField = (type: ReportType) =>
  type === "yearly" ? "annualSummary" : "summary";
export function contentPatch(row: ReportRow, content: Record<string, unknown>) {
  return {
    finalReport: structuredClone(content),
    summary: buildSummaryFromStructured(row.reportType, content, row.summary)
  };
}
export function overallText(row: ReportRow, content: Record<string, unknown>) {
  return text(
    content[overallField(row.reportType)] ??
      content[
        row.reportType === "yearly"
          ? "annualExecutiveSummary"
          : "executiveSummary"
      ] ??
      row.summary
  );
}
