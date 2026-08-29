import ExcelJS from 'exceljs';
import { pickCoveringCycle, syntheticCycleFor } from './weeklyCycles';

export type ExportStudent = {
  id: string;
  name: string;
  grade: string;
};

export type ExportDailyRecord = {
  studentId: string;
  date: string | Date;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  summary?: string | null;
  activities?: unknown[] | null;
};

export type ExportWeeklyRecord = {
  studentId: string;
  weekStarting: string | Date;
  weekEnding: string | Date;
  summary?: string | null;
  strengths?: string[] | null;
  areasToImprove?: string[] | null;
  teacherNotes?: string | null;
  nextWeekFocus?: string | null;
};

export type ExportWeeklyCycle = {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  notes: string | null;
};

export type StudentRecordsWorkbookInput = {
  startDate: string;
  endDate: string;
  studentId?: string;
  students: ExportStudent[];
  dailyRecords: ExportDailyRecord[];
  weeklyRecords: ExportWeeklyRecord[];
  weeklyCycles?: ExportWeeklyCycle[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDate = (value: string | Date) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const isRealIsoDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const isValidExportDateRange = (startDate: string, endDate: string) =>
  isRealIsoDate(startDate) && isRealIsoDate(endDate) && startDate <= endDate;

const activityText = (activities?: unknown[] | null) => {
  if (!activities?.length) return '';
  return activities.map((activity) => {
    if (typeof activity === 'string') return activity;
    if (!activity || typeof activity !== 'object') return String(activity);
    const values = Object.entries(activity as Record<string, unknown>)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    return values.join('; ');
  }).join('\n');
};

const listText = (items?: string[] | null) => (items || []).join('\n');

export const buildStudentRecordsWorkbook = async (input: StudentRecordsWorkbookInput): Promise<Buffer> => {
  if (!isValidExportDateRange(input.startDate, input.endDate)) {
    throw new Error('Invalid export date range');
  }

  const students = input.students
    .filter((student) => !input.studentId || student.id === input.studentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (input.studentId && students.length === 0) throw new Error('Student not found');

  const studentIds = new Set(students.map((student) => student.id));
  const dailyRecords = input.dailyRecords.filter((record) => {
    const date = toIsoDate(record.date);
    return studentIds.has(record.studentId) && date >= input.startDate && date <= input.endDate;
  });
  const weeklyRecords = input.weeklyRecords.filter((record) => {
    const start = toIsoDate(record.weekStarting);
    const end = toIsoDate(record.weekEnding);
    return studentIds.has(record.studentId) && start <= input.endDate && end >= input.startDate;
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduNet';
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet('Export Summary');
  summary.columns = [{ width: 24 }, { width: 48 }];
  summary.addRows([
    ['EduNet Student Study Records', ''],
    ['Scope', input.studentId ? students[0]?.name || '' : 'All students'],
    ['Start Date', input.startDate],
    ['End Date', input.endDate],
    ['Students', students.length],
    ['Daily Records', dailyRecords.length],
    ['Weekly Feedback Records', weeklyRecords.length],
    ['Generated At', new Date().toISOString()],
  ]);
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A6700' } };
  summary.getColumn(1).font = { bold: true };

  const records = workbook.addWorksheet('Weekly Records', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  records.columns = [
    { header: 'Student', key: 'student', width: 22 },
    { header: 'Grade', key: 'grade', width: 14 },
    { header: 'Week Start', key: 'weekStart', width: 13 },
    { header: 'Week End', key: 'weekEnd', width: 13 },
    { header: 'Record Date', key: 'recordDate', width: 13 },
    { header: 'Attendance', key: 'attendance', width: 12 },
    { header: 'Start Time', key: 'attendanceStart', width: 11 },
    { header: 'End Time', key: 'attendanceEnd', width: 11 },
    { header: 'Activities', key: 'activities', width: 45 },
    { header: 'Daily Summary', key: 'dailySummary', width: 36 },
    { header: 'Weekly Summary', key: 'weeklySummary', width: 40 },
    { header: 'Strengths', key: 'strengths', width: 28 },
    { header: 'Areas to Improve', key: 'areasToImprove', width: 28 },
    { header: 'Teacher Notes', key: 'teacherNotes', width: 32 },
    { header: 'Next Week Focus', key: 'nextWeekFocus', width: 28 },
  ];

  const weeklyByStudentWeek = new Map<string, ExportWeeklyRecord>();
  const weeklyByStudent = new Map<string, ExportWeeklyRecord[]>();
  const cycleEndByStudentWeek = new Map<string, string>();
  for (const record of weeklyRecords) {
    const weekStart = toIsoDate(record.weekStarting);
    const key = `${record.studentId}:${weekStart}`;
    weeklyByStudentWeek.set(key, record);
    cycleEndByStudentWeek.set(key, toIsoDate(record.weekEnding));
    const rows = weeklyByStudent.get(record.studentId) || [];
    rows.push(record);
    weeklyByStudent.set(record.studentId, rows);
  }

  const dailyByStudentWeek = new Map<string, ExportDailyRecord[]>();
  for (const record of dailyRecords) {
    const recordDate = toIsoDate(record.date);
    const storedWeek = (weeklyByStudent.get(record.studentId) || []).find((weekly) =>
      toIsoDate(weekly.weekStarting) <= recordDate && toIsoDate(weekly.weekEnding) >= recordDate);
    const cycle = storedWeek
      ? { startDate: toIsoDate(storedWeek.weekStarting), endDate: toIsoDate(storedWeek.weekEnding) }
      : pickCoveringCycle(input.weeklyCycles || [], recordDate) || syntheticCycleFor(recordDate);
    const key = `${record.studentId}:${cycle.startDate}`;
    cycleEndByStudentWeek.set(key, cycle.endDate);
    const rows = dailyByStudentWeek.get(key) || [];
    rows.push(record);
    dailyByStudentWeek.set(key, rows);
  }

  const keys = new Set([...dailyByStudentWeek.keys(), ...weeklyByStudentWeek.keys()]);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const sortedKeys = [...keys].sort((left, right) => {
    const [leftStudent, leftWeek] = left.split(':');
    const [rightStudent, rightWeek] = right.split(':');
    const weekOrder = leftWeek.localeCompare(rightWeek);
    return weekOrder || (studentById.get(leftStudent)?.name || '').localeCompare(studentById.get(rightStudent)?.name || '');
  });

  for (const key of sortedKeys) {
    const separator = key.lastIndexOf(':');
    const studentId = key.slice(0, separator);
    const weekStart = key.slice(separator + 1);
    const student = studentById.get(studentId);
    if (!student) continue;
    const daily = (dailyByStudentWeek.get(key) || []).sort((a, b) => toIsoDate(a.date).localeCompare(toIsoDate(b.date)));
    const weekly = weeklyByStudentWeek.get(key);
    const sourceRows: Array<ExportDailyRecord | undefined> = daily.length ? daily : [undefined];
    sourceRows.forEach((day, index) => {
      records.addRow({
        student: student.name,
        grade: student.grade,
        weekStart,
        weekEnd: weekly ? toIsoDate(weekly.weekEnding) : cycleEndByStudentWeek.get(key) || '',
        recordDate: day ? toIsoDate(day.date) : '',
        attendance: day?.attendance || '',
        attendanceStart: day?.attendanceStart || '',
        attendanceEnd: day?.attendanceEnd || '',
        activities: activityText(day?.activities),
        dailySummary: day?.summary || '',
        weeklySummary: index === 0 ? weekly?.summary || '' : '',
        strengths: index === 0 ? listText(weekly?.strengths) : '',
        areasToImprove: index === 0 ? listText(weekly?.areasToImprove) : '',
        teacherNotes: index === 0 ? weekly?.teacherNotes || '' : '',
        nextWeekFocus: index === 0 ? weekly?.nextWeekFocus || '' : '',
      });
    });
  }

  records.autoFilter = { from: 'A1', to: 'O1' };
  records.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  records.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A6700' } };
  records.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: rowNumber > 1 };
    if (rowNumber > 1 && rowNumber % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E7' } };
    }
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
};
