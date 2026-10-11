import { isBusinessDate } from "@/domain/businessDates";
export interface Cycle {
  id?: string;
  startDate: string;
  endDate: string;
}
export interface GradePlan {
  id: string;
  grade: string;
  weekStarting: string;
  weekEnding: string;
  topic: string;
  notes?: string | null;
  updatedAt?: string;
}
export interface PlanRecord {
  id?: string;
  score: number | null;
  completed: boolean;
  comment?: string | null;
  updatedAt?: string;
}
export interface StudentPlan {
  cycle: Cycle;
  student: { id: string; name: string; grade: string };
  plan: GradePlan | null;
  record: PlanRecord | null;
  completed: boolean;
}
export function planBody(
  grade: string,
  topic: string,
  notes: string,
  cycle: Cycle
) {
  if (
    !grade.trim() ||
    grade.trim().length > 20 ||
    !topic.trim() ||
    topic.trim().length > 500 ||
    notes.length > 2000
  )
    throw new Error(
      "Grade/topic required; limits: grade 20, topic 500, notes 2000"
    );
  if (!isBusinessDate(cycle.startDate) || !isBusinessDate(cycle.endDate))
    throw new Error("Invalid study cycle");
  return {
    grade: grade.trim(),
    topic: topic.trim(),
    notes: notes.trim(),
    weekStarting: cycle.startDate,
    weekEnding: cycle.endDate
  };
}
export function recordBody(
  data: StudentPlan,
  scoreText: string,
  completed: boolean,
  comment: string
) {
  if (!data.plan || data.plan.grade !== data.student.grade)
    throw new Error("No matching grade plan");
  const score = scoreText.trim() === "" ? null : Number(scoreText);
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100))
    throw new Error("Score must be a whole number from 0–100");
  if (completed && score === null)
    throw new Error("A completed record requires a score");
  if (comment.length > 2000) throw new Error("Comment exceeds 2000 characters");
  return {
    studentId: data.student.id,
    gradeWeeklyPlanId: data.plan.id,
    score,
    completed,
    comment: comment.trim()
  };
}
export function planStatus(
  plan: unknown,
  record: Pick<PlanRecord, "score" | "completed"> | null
) {
  return !plan
    ? "no-plan"
    : !record
    ? "no-record"
    : record.completed && record.score !== null
    ? "completed"
    : record.score !== null
    ? "scored"
    : "incomplete";
}
export function validExportRange(start: string, end: string) {
  return (
    isBusinessDate(start) &&
    isBusinessDate(end) &&
    end >= start &&
    (Date.parse(end) - Date.parse(start)) / 86400000 + 1 <= 370
  );
}
