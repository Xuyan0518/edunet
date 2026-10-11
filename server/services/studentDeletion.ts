import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db';
import {
  studentsTable, studentParentBindingsTable, studentTopicProgressTable, studentSubjectsTable,
  dailyProgress, weeklyFeedback, studentPapersTable, studentEnglishTaskConfigsTable,
  studentWeeklyTaskTargetsTable, studentWeeklyPlanRecordsTable, examsTable, examScoresTable,
  quarterlySummaryTable, yearlySummaryTable, studentReportsTable,
} from '../schema';

type DeletionDatabase = Pick<Database, 'select' | 'delete' | 'batch'>;
// Neon HTTP does not support callback transactions. Its batch API uses one
// client.transaction() call. Never await these queries individually.
export function studentDeletionBatch(database: DeletionDatabase, studentId: string) {
  const exams = database.select({ id: examsTable.id }).from(examsTable).where(eq(examsTable.studentId, studentId));
  return [
    // Prevent concurrent FK-linked writes while the complete cascade runs.
    database.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.id, studentId)).for('update'),
    database.delete(studentParentBindingsTable).where(eq(studentParentBindingsTable.studentId, studentId)),
    database.delete(studentTopicProgressTable).where(eq(studentTopicProgressTable.studentId, studentId)),
    database.delete(studentSubjectsTable).where(eq(studentSubjectsTable.studentId, studentId)),
    // Include active AND soft-deleted records; no activeRecord predicate here.
    database.delete(studentPapersTable).where(eq(studentPapersTable.studentId, studentId)),
    database.delete(studentEnglishTaskConfigsTable).where(eq(studentEnglishTaskConfigsTable.studentId, studentId)),
    database.delete(studentWeeklyTaskTargetsTable).where(eq(studentWeeklyTaskTargetsTable.studentId, studentId)),
    database.delete(studentWeeklyPlanRecordsTable).where(eq(studentWeeklyPlanRecordsTable.studentId, studentId)),
    database.delete(weeklyFeedback).where(eq(weeklyFeedback.studentId, studentId)),
    database.delete(dailyProgress).where(eq(dailyProgress.studentId, studentId)),
    database.delete(examScoresTable).where(inArray(examScoresTable.examId, exams)),
    database.delete(examsTable).where(eq(examsTable.studentId, studentId)),
    database.delete(quarterlySummaryTable).where(eq(quarterlySummaryTable.studentId, studentId)),
    database.delete(yearlySummaryTable).where(eq(yearlySummaryTable.studentId, studentId)),
    database.delete(studentReportsTable).where(eq(studentReportsTable.studentId, studentId)),
    database.delete(studentsTable).where(eq(studentsTable.id, studentId)).returning({ id: studentsTable.id }),
  ] as const;
}
export async function deleteStudentCascade(database: DeletionDatabase, studentId: string): Promise<boolean> {
  const results = await database.batch(studentDeletionBatch(database, studentId));
  return results[15].length === 1;
}
