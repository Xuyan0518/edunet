import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { Database } from '../db';
import { studentsTable, studentPapersTable, dailyProgress, paperTypesTable, paperSchoolsTable } from '../schema';
import type { PracticeExportRequest } from '../../src/domain/practiceExport';

type Student = Pick<typeof studentsTable.$inferSelect, 'id' | 'name' | 'grade'>;
type Paper = { paper: typeof studentPapersTable.$inferSelect; type: string | null; school: string | null };
type Daily = Pick<typeof dailyProgress.$inferSelect, 'id' | 'studentId' | 'date' | 'activities'>;
type Practice = { studentId: string; date: string; subject: string; kind: string; name: string;
  attempt: number; score: number | null; total: number | null; notes: string; sourceId: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numeric = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function scorePair(score: unknown, total: unknown) {
  const fraction = typeof score === 'string' ? score.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/) : null;
  return { score: fraction ? Number(fraction[1]) : numeric(score), total: numeric(total) ?? (fraction ? Number(fraction[2]) : null) };
}
const text = (value: unknown) => typeof value === 'string' ? value : '';
const canonical: Record<string, string> = { editing: 'Editing', reading: 'Reading', grammar: 'Grammar', essay: 'Composition' };
const aliases: Record<string, string> = { composition: 'essay', readingcomprehension: 'reading' };

export function practiceAttempts(papers: Paper[], daily: Daily[]): Practice[] {
  const rows: Practice[] = papers.map(({ paper, type, school }) => ({
    studentId: paper.studentId, date: paper.date, subject: paper.subjectName || '', kind: type || 'Practice paper',
    name: paper.description || type || 'Practice paper', attempt: 1, score: paper.score, total: paper.total,
    notes: [school, paper.strengths, paper.improvements].filter(Boolean).join('\n'), sourceId: paper.id,
  }));
  for (const record of daily) {
    for (const [activityIndex, raw] of (Array.isArray(record.activities) ? record.activities : []).entries()) {
      const activity = object(raw), english = object(activity.english);
      const emitted = new Set<string>();
      const append = (key: string, label: string, field: Record<string, unknown>, count: unknown) => {
        const exercises = Array.isArray(field.exercises) ? field.exercises : [];
        const pair = scorePair(field.score, field.totalScore ?? field.maxScore);
        const details = text(field.text) || text(field.problems) || text(field.title);
        if (!exercises.length && pair.score === null && !(numeric(count) ?? 0) && !details && field.completed !== true) return false;
        // Exercise entries are the individual attempts. Never also export their aggregate score.
        const attempts = exercises.length ? exercises : [field];
        attempts.forEach((rawAttempt, index) => {
          const attempt = object(rawAttempt);
          const attemptPair = scorePair(attempt.score, attempt.totalScore ?? attempt.maxScore ?? field.totalScore ?? field.maxScore);
          rows.push({ studentId: record.studentId, date: record.date,
            subject: text(activity.subjectDisplayName) || text(activity.subjectName) || text(activity.subject) || 'English',
            kind: 'English practice', name: text(field.title) || label, attempt: index + 1,
            ...attemptPair, notes: [text(attempt.problems) || text(attempt.text) || details,
              !exercises.length && (numeric(count) ?? 0) > 1 ? `Historical task records ${count} practices with one task-level score; individual attempt scores are unavailable.` : ''].filter(Boolean).join('\n'),
            sourceId: `${record.id}:${activityIndex}:${key}:${index}` });
        });
        return true;
      };
      for (const [key, label] of Object.entries(canonical)) {
        const rawField = english[key];
        const field = typeof rawField === 'string' ? { text: rawField } : object(rawField);
        if (append(key, label, field, field.exerciseCount ?? field.articleCount)) emitted.add(key);
      }
      for (const [index, rawTask] of (Array.isArray(activity.englishTasks) ? activity.englishTasks : []).entries()) {
        const task = object(rawTask), key = text(task.key).toLowerCase();
        if (emitted.has(aliases[key] || key)) continue;
        append(`custom:${index}`, text(task.displayName) || text(task.englishName) || text(task.chineseName) || key || 'English task', task, task.practiceCount);
      }
    }
  }
  return rows;
}

