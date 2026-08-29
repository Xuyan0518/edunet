import ExcelJS from 'exceljs';
import { pickCoveringCycle, syntheticCycleFor } from './weeklyCycles';
import { aggregateWeeklySubjectAndEnglishBreakdown } from './aiWeeklySummary';
import { normalizeEnglishFields } from './englishNormalize';

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

export type ExportPaperRecord = {
  studentId: string;
  date: string | Date;
  subjectName?: string | null;
  description?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  score?: number | null;
  total?: number | null;
};

export type ExportExamRecord = {
  id: string;
  studentId: string;
  name: string;
  examDate: string | Date;
  examType?: string | null;
};

export type ExportExamScore = {
  examId: string;
  name: string;
  score?: string | null;
  scope?: string | null;
  examDate?: string | Date | null;
};

export type StudentRecordsWorkbookInput = {
  startDate: string;
  endDate: string;
  studentId?: string;
  students: ExportStudent[];
  dailyRecords: ExportDailyRecord[];
  weeklyRecords: ExportWeeklyRecord[];
  weeklyCycles?: ExportWeeklyCycle[];
  paperRecords?: ExportPaperRecord[];
  examRecords?: ExportExamRecord[];
  examScores?: ExportExamScore[];
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const activitySubject = (activity: Record<string, unknown>) =>
  textValue(activity.subjectDisplayName)
  || textValue(activity.subjectName)
  || textValue(activity.subject);

const activityDescription = (activity: Record<string, unknown>) =>
  textValue(activity.taskSummary)
  || textValue(activity.practiceProgress)
  || textValue(activity.description)
  || textValue(activity.comment)
  || textValue(activity.notes);

const appendLine = (map: Map<string, string[]>, key: string, line: string) => {
  if (!key || !line) return;
  const lines = map.get(key) || [];
  lines.push(line);
  map.set(key, lines);
};

const subjectCellsForWeek = (rows: ExportDailyRecord[]) => {
  const cells = new Map<string, string[]>();
  for (const row of rows) {
    const date = toIsoDate(row.date);
    if (!Array.isArray(row.activities)) continue;
    for (const rawActivity of row.activities) {
      if (!isPlainObject(rawActivity)) continue;
      const subject = activitySubject(rawActivity);
      if (!subject) continue;
      const detail = activityDescription(rawActivity) || 'Activity recorded';
      appendLine(cells, subject, `${date}: ${detail}`);
    }
  }
  return new Map([...cells.entries()].map(([subject, lines]) => [subject, lines.join('\n')]));
};

const englishTaskCellsForWeek = (rows: ExportDailyRecord[]) => {
  const cells = new Map<string, string[]>();
  const canonical = [
    ['editing', 'Editing'],
    ['reading', 'Reading'],
    ['grammar', 'Grammar'],
    ['essay', 'Essay'],
  ] as const;

  for (const row of rows) {
    const date = toIsoDate(row.date);
    const { englishBreakdown } = aggregateWeeklySubjectAndEnglishBreakdown([row]);
    for (const [key, heading] of canonical) {
      for (const attempt of englishBreakdown[key].attempts) {
        const score = attempt.scoreText || '';
        const issue = attempt.issues && attempt.issues !== '无' ? attempt.issues : '';
        const detail = [score, issue].filter(Boolean).join(' · ');
        appendLine(cells, heading, `${attempt.date || date}: ${detail || 'Completed'}`);
      }
    }
    for (const task of englishBreakdown.customTasks) {
      for (const attempt of task.attempts) {
        const score = attempt.scoreText || '';
        const issue = attempt.issues && attempt.issues !== '无' ? attempt.issues : '';
        const detail = [score, issue].filter(Boolean).join(' · ');
        appendLine(cells, task.displayName, `${attempt.date || date}: ${detail || 'Completed'}`);
      }
    }

    if (!Array.isArray(row.activities)) continue;
    for (const rawActivity of row.activities) {
      if (!isPlainObject(rawActivity)) continue;
      const subject = activitySubject(rawActivity).toLowerCase();
      const isEnglish = rawActivity.type === 'english'
        || isPlainObject(rawActivity.english)
        || subject === 'english'
        || subject.includes('英语')
        || subject.includes('英文');
      if (!isEnglish) continue;
      const english = normalizeEnglishFields(rawActivity.english ?? {});
      const vocabulary = [
        english.vocab.vocabularyWordCount > 0 ? `${english.vocab.vocabularyWordCount} words` : '',
        english.vocab.vocabularySentenceCount > 0 ? `${english.vocab.vocabularySentenceCount} sentences` : '',
        english.vocab.text,
      ].filter(Boolean).join(' · ');
      if (vocabulary) appendLine(cells, 'Vocabulary', `${date}: ${vocabulary}`);
      if (english.recitation.text) appendLine(cells, 'Recitation', `${date}: ${english.recitation.text}`);
    }
  }

  return new Map([...cells.entries()].map(([task, lines]) => [task, lines.join('\n')]));
};

const paperText = (paper: ExportPaperRecord) => {
  const score = paper.score == null ? '' : `${paper.score}${paper.total == null ? '' : `/${paper.total}`}`;
  const detail = [paper.subjectName || 'Practice paper', paper.description || '', score].filter(Boolean).join(' · ');
  return `${toIsoDate(paper.date)}: ${detail}`;
};

type ExamExportEntry = {
  exam: ExportExamRecord;
  scores: ExportExamScore[];
  effectiveDate: string;
};

const examText = ({ exam, scores, effectiveDate }: ExamExportEntry) => {
  const scoreText = scores
    .map((score) => [score.name, score.score || ''].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');
  const detail = [exam.name, exam.examType || '', scoreText].filter(Boolean).join(' · ');
  return `${effectiveDate}: ${detail}`;
};

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
  const paperRecords = (input.paperRecords || []).filter((record) => {
    const date = toIsoDate(record.date);
    return studentIds.has(record.studentId) && date >= input.startDate && date <= input.endDate;
  });
  const eligibleExams = (input.examRecords || []).filter((record) => studentIds.has(record.studentId));
  const scoresByExamId = new Map<string, ExportExamScore[]>();
  for (const score of input.examScores || []) {
    const rows = scoresByExamId.get(score.examId) || [];
    rows.push(score);
    scoresByExamId.set(score.examId, rows);
  }
  const examEntries: ExamExportEntry[] = [];
  for (const exam of eligibleExams) {
    const scores = scoresByExamId.get(exam.id) || [];
    if (scores.length === 0) {
      const effectiveDate = toIsoDate(exam.examDate);
      if (effectiveDate >= input.startDate && effectiveDate <= input.endDate) {
        examEntries.push({ exam, scores: [], effectiveDate });
      }
      continue;
    }
    const groupedScores = new Map<string, ExportExamScore[]>();
    for (const score of scores) {
      const effectiveDate = toIsoDate(score.examDate || exam.examDate);
      if (effectiveDate < input.startDate || effectiveDate > input.endDate) continue;
      const rows = groupedScores.get(effectiveDate) || [];
      rows.push(score);
      groupedScores.set(effectiveDate, rows);
    }
    for (const [effectiveDate, grouped] of groupedScores) {
      examEntries.push({ exam, scores: grouped, effectiveDate });
    }
  }
  const includedExamCount = new Set(examEntries.map((entry) => entry.exam.id)).size;

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
    ['Practice Papers', paperRecords.length],
    ['Exams', includedExamCount],
    ['Generated At', new Date().toISOString()],
  ]);
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A6700' } };
  summary.getColumn(1).font = { bold: true };

  const weeklyFeedbackSheet = workbook.addWorksheet('Weekly Feedback', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }],
  });
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

  const cycleForDate = (studentId: string, recordDate: string) => {
    const storedWeek = (weeklyByStudent.get(studentId) || []).find((weekly) =>
      toIsoDate(weekly.weekStarting) <= recordDate && toIsoDate(weekly.weekEnding) >= recordDate);
    return storedWeek
      ? { startDate: toIsoDate(storedWeek.weekStarting), endDate: toIsoDate(storedWeek.weekEnding) }
      : pickCoveringCycle(input.weeklyCycles || [], recordDate) || syntheticCycleFor(recordDate);
  };

  const dailyByStudentWeek = new Map<string, ExportDailyRecord[]>();
  for (const record of dailyRecords) {
    const recordDate = toIsoDate(record.date);
    const cycle = cycleForDate(record.studentId, recordDate);
    const key = `${record.studentId}:${cycle.startDate}`;
    cycleEndByStudentWeek.set(key, cycle.endDate);
    const rows = dailyByStudentWeek.get(key) || [];
    rows.push(record);
    dailyByStudentWeek.set(key, rows);
  }

  const papersByStudentWeek = new Map<string, ExportPaperRecord[]>();
  for (const record of paperRecords) {
    const cycle = cycleForDate(record.studentId, toIsoDate(record.date));
    const key = `${record.studentId}:${cycle.startDate}`;
    cycleEndByStudentWeek.set(key, cycle.endDate);
    const rows = papersByStudentWeek.get(key) || [];
    rows.push(record);
    papersByStudentWeek.set(key, rows);
  }

  const examsByStudentWeek = new Map<string, ExamExportEntry[]>();
  for (const entry of examEntries) {
    const cycle = cycleForDate(entry.exam.studentId, entry.effectiveDate);
    const key = `${entry.exam.studentId}:${cycle.startDate}`;
    cycleEndByStudentWeek.set(key, cycle.endDate);
    const rows = examsByStudentWeek.get(key) || [];
    rows.push(entry);
    examsByStudentWeek.set(key, rows);
  }

  const keys = new Set([
    ...dailyByStudentWeek.keys(),
    ...weeklyByStudentWeek.keys(),
    ...papersByStudentWeek.keys(),
    ...examsByStudentWeek.keys(),
  ]);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const sortedKeys = [...keys].sort((left, right) => {
    const [leftStudent, leftWeek] = left.split(':');
    const [rightStudent, rightWeek] = right.split(':');
    const weekOrder = leftWeek.localeCompare(rightWeek);
    return weekOrder || (studentById.get(leftStudent)?.name || '').localeCompare(studentById.get(rightStudent)?.name || '');
  });

  const weeklyFeedbackRows = sortedKeys.flatMap((key) => {
    const separator = key.lastIndexOf(':');
    const studentId = key.slice(0, separator);
    const weekStart = key.slice(separator + 1);
    const student = studentById.get(studentId);
    if (!student) return [];
    const daily = (dailyByStudentWeek.get(key) || [])
      .sort((a, b) => toIsoDate(a.date).localeCompare(toIsoDate(b.date)));
    const weekly = weeklyByStudentWeek.get(key);
    const papers = (papersByStudentWeek.get(key) || [])
      .sort((a, b) => toIsoDate(a.date).localeCompare(toIsoDate(b.date)));
    const exams = (examsByStudentWeek.get(key) || [])
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const attendance = daily.map((day) => {
      const times = [day.attendanceStart || '', day.attendanceEnd || ''].filter(Boolean).join('-');
      return `${toIsoDate(day.date)}: ${day.attendance || ''}${times ? ` (${times})` : ''}`;
    }).join('\n');
    const dailySummaries = daily
      .filter((day) => Boolean(day.summary))
      .map((day) => `${toIsoDate(day.date)}: ${day.summary}`)
      .join('\n');
    return [{
      student,
      weekStart,
      weekEnd: weekly ? toIsoDate(weekly.weekEnding) : cycleEndByStudentWeek.get(key) || '',
      attendance,
      dailySummaries,
      subjects: subjectCellsForWeek(daily),
      englishTasks: englishTaskCellsForWeek(daily),
      practicePapers: papers.map(paperText).join('\n'),
      exams: exams.map(examText).join('\n'),
      weekly,
    }];
  });

  const subjectHeadings = [...new Set(weeklyFeedbackRows.flatMap((row) => [...row.subjects.keys()]))]
    .sort((a, b) => a.localeCompare(b));
  const canonicalEnglishTasks = ['Editing', 'Reading', 'Grammar', 'Vocabulary', 'Recitation', 'Essay'];
  const customEnglishTasks = [...new Set(weeklyFeedbackRows.flatMap((row) => [...row.englishTasks.keys()]))]
    .filter((task) => !canonicalEnglishTasks.includes(task))
    .sort((a, b) => a.localeCompare(b));
  const englishTaskHeadings = [...canonicalEnglishTasks, ...customEnglishTasks];

  weeklyFeedbackSheet.columns = [
    { header: 'Student', key: 'student', width: 22 },
    { header: 'Grade', key: 'grade', width: 14 },
    { header: 'Week Start', key: 'weekStart', width: 13 },
    { header: 'Week End', key: 'weekEnd', width: 13 },
    { header: 'Attendance', key: 'attendance', width: 28 },
    { header: 'Daily Summaries', key: 'dailySummaries', width: 38 },
    ...subjectHeadings.map((subject, index) => ({
      header: `Subject · ${subject}`,
      key: `subject${index}`,
      width: 38,
    })),
    ...englishTaskHeadings.map((task, index) => ({
      header: `English Task · ${task}`,
      key: `englishTask${index}`,
      width: 30,
    })),
    { header: 'Practice Papers', key: 'practicePapers', width: 42 },
    { header: 'Exams', key: 'exams', width: 42 },
    { header: 'Weekly Summary', key: 'weeklySummary', width: 40 },
    { header: 'Strengths', key: 'strengths', width: 28 },
    { header: 'Areas to Improve', key: 'areasToImprove', width: 28 },
    { header: 'Teacher Notes', key: 'teacherNotes', width: 34 },
    { header: 'Next Week Focus', key: 'nextWeekFocus', width: 28 },
  ];

  for (const row of weeklyFeedbackRows) {
    const values: Record<string, string> = {
      student: row.student.name,
      grade: row.student.grade,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      attendance: row.attendance,
      dailySummaries: row.dailySummaries,
      practicePapers: row.practicePapers,
      exams: row.exams,
      weeklySummary: row.weekly?.summary || '',
      strengths: listText(row.weekly?.strengths),
      areasToImprove: listText(row.weekly?.areasToImprove),
      teacherNotes: row.weekly?.teacherNotes || '',
      nextWeekFocus: row.weekly?.nextWeekFocus || '',
    };
    subjectHeadings.forEach((subject, index) => {
      values[`subject${index}`] = row.subjects.get(subject) || '';
    });
    englishTaskHeadings.forEach((task, index) => {
      values[`englishTask${index}`] = row.englishTasks.get(task) || '';
    });
    weeklyFeedbackSheet.addRow(values);
  }

  weeklyFeedbackSheet.autoFilter = {
    from: 'A1',
    to: `${weeklyFeedbackSheet.getColumn(weeklyFeedbackSheet.columnCount).letter}1`,
  };
  weeklyFeedbackSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  weeklyFeedbackSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F513E' } };
  weeklyFeedbackSheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: rowNumber > 1 };
    if (rowNumber > 1 && rowNumber % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7F4' } };
    }
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
