export type StudentProfileDateRange = {
  from?: Date;
  to?: Date;
};

export const STUDENT_RECORDS_DEFAULT_TAB = 'overview';

export function createInitialStudentProfileRange(): StudentProfileDateRange {
  return { from: undefined, to: undefined };
}

export function getStudentPerformanceLabel(
  performance: unknown,
  translate: (key: string) => string,
): string {
  if (typeof performance !== 'string' || !performance.trim()) return '—';

  const value = performance.trim();
  switch (value.toLowerCase()) {
    case 'excellent':
      return translate('dailyProgressForm.activity.performance.excellent');
    case 'good':
      return translate('dailyProgressForm.activity.performance.good');
    case 'needs improvement':
      return translate('dailyProgressForm.activity.performance.needsImprovement');
    default:
      return value;
  }
}

export type StudentRecordCategoryCounts = {
  dailyProgress: number;
  weeklyFeedback: number;
  exams: number;
  papers: number;
  reports: number;
  semesterSummaries: number;
  yearlySummaries: number;
};

export function summarizeStudentRecords(counts: StudentRecordCategoryCounts) {
  return {
    ...counts,
    total: Object.values(counts).reduce((total, count) => total + count, 0),
  };
}