export async function loadPracticeScores(database: Pick<Database, 'select'>, request: PracticeExportRequest) {
  const selection = request.scope === 'selected' ? inArray(studentsTable.id, request.studentIds)
    : request.scope === 'grade' ? eq(studentsTable.grade, request.grade) : undefined;
  const students = await database.select({ id: studentsTable.id, name: studentsTable.name, grade: studentsTable.grade })
    .from(studentsTable).where(selection).orderBy(asc(studentsTable.grade), asc(studentsTable.name), asc(studentsTable.id));
  if (request.scope === 'selected' && students.length !== request.studentIds.length) throw new Error('STUDENT_SELECTION_NOT_FOUND');
  if (!students.length) return { students, attempts: [] as Practice[] };
  const [papers, daily] = await Promise.all([
    database.select({ paper: studentPapersTable, type: paperTypesTable.name, school: paperSchoolsTable.name })
      .from(studentPapersTable).innerJoin(studentsTable, eq(studentsTable.id, studentPapersTable.studentId))
      .leftJoin(paperTypesTable, eq(paperTypesTable.id, studentPapersTable.typeId))
      .leftJoin(paperSchoolsTable, eq(paperSchoolsTable.id, studentPapersTable.schoolId))
      .where(and(selection, isNull(studentPapersTable.deletedAt), gte(studentPapersTable.date, request.startDate), lte(studentPapersTable.date, request.endDate)))
      .orderBy(asc(studentPapersTable.date), asc(studentPapersTable.id)),
    database.select({ id: dailyProgress.id, studentId: dailyProgress.studentId, date: dailyProgress.date, activities: dailyProgress.activities })
      .from(dailyProgress).innerJoin(studentsTable, eq(studentsTable.id, dailyProgress.studentId))
      .where(and(selection, isNull(dailyProgress.deletedAt), gte(dailyProgress.date, request.startDate), lte(dailyProgress.date, request.endDate)))
      .orderBy(asc(dailyProgress.date), asc(dailyProgress.id)),
  ]);
  return { students, attempts: practiceAttempts(papers, daily) };
}

export function practiceScoreSheets(request: PracticeExportRequest, data: { students: Student[]; attempts: Practice[] }) {
  const students = new Map(data.students.map(student => [student.id, student]));
  const counts = new Map<string, number>();
  for (const attempt of data.attempts) counts.set(attempt.studentId, (counts.get(attempt.studentId) ?? 0) + 1);
  const attempts = [...data.attempts].sort((a, b) => a.date.localeCompare(b.date) || a.studentId.localeCompare(b.studentId) || a.sourceId.localeCompare(b.sourceId, 'en', { numeric: true }));
  return [
    { name: 'Export summary', rows: [
      ['Practice score export', 'Value'], ['Scope', request.scope === 'grade' ? `Grade: ${request.grade}` : request.scope === 'selected' ? 'Selected students' : 'All students'],
      ['Start date (inclusive)', request.startDate], ['End date (inclusive)', request.endDate], ['Students', data.students.length],
      ['Practice attempts', attempts.length], ['Scored attempts', attempts.filter(row => row.score !== null).length],
      ['Score notes', 'Blank scores mean unscored. Zero is a recorded score. Dates use the school time zone (UTC+8).'],
      ['Sources', 'Practice papers and daily English tasks. Each exercise is exported separately; aggregate scores are not duplicated. Deleted records are excluded.'],
    ] },
    { name: 'Students', rows: [['Student ID', 'Student', 'Grade', 'Practice attempts'], ...data.students.map(student => [student.id, student.name, student.grade, counts.get(student.id) ?? 0])], filter: true },
    { name: 'Practice scores', rows: [
      ['Student ID', 'Student', 'Grade', 'Date', 'Subject', 'Practice type', 'Practice / task', 'Attempt', 'Score', 'Maximum score', 'Percentage (%)', 'Notes', 'Source record'],
      ...attempts.map(attempt => { const student = students.get(attempt.studentId)!; return [
        student.id, student.name, student.grade, attempt.date, attempt.subject, attempt.kind, attempt.name, attempt.attempt,
        attempt.score, attempt.total, attempt.score !== null && attempt.total !== null && attempt.total > 0 ? Math.round(attempt.score / attempt.total * 10000) / 100 : null,
        attempt.notes, attempt.sourceId,
      ]; }),
    ], filter: true },
  ];
}
