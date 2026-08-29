import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addAssignedSubjectActivity,
  createDefaultEnglishActivity,
  createEmptyEnglishFields,
  mergeConfiguredCustomEnglishTasks,
  toWeeklyProgressDays,
} from '../../src/utils/dailyProgressParity';
import {
  buildWeeklyFeedbackWritePayload,
  canonicalWeekStarting,
  describeApiSaveError,
  resolveInitialWeekStarting,
} from '../../src/utils/weeklyFeedbackParity';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('web and Mini Program workflow parity', () => {
  it('preserves legacy custom English tasks and merges configuration keys case-insensitively', () => {
    const existing = [
      { taskId: 'legacy', key: 'LegacyTask', displayName: 'Legacy', practiceCount: 2, score: 8, maxScore: 10, problems: '', exercises: [], completed: true, targetCount: 1, fieldsUsed: ['practiceCount'] },
      { taskId: 'debate-old', key: 'Debate', displayName: 'Debate old', practiceCount: 1, score: 9, maxScore: 10, problems: '', exercises: [], completed: true, targetCount: 1, fieldsUsed: ['score'] },
    ];
    const merged = mergeConfiguredCustomEnglishTasks(existing, [
      { id: 'debate-new', key: 'debate', displayName: 'Debate configured', enabled: true },
      { id: 'debate-duplicate', key: 'DEBATE', displayName: 'Duplicate', enabled: true },
    ]);

    expect(merged.map((task) => task.key.toLowerCase())).toEqual(['debate', 'legacytask']);
    expect(merged[0].practiceCount).toBe(1);
    expect(merged[1].practiceCount).toBe(2);
  });

  it('preserves optimistic-lock timestamps and exposes structured save conflicts', () => {
    const payload = buildWeeklyFeedbackWritePayload({
      studentId: 'student-1',
      weekStarting: '2026-08-23',
      weekEnding: '2026-08-29',
      summary: 'Summary',
      strengths: ['Consistent'],
      areasToImprove: ['Accuracy'],
      teacherNotes: 'Note',
      nextWeekFocus: 'Focus',
    }, '2026-08-29T01:02:03.000Z');

    expect(payload.updatedAt).toBe('2026-08-29T01:02:03.000Z');
    expect(describeApiSaveError({ error: 'CONFLICT', updatedByName: 'Another teacher' }, 409))
      .toContain('Another teacher');
    expect(describeApiSaveError({ error: 'LOSS_POINTS_REQUIRED' }, 400))
      .toContain('LOSS_POINTS_REQUIRED');
  });

  it('accepts only a requested historical Sunday as a canonical week start', () => {
    expect(canonicalWeekStarting('2026-08-16')).toBe('2026-08-16');
    expect(canonicalWeekStarting('2026-08-19')).toBeNull();
    expect(resolveInitialWeekStarting('2026-08-16', '2026-08-23')).toBe('2026-08-16');
    expect(resolveInitialWeekStarting('2026-08-19', '2026-08-23')).toBe('2026-08-23');
    expect(resolveInitialWeekStarting('not-a-date', '2026-08-23')).toBe('2026-08-23');
  });

  it('starts every new daily record with one locked English activity', () => {
    const activity = createDefaultEnglishActivity({ id: 'english-1', name: 'English', code: 'ENG' });

    expect(activity).toMatchObject({
      subjectId: 'english-1',
      subjectName: 'English',
      type: 'english',
      locked: true,
      english: createEmptyEnglishFields(),
    });
  });

  it('adds activity cards only from the student assigned-subject list and prevents duplicates', () => {
    const english = createDefaultEnglishActivity({ id: 'english-1', name: 'English' });
    const mathematics = { id: 'math-1', name: 'Mathematics', code: 'MATH' };

    const once = addAssignedSubjectActivity([english], mathematics);
    const twice = addAssignedSubjectActivity(once, mathematics);

    expect(once).toHaveLength(2);
    expect(once[1]).toMatchObject({
      subjectId: 'math-1',
      subjectName: 'Mathematics',
      type: 'generic',
      taskSummary: '',
      strengths: '',
      improvements: '',
    });
    expect(twice).toEqual(once);
  });

  it('shows every daily record in the selected week with English scores and subject work intact', () => {
    const days = toWeeklyProgressDays([
      {
        id: 'day-3',
        studentId: 'student-1',
        date: '2026-08-11',
        attendance: 'present',
        activities: [{ subjectId: 'math-1', subjectName: 'Mathematics', type: 'generic', taskSummary: 'Fractions' }],
        summary: 'Tuesday summary',
      },
      {
        id: 'outside',
        studentId: 'student-1',
        date: '2026-08-17',
        attendance: 'present',
        activities: [],
      },
      {
        id: 'day-1',
        studentId: 'student-1',
        date: '2026-08-09',
        attendance: 'present',
        activities: [{
          subjectId: 'english-1',
          subjectName: 'English',
          type: 'english',
          english: {
            editing: { exerciseCount: 1, exercises: [{ score: 8, totalScore: 10, problems: 'Tense' }] },
          },
        }],
      },
      {
        id: 'day-2',
        studentId: 'student-1',
        date: '2026-08-10',
        attendance: 'absent',
        absenceReason: 'Medical appointment',
        activities: [],
      },
    ], '2026-08-09', '2026-08-15');

    expect(days.map((day) => day.id)).toEqual(['day-1', 'day-2', 'day-3']);
    expect(days[0].activities[0].sections[0]).toMatchObject({
      title: 'Editing',
      rows: [{ label: 'Exercise 1', scoreText: '8/10', problems: 'Tense' }],
    });
    expect(days[1]).toMatchObject({ isAbsent: true, absenceReason: 'Medical appointment' });
    expect(days[2].activities[0]).toMatchObject({ subjectName: 'Mathematics', summary: 'Fractions' });
  });

  it('includes timestamp-shaped backend dates on the final day of the week', () => {
    const days = toWeeklyProgressDays([{
      id: 'end-day',
      studentId: 'student-1',
      date: '2026-08-29T00:00:00.000Z',
      attendance: 'present',
      activities: [createDefaultEnglishActivity()],
    }], '2026-08-23', '2026-08-29');

    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-08-29');
  });

  it('wires both web workflows to the same endpoints and V2 fields used by the Mini Program', () => {
    const daily = readSource('src/components/ui/DailyProgressForm.tsx');
    const weekly = readSource('src/components/ui/WeeklyFeedbackForm.tsx');
    const miniDaily = readSource('miniprogram/pages/daily-progress/detail.js');
    const miniWeekly = readSource('miniprogram/pages/weekly-feedback/detail.js');
    const server = readSource('server/index.ts');

    expect(daily).toContain("const isReadOnly = role !== 'teacher'");
    expect(daily).not.toContain("role !== 'teacher' && role !== 'admin'");
    expect(weekly).toContain("role !== 'teacher' && role !== 'admin'");
    expect(daily).toContain('students/${selectedStudent}/subjects/full');
    expect(daily).toContain('students/${selectedStudent}/english-tasks');
    expect(daily).toContain('students/${selectedStudent}/papers?date=');
    expect(daily).toContain("response.headers.get('X-Papers-Updated-At')");
    expect(daily).toContain('students/${selectedStudent}/papers/batch');
    expect(daily).toContain("toast({ title: 'Practice papers saved' });");
    expect(daily).not.toContain('Daily progress and practice papers saved');
    expect(daily).toContain('students/${selectedStudent}/topics/${topicId}/progress');
    expect(daily).toContain('<TopicProgressPanel');
    expect(daily).toContain("buildApiUrl('paper-types')");
    expect(daily).toContain("buildApiUrl('paper-schools')");
    expect(daily).toContain("buildApiUrl('progress')");
    expect(daily).toContain('EnglishActivityCard');
    expect(daily).toContain('AssignedSubjectActivityCard');
    expect(weekly).toContain('progress/list?studentId=');
    expect(weekly).toContain("buildApiUrl('ai/weekly-summary')");
    expect(weekly).toContain('students/${selectedStudent}/papers?startDate=');
    expect(weekly).toContain('<WeeklyPracticePapers');
    expect(weekly).toContain('<WeeklyDailyProgress');
    expect(weekly).toContain('day.isAbsent');
    expect(weekly).not.toContain('activity.papers.map');
    expect(weekly).toContain('addDays(weekStarting, 6)');
    expect(weekly).toContain('canonicalWeekStarting(weekStartingFromUrl)');

    expect(miniDaily).toContain('/students/${this.studentId}/subjects/full');
    expect(miniDaily).toContain('/students/${this.studentId}/papers/batch');
    expect(miniWeekly).toContain('/progress/list?studentId=${this.studentId}');
    expect(miniWeekly).toContain('/ai/weekly-summary');
    expect(miniWeekly).toContain('preservedWeeklyFields');
    expect(miniWeekly).not.toContain('strengths: []');
    expect(server).toContain("app.get('/api/students/:studentId/subjects/full'");
    expect(server).toContain("app.put('/api/students/:studentId/papers/batch'");
    expect(server).toContain("req.user?.role === 'parent'");
    expect(server).toContain("if (req.user?.role !== 'parent' && latestVersion?.updatedAt)");
    expect(server).toContain("res.setHeader('X-Papers-Updated-At'");
    expect(server).toContain('softDeletePatch(req)');
    expect(server).toContain('executeAtomicBatch((transaction)');
    expect(server).not.toContain('db.batch([deleteQuery');
    expect(server).toContain("app.get('/api/progress/list'");
    expect(server).toContain("app.post('/api/ai/weekly-summary'");
  });
});
