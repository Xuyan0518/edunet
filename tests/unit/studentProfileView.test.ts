import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  STUDENT_RECORDS_DEFAULT_TAB,
  createInitialStudentProfileRange,
  getStudentPerformanceLabel,
  summarizeStudentRecords,
} from '../../src/utils/studentProfileView';

describe('teacher student profile record visibility', () => {
  it('shows historical records by default instead of limiting the profile to the current week', () => {
    expect(createInitialStudentProfileRange()).toEqual({
      from: undefined,
      to: undefined,
    });
  });

  it('opens the academic workspace on an overview that exposes every record category', () => {
    expect(STUDENT_RECORDS_DEFAULT_TAB).toBe('overview');
    expect(summarizeStudentRecords({
      dailyProgress: 64,
      weeklyFeedback: 12,
      exams: 0,
      papers: 2,
      reports: 0,
      semesterSummaries: 0,
      yearlySummaries: 0,
    })).toEqual({
      dailyProgress: 64,
      weeklyFeedback: 12,
      exams: 0,
      papers: 2,
      reports: 0,
      semesterSummaries: 0,
      yearlySummaries: 0,
      total: 78,
    });
  });

  it('renders historical activities whose legacy performance value is missing', () => {
    const translate = (key: string) => `translated:${key}`;

    expect(getStudentPerformanceLabel(undefined, translate)).toBe('—');
    expect(getStudentPerformanceLabel(null, translate)).toBe('—');
    expect(getStudentPerformanceLabel('good', translate)).toBe(
      'translated:dailyProgressForm.activity.performance.good',
    );
    expect(getStudentPerformanceLabel('custom result', translate)).toBe('custom result');
  });

  it('wires the all-history range and overview into the teacher portal pages', () => {
    const profileSource = readFileSync(
      new URL('../../src/pages/StudentProfile.tsx', import.meta.url),
      'utf8',
    );
    const recordsSource = readFileSync(
      new URL('../../src/pages/StudentRecords.tsx', import.meta.url),
      'utf8',
    );

    expect(profileSource).toContain('useState<DateRange>(createInitialStudentProfileRange)');
    expect(recordsSource).toContain('defaultValue={STUDENT_RECORDS_DEFAULT_TAB}');
    expect(recordsSource).toContain('students/${id}/progress');
    expect(recordsSource).toContain('feedback/list?studentId=${encodeURIComponent(id)}');
    expect(recordsSource).toContain('<StudentRecordsOverview');
  });
});
