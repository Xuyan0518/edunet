import { isBusinessDate } from "@/domain/businessDates";
import { finiteNumber } from "@/domain/scoreDisplay";
export interface ExamSubject {
  name: string;
  score?: string;
  examDate?: string | null;
  scope?: string | null;
  percentage?: number | null;
  grade?: string | null;
}
export interface Exam {
  id?: string;
  name: string;
  examDate: string;
  examType?: string | null;
  reminderDate?: string | null;
  subjects: ExamSubject[];
  updatedAt?: string;
}
export interface Paper {
  id?: string;
  subjectId?: string | null;
  subjectName?: string;
  typeId: string;
  schoolId: string;
  date: string;
  description: string;
  strengths: string;
  improvements: string;
  score: number | string | null;
  total: number | string | null;
  updatedAt?: string;
  typeName?: string;
  schoolName?: string;
}
export interface DictionaryRow {
  id: string;
  name: string;
}
export function examPayload(form: Exam) {
  if (!form.name.trim() || form.name.trim().length > 50)
    throw new Error("Exam name must contain 1–50 characters");
  const subjects = form.subjects
    .map(subject => ({
      name: subject.name.trim(),
      score: String(subject.score ?? "").trim(),
      examDate: subject.examDate || null,
      scope: subject.scope ?? null
    }))
    .filter(subject => subject.examDate || subject.score);
  if (!subjects.length || subjects.length > 30)
    throw new Error("Keep 1–30 dated or scored subjects");
  for (const subject of subjects) {
    if (!subject.name || subject.name.length > 100)
      throw new Error("Subject name is required (maximum 100 characters)");
    if (subject.examDate && !isBusinessDate(subject.examDate))
      throw new Error("Invalid subject date");
    if (subject.score) {
      const fraction = subject.score.match(
        /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/
      );
      const score = finiteNumber(fraction ? fraction[1] : subject.score);
      const total = fraction ? finiteNumber(fraction[2]) : null;
      if (
        score === null ||
        score < 0 ||
        score > 500 ||
        (fraction &&
          (total === null || total <= 0 || total > 500 || score > total))
      )
        throw new Error("Invalid score (0–500, numerator cannot exceed total)");
    }
  }
  const examDate =
    subjects
      .map(subject => subject.examDate)
      .filter(Boolean)
      .sort()[0] || form.examDate;
  if (!isBusinessDate(examDate))
    throw new Error("At least one valid exam date is required");
  if (form.id && !form.updatedAt)
    throw new Error("Reload the original exam version before editing");
  return {
    name: form.name.trim(),
    examDate,
    subjects,
    examType: form.examType ?? null,
    reminderDate: form.reminderDate ?? null,
    ...(form.id ? { updatedAt: form.updatedAt } : {})
  };
}
export function paperPayload(form: Paper) {
  if (!form.typeId || !form.schoolId || !isBusinessDate(form.date))
    throw new Error("Type, school and a valid date are required");
  if (!form.strengths?.trim() || !form.improvements?.trim())
    throw new Error("Both evaluation fields are required");
  if (
    (form.description || "").length > 200 ||
    form.strengths.length > 1000 ||
    form.improvements.length > 1000
  )
    throw new Error("Description/evaluation is too long");
  const score = finiteNumber(form.score),
    total = finiteNumber(form.total);
  if (
    form.score !== null &&
    String(form.score).trim() !== "" &&
    (score === null || !Number.isInteger(score) || score < 0 || score > 500)
  )
    throw new Error("Score must be a whole number from 0–500");
  if (
    form.total !== null &&
    String(form.total).trim() !== "" &&
    (total === null || !Number.isInteger(total) || total < 1 || total > 500)
  )
    throw new Error("Total must be a whole number from 1–500");
  if (score !== null && total !== null && score > total)
    throw new Error("Score cannot exceed total");
  if (form.id && !form.updatedAt)
    throw new Error("Reload the original paper version before editing");
  return {
    subjectId: form.subjectId || null,
    subjectName: form.subjectName || null,
    typeId: form.typeId,
    schoolId: form.schoolId,
    date: form.date,
    description: form.description || "",
    strengths: form.strengths.trim(),
    improvements: form.improvements.trim(),
    score,
    total,
    ...(form.id ? { updatedAt: form.updatedAt } : {})
  };
}
