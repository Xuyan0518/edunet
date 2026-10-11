import { requestJson, ApiError } from "@/services/http";
import { normalizeActivities } from "@/domain/englishNormalize";
import { finiteNumber } from "@/domain/scoreDisplay";
import { paperPayload, Paper } from "@/features/assessments/contracts";
export interface DailyRecord {
  id?: string;
  studentId: string;
  date: string;
  attendance: "present" | "absent" | "late";
  attendanceStart: string;
  attendanceEnd: string;
  summary: string;
  activities: Record<string, unknown>[];
  updatedAt?: string;
}
export interface DailyForm {
  daily: DailyRecord;
  papers: Paper[];
}
export type SaveStage =
  | { kind: "idle" }
  | { kind: "dailySavedPaperPending"; daily: DailyRecord }
  | { kind: "outcomeUnknown"; part: "daily" | "papers"; daily?: DailyRecord }
  | { kind: "complete"; daily: DailyRecord };
export function newestPaperVersion(rows: Paper[]) {
  return (
    rows
      .map(row => row.updatedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null
  );
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function dailyContent(record: DailyRecord) {
  return canonical({
    studentId: record.studentId,
    date: record.date,
    attendance: record.attendance,
    attendanceStart: record.attendanceStart || "",
    attendanceEnd: record.attendanceEnd || "",
    summary: record.summary || "",
    activities: normalizeActivities(record.activities)
  });
}
export function paperContent(rows: Paper[]) {
  return rows
    .map(row =>
      canonical({
        subjectId: row.subjectId || null,
        subjectName: row.subjectName || null,
        typeId: row.typeId,
        schoolId: row.schoolId,
        date: row.date,
        description: row.description || "",
        strengths: (row.strengths || "").trim(),
        improvements: (row.improvements || "").trim(),
        score: finiteNumber(row.score),
        total: finiteNumber(row.total)
      })
    )
    .sort()
    .join("\n");
}
export function dailyBody(record: DailyRecord) {
  return {
    studentId: record.studentId,
    date: record.date,
    attendance: record.attendance,
    attendanceStart: record.attendanceStart,
    attendanceEnd: record.attendanceEnd,
    summary: record.summary,
    activities: record.activities.map(activity => {
      const copy = { ...activity };
      // New paper inputs are saved through the day batch. Existing embedded
      // history is a separate legacy source and must survive an unrelated edit.
      if (!record.id) delete copy.papers;
      return copy;
    }),
    ...(record.id ? { updatedAt: record.updatedAt } : {})
  };
}
export class DailySaveError extends Error {
  constructor(public stage: SaveStage, public cause: unknown) {
    super(cause instanceof Error ? cause.message : "Save incomplete");
  }
}
const uncertain = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500;
export async function saveDailyStage(
  form: DailyForm,
  onStage: (stage: SaveStage) => void
): Promise<DailyRecord> {
  try {
    const saved = await requestJson<DailyRecord>(
      form.daily.id
        ? `progress/${encodeURIComponent(form.daily.id)}`
        : "progress",
      { method: form.daily.id ? "PUT" : "POST", body: dailyBody(form.daily) }
    );
    if (!saved?.id || !saved.updatedAt)
      throw new Error("Daily save response did not include identity/version");
    onStage({ kind: "dailySavedPaperPending", daily: saved });
    return saved;
  } catch (error) {
    const stage: SaveStage = uncertain(error)
      ? { kind: "outcomeUnknown", part: "daily" }
      : { kind: "idle" };
    onStage(stage);
    throw new DailySaveError(stage, error);
  }
}
export async function savePaperStage(
  studentId: string,
  date: string,
  papers: Paper[],
  expectedUpdatedAt: string | null,
  daily: DailyRecord,
  onStage: (stage: SaveStage) => void
) {
  try {
    await requestJson(
      `students/${encodeURIComponent(studentId)}/papers/batch`,
      {
        method: "PUT",
        body: {
          date,
          papers: papers.map(row => paperPayload({ ...row, id: undefined })),
          expectedUpdatedAt
        }
      }
    );
    onStage({ kind: "complete", daily });
  } catch (error) {
    const stage: SaveStage = uncertain(error)
      ? { kind: "outcomeUnknown", part: "papers", daily }
      : { kind: "dailySavedPaperPending", daily };
    onStage(stage);
    throw new DailySaveError(stage, error);
  }
}
// The existing mini-compatible endpoint returns 404 for an empty day.
export async function loadDailyRecord(studentId: string, date: string, signal?: AbortSignal) {
  try {
    return await requestJson<DailyRecord | null>(
      `progress/student?studentId=${encodeURIComponent(studentId)}&date=${date}`, { signal }
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 &&
        error.details.error === 'No progress found for this student on this date') return null;
    throw error;
  }
}
// Read-only reconciliation. Never resubmit a mutation here.
export async function reconcileDaily(form: DailyForm) {
  const row = await loadDailyRecord(form.daily.studentId, form.daily.date);
  const intended = {
    ...form.daily,
    activities: dailyBody(form.daily).activities
  };
  return {
    row,
    matches: !!row && dailyContent(row) === dailyContent(intended)
  };
}
export async function reconcilePapers(
  studentId: string,
  date: string,
  intended: Paper[],
  original: Paper[]
) {
  const rows = await requestJson<Paper[]>(
    `students/${encodeURIComponent(studentId)}/papers?date=${date}`
  );
  return {
    rows,
    matches: paperContent(rows) === paperContent(intended),
    unchanged:
      paperContent(rows) === paperContent(original) &&
      newestPaperVersion(rows) === newestPaperVersion(original)
  };
}
