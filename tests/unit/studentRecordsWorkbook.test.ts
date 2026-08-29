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

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Export Summary', 'Weekly Records']);
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
});
