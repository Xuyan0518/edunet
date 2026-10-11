import { reportingWeek } from "@/domain/businessDates";
import { requestJson } from "@/services/http";
export interface WeeklyRecord {
  id?: string;
  updatedAt?: string;
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes?: string;
  nextWeekFocus?: string;
  reviewStatus?: string;
  visibleToParent?: boolean;
}
export function weeklyBody(record: WeeklyRecord, summary: string) {
  if (summary.length > 5000)
    throw new Error("Summary is limited to 5000 characters");
  const week = reportingWeek(record.weekStarting);
  if (record.weekStarting !== week.start)
    throw new Error("Select a Sunday reporting week");
  if (record.id && !record.updatedAt)
    throw new Error("Reload the original version before editing");
  return {
    studentId: record.studentId,
    weekStarting: week.start,
    weekEnding: week.end,
    summary,
    strengths: [...(record.strengths || [])],
    areasToImprove: [...(record.areasToImprove || [])],
    teacherNotes: record.teacherNotes || "",
    nextWeekFocus: record.nextWeekFocus || "",
    ...(record.id ? { updatedAt: record.updatedAt } : {})
  };
}
export function weeklyContent(record: WeeklyRecord, summary = record.summary) {
  const { updatedAt: _, ...body } = weeklyBody(record, summary);
  return JSON.stringify(body);
}
export function sourceRange<T extends { date: string }>(
  rows: T[],
  start: string
) {
  const week = reportingWeek(start);
  return rows
    .filter(
      row =>
        row.date.slice(0, 10) >= week.start && row.date.slice(0, 10) <= week.end
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
export async function generateWeeklyDraft(
  studentId: string,
  weekStarting: string
) {
  const week = reportingWeek(weekStarting);
  const result = await requestJson<{ summary?: string }>("ai/weekly-summary", {
    method: "POST",
    body: { studentId, weekStarting: week.start, weekEnding: week.end }
  });
  if (typeof result.summary !== "string")
    throw new Error("No summary returned");
  return result.summary;
}
export function weeklyText(record: WeeklyRecord) {
  return [
    record.weekStarting + " — " + record.weekEnding,
    record.summary,
    ...record.strengths,
    ...record.areasToImprove,
    record.teacherNotes,
    record.nextWeekFocus
  ]
    .filter(Boolean)
    .join("\n\n");
}
