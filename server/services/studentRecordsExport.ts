import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db';
import { studentsTable, studentSubjectsTable, subjectsTable, dailyProgress, weeklyFeedback, examsTable, examScoresTable, studentPapersTable, quarterlySummaryTable, yearlySummaryTable, studentReportsTable } from '../schema';
export async function loadStudentRecords(database: Pick<Database, 'select'>, studentId: string) {
    const [student] = await database.select().from(studentsTable).where(eq(studentsTable.id, studentId)).limit(1);
    if (!student)
        return null;
    const [subjects, daily, weekly, exams, papers, quarterly, yearly, reports] = await Promise.all([
        database.select({ id: subjectsTable.id, name: subjectsTable.name, code: subjectsTable.code, level: subjectsTable.level }).from(studentSubjectsTable).innerJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id)).where(eq(studentSubjectsTable.studentId, studentId)),
        database.select().from(dailyProgress).where(and(eq(dailyProgress.studentId, studentId), isNull(dailyProgress.deletedAt))).orderBy(dailyProgress.date),
        database.select().from(weeklyFeedback).where(and(eq(weeklyFeedback.studentId, studentId), isNull(weeklyFeedback.deletedAt))).orderBy(weeklyFeedback.weekStarting),
        database.select({ id: examsTable.id, name: examsTable.name, date: examsTable.examDate, type: examsTable.examType, subject: examScoresTable.name, subjectDate: examScoresTable.examDate, scope: examScoresTable.scope, score: examScoresTable.score }).from(examsTable).leftJoin(examScoresTable, eq(examScoresTable.examId, examsTable.id)).where(and(eq(examsTable.studentId, studentId), isNull(examsTable.deletedAt))).orderBy(examsTable.examDate),
        database.select().from(studentPapersTable).where(and(eq(studentPapersTable.studentId, studentId), isNull(studentPapersTable.deletedAt))).orderBy(studentPapersTable.date),
        database.select().from(quarterlySummaryTable).where(and(eq(quarterlySummaryTable.studentId, studentId), isNull(quarterlySummaryTable.deletedAt))).orderBy(quarterlySummaryTable.year),
        database.select().from(yearlySummaryTable).where(and(eq(yearlySummaryTable.studentId, studentId), isNull(yearlySummaryTable.deletedAt))).orderBy(yearlySummaryTable.year),
        database.select().from(studentReportsTable).where(and(eq(studentReportsTable.studentId, studentId), isNull(studentReportsTable.deletedAt))).orderBy(studentReportsTable.startDate),
    ]);
    return { student, subjects, daily, weekly, exams, papers, quarterly, yearly, reports };
}
export type StudentRecords = NonNullable<Awaited<ReturnType<typeof loadStudentRecords>>>;
export function studentRecordSheets(records: StudentRecords) {
    const sheet = (name: string, rows: object[], columns: string[]) => ({ name, rows: [columns, ...rows.map(row => columns.map(key => (row as Record<string, unknown>)[key] ?? ''))] });
    const raw: unknown[][] = [['Record type', 'Record ID', 'Part', 'JSON (join parts in order)']];
    for (const [kind, data] of Object.entries(records))
        for (const row of Array.isArray(data) ? data : [data]) {
            const value = JSON.stringify(row);
            let start = 0, part = 1;
            while (start < value.length) {
                let end = Math.min(start + 30000, value.length);
                if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]))
                    end--;
                raw.push([kind, (row as {
                        id: string;
                    }).id, part++, value.slice(start, end)]);
                start = end;
            }
        }
    return [
        sheet('Student', [records.student], ['id', 'name', 'grade', 'parentId', 'createdAt']),
        sheet('Subjects', records.subjects, ['id', 'name', 'code', 'level']),
        sheet('Daily progress', records.daily, ['id', 'date', 'attendance', 'attendanceStart', 'attendanceEnd', 'summary', 'activities', 'updatedAt']),
        sheet('Weekly feedback', records.weekly, ['id', 'weekStarting', 'weekEnding', 'summary', 'strengths', 'areasToImprove', 'teacherNotes', 'nextWeekFocus', 'visibleToParent', 'reviewStatus', 'updatedAt']),
        sheet('Exams', records.exams, ['id', 'name', 'date', 'type', 'subject', 'subjectDate', 'scope', 'score']),
        sheet('Papers', records.papers, ['id', 'date', 'subjectId', 'subjectName', 'description', 'score', 'total', 'strengths', 'improvements', 'updatedAt']),
        sheet('Semester summaries', records.quarterly, ['id', 'year', 'quarter', 'startDate', 'endDate', 'summary', 'visibleToParent', 'reviewStatus']),
        sheet('Yearly summaries', records.yearly, ['id', 'year', 'summary', 'visibleToParent', 'reviewStatus']),
        sheet('Reports', records.reports, ['id', 'reportType', 'title', 'startDate', 'endDate', 'status', 'visibleToParent', 'summaryText', 'finalReportJson', 'analyticsJson']),
        { name: 'Complete record JSON', rows: raw },
    ];
}
