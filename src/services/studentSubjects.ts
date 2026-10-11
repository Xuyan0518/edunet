import { requestJson } from "./http";
export interface StudentSubject {
  id: string;
  name: string;
  code?: string;
  level?: string;
}
export async function loadStudentSubjects(
  studentId: string,
  signal?: AbortSignal
): Promise<StudentSubject[]> {
  const rows = await requestJson<{ subject: StudentSubject }[]>(
    `students/${encodeURIComponent(studentId)}/subjects/full`,
    { signal }
  );
  return rows.map(row => row.subject).filter(Boolean);
}
export const isEnglishSubject = (subject: StudentSubject) =>
  subject.code === "ENGLISH" ||
  /^(english|英文|英语)$/i.test(subject.name.trim());
export interface SubjectReference {
  subjectId?: unknown;
  subjectName?: unknown;
  subject?: unknown;
  name?: unknown;
}
const nameOf = (row: SubjectReference) =>
  String(row.subjectName || row.subject || row.name || "")
    .trim()
    .toLowerCase();
export function assignedSubject(
  row: SubjectReference,
  subjects: StudentSubject[]
) {
  return subjects.find(subject =>
    row.subjectId
      ? subject.id === row.subjectId
      : subject.name.trim().toLowerCase() === nameOf(row)
  );
}
// Existing unassigned subjects remain intact during unrelated edits; they cannot be added anew.
export function validSubjectSelection(
  row: SubjectReference,
  subjects: StudentSubject[],
  originals: SubjectReference[] = []
) {
  return (
    !!assignedSubject(row, subjects) ||
    originals.some(
      original =>
        !!nameOf(row) &&
        String(original.subjectId || "") === String(row.subjectId || "") &&
        nameOf(original) === nameOf(row)
    )
  );
}
