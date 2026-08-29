import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import { buildStudentRecordsWorkbook, isValidExportDateRange } from '../../server/utils/studentRecordsWorkbook';

describe('buildStudentRecordsWorkbook', () => {
  it('rejects impossible calendar dates', () => {
    expect(isValidExportDateRange('2026-02-31', '2026-03-02')).toBe(false);
    expect(isValidExportDateRange('2026-02-01', '2026-02-28')).toBe(true);
  });

  it('uses EduNet Sunday-Thursday cycles for daily records without weekly feedback', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-23',
      endDate: '2026-08-27',
      studentId: 'student-1',
      students: [{ id: 'student-1', name: 'Alice', grade: 'Grade 5' }],
      dailyRecords: [
        { studentId: 'student-1', date: '2026-08-24', attendance: 'present', activities: [], summary: 'Daily only' },
      ],
      weeklyRecords: [],
      weeklyCycles: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Weekly Records')!;
    expect(sheet.getCell('C2').value).toBe('2026-08-23');
    expect(sheet.getCell('D2').value).toBe('2026-08-27');
  });

  it('uses a stored override cycle for daily-only records', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-24',
      endDate: '2026-08-28',
      studentId: 'student-1',
      students: [{ id: 'student-1', name: 'Alice', grade: 'Grade 5' }],
      dailyRecords: [
        { studentId: 'student-1', date: '2026-08-25', attendance: 'present', activities: [], summary: 'Holiday week' },
      ],
      weeklyRecords: [],
      weeklyCycles: [{ id: 'cycle-1', startDate: '2026-08-24', endDate: '2026-08-28', notes: 'Holiday override' }],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Weekly Records')!;
    expect(sheet.getCell('C2').value).toBe('2026-08-24');
    expect(sheet.getCell('D2').value).toBe('2026-08-28');
  });

  it('uses stored weekly boundaries instead of assuming weeks start on Monday', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-02',
      endDate: '2026-08-06',
      studentId: 'student-1',
      students: [{ id: 'student-1', name: 'Alice', grade: 'Grade 5' }],
      dailyRecords: [
        { studentId: 'student-1', date: '2026-08-03', attendance: 'present', activities: [], summary: 'Monday study' },
      ],
      weeklyRecords: [
        { studentId: 'student-1', weekStarting: '2026-08-02', weekEnding: '2026-08-06', summary: 'Sunday cycle', strengths: [], areasToImprove: [] },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Weekly Records')!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getCell('C2').value).toBe('2026-08-02');
    expect(sheet.getCell('E2').value).toBe('2026-08-03');
    expect(sheet.getCell('K2').value).toBe('Sunday cycle');
  });

  it('creates a weekly spreadsheet filtered to the requested student and inclusive date range', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-03',
      endDate: '2026-08-16',
      studentId: 'student-1',
      students: [
        { id: 'student-1', name: 'Alice', grade: 'Grade 5' },
        { id: 'student-2', name: 'Bob', grade: 'Grade 6' },
      ],
      dailyRecords: [
        { studentId: 'student-1', date: '2026-08-02', attendance: 'present', activities: [], summary: 'before range' },
        { studentId: 'student-1', date: '2026-08-03', attendance: 'present', attendanceStart: '09:00', attendanceEnd: '10:00', activities: [{ subjectName: 'Math', comment: 'Fractions' }], summary: 'first day' },
        { studentId: 'student-1', date: '2026-08-16', attendance: 'present', activities: [], summary: 'last day' },
        { studentId: 'student-2', date: '2026-08-04', attendance: 'present', activities: [], summary: 'other student' },
      ],
      weeklyRecords: [
        { studentId: 'student-1', weekStarting: '2026-08-03', weekEnding: '2026-08-09', summary: 'week one', strengths: ['Focus'], areasToImprove: ['Speed'], teacherNotes: 'Good work', nextWeekFocus: 'Decimals' },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Export Summary', 'Weekly Feedback', 'Weekly Records']);
    const rows = workbook.getWorksheet('Weekly Records')!.getSheetValues() as unknown[][];
    const serialized = JSON.stringify(rows);
    expect(serialized).toContain('Alice');
    expect(serialized).toContain('2026-08-03');
    expect(serialized).toContain('2026-08-16');
    expect(serialized).toContain('week one');
    expect(serialized).toContain('Fractions');
    expect(serialized).not.toContain('Bob');
    expect(serialized).not.toContain('before range');
    expect(workbook.getWorksheet('Weekly Records')!.autoFilter).toBeTruthy();
  });

  it('creates one weekly feedback row with subject, English task, teacher comment, paper, and exam columns', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-02',
      endDate: '2026-08-13',
      studentId: 'student-1',
      students: [{ id: 'student-1', name: 'Alice', grade: 'Grade 5' }],
      dailyRecords: [
        {
          studentId: 'student-1',
          date: '2026-08-03',
          attendance: 'present',
          summary: 'Focused day',
          activities: [{ subjectName: 'Mathematics', taskSummary: 'Completed fractions worksheet' }],
        },
        {
          studentId: 'student-1',
          date: '2026-08-04',
          attendance: 'present',
          activities: [{
            subjectName: 'English',
            type: 'english',
            taskSummary: 'Language practice',
            english: {
              editing: { exerciseCount: 1, exercises: [{ score: 8, totalScore: 10, problems: '' }] },
            },
            customEnglishTasks: [{
              key: 'spelling',
              displayName: 'Spelling',
              practiceCount: 1,
              exercises: [{ score: 9, totalScore: 10, problems: '' }],
            }],
          }],
        },
        {
          studentId: 'student-1',
          date: '2026-08-10',
          attendance: 'present',
          activities: [{ subjectName: 'Mathematics', taskSummary: 'Geometry revision' }],
        },
      ],
      weeklyRecords: [{
        studentId: 'student-1',
        weekStarting: '2026-08-02',
        weekEnding: '2026-08-06',
        summary: 'Strong week',
        strengths: ['Focus'],
        areasToImprove: ['Speed'],
        teacherNotes: 'Keep checking the working steps',
        nextWeekFocus: 'Decimals',
      }],
      paperRecords: [{
        studentId: 'student-1',
        date: '2026-08-05',
        subjectName: 'Mathematics',
        description: 'Fractions practice paper',
        score: 18,
        total: 20,
      }],
      examRecords: [{
        id: 'exam-1',
        studentId: 'student-1',
        name: 'WA3',
        examDate: '2026-08-06',
      }],
      examScores: [{
        examId: 'exam-1',
        name: 'English',
        score: '85/100',
      }],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Weekly Feedback')!;
    expect(sheet).toBeTruthy();
    expect(sheet.rowCount).toBe(3);

    const headers = (sheet.getRow(1).values as unknown[]).map((value) => String(value ?? ''));
    const column = (heading: string) => headers.indexOf(heading);
    const value = (row: number, heading: string) => sheet.getRow(row).getCell(column(heading)).value;

    expect(value(2, 'Subject · Mathematics')).toContain('2026-08-03');
    expect(value(2, 'Subject · Mathematics')).toContain('Completed fractions worksheet');
    expect(value(2, 'Subject · English')).toContain('2026-08-04');
    expect(value(2, 'English Task · Editing')).toContain('8/10');
    expect(value(2, 'English Task · Spelling')).toContain('9/10');
    expect(value(2, 'Teacher Notes')).toBe('Keep checking the working steps');
    expect(value(2, 'Practice Papers')).toContain('18/20');
    expect(value(2, 'Exams')).toContain('WA3');
    expect(value(2, 'Exams')).toContain('85/100');

    expect(value(3, 'Subject · English')).toBe('');
    expect(value(3, 'English Task · Editing')).toBe('');
    expect(value(3, 'English Task · Spelling')).toBe('');
    expect(value(3, 'Teacher Notes')).toBe('');
    expect(value(3, 'Practice Papers')).toBe('');
    expect(value(3, 'Exams')).toBe('');
  });

  it('filters and groups per-subject exam scores by their effective exam date', async () => {
    const buffer = await buildStudentRecordsWorkbook({
      startDate: '2026-08-09',
      endDate: '2026-08-15',
      studentId: 'student-1',
      students: [{ id: 'student-1', name: 'Alice', grade: 'Grade 5' }],
      dailyRecords: [],
      weeklyRecords: [],
      examRecords: [{
        id: 'exam-1',
        studentId: 'student-1',
        name: 'Subject assessment',
        examDate: '2026-08-02',
      }],
      examScores: [
        { examId: 'exam-1', name: 'Mathematics', score: '90/100', examDate: '2026-08-10' },
        { examId: 'exam-1', name: 'English', score: '80/100', examDate: '2026-08-16' },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Weekly Feedback')!;
    expect(sheet.rowCount).toBe(2);
    const serialized = JSON.stringify(sheet.getSheetValues());
    expect(serialized).toContain('2026-08-10');
    expect(serialized).toContain('Mathematics: 90/100');
    expect(serialized).not.toContain('English: 80/100');
    expect(serialized).not.toContain('2026-08-02');
  });
});
