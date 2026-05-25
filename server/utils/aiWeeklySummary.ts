// AI weekly-summary helpers (Part 5).
//
// What this module does:
//   * Aggregates the input the AI needs (attendance counts, English stats,
//     loss-point histograms) so the prompt can reference concrete numbers
//     instead of ad-libbing.
//   * Defines an enhanced system prompt that forbids generic advice and
//     demands the structured JSON output the spec requires.
//   * Parses the AI's response into that structured shape with graceful
//     fallback when the model returns markdown-fenced or partial JSON.
//
// Backward compatibility: callers still get a top-level `summary` string;
// new fields (strengths[], areasToImprove[], …) are siblings, so existing
// frontend code reading `data.summary` keeps working.

import { z } from 'zod';
import {
  extractEnglishStats,
  normalizeEnglishFields,
  type EnglishDailyStats,
} from './englishNormalize';

// ============================================================================
// Aggregators
// ============================================================================

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isEnglishActivity = (a: Record<string, unknown>): boolean => {
  if (a.type === 'english') return true;
  if (isPlainObject(a.english)) return true;
  const subjectName = String(a.subjectName ?? a.subject ?? '').toLowerCase();
  return subjectName === 'english' || subjectName.includes('英文') || subjectName.includes('英语');
};

export type AttendanceRollup = {
  totalDays: number;
  present: number;
  late: number;
  absent: number;
};

const ZERO_ATTENDANCE: AttendanceRollup = { totalDays: 0, present: 0, late: 0, absent: 0 };

/** Roll up attendance status across an array of daily_progress rows. */
export function aggregateAttendance(
  rows: Array<{ attendance?: string | null }>,
): AttendanceRollup {
  const out = { ...ZERO_ATTENDANCE };
  for (const r of rows) {
    if (!r) continue;
    out.totalDays += 1;
    const a = String(r.attendance ?? '').toLowerCase();
    if (a === 'present') out.present += 1;
    else if (a === 'late') out.late += 1;
    else if (a === 'absent') out.absent += 1;
  }
  return out;
}

/**
 * Sum English stats across multiple daily_progress rows. Each row's
 * `activities` is normalized internally so legacy/string data still rolls up.
 */
export function aggregateEnglishStats(
  rows: Array<{ activities?: unknown }>,
): EnglishDailyStats {
  const out: EnglishDailyStats = {
    readingArticleCount: 0,
    editingExerciseCount: 0,
    grammarExerciseCount: 0,
    vocabSentenceCount: 0,
    compositionCompletedCount: 0,
  };
  for (const r of rows) {
    if (!r) continue;
    const day = extractEnglishStats(r.activities);
    out.readingArticleCount += day.readingArticleCount;
    out.editingExerciseCount += day.editingExerciseCount;
    out.grammarExerciseCount += day.grammarExerciseCount;
    out.vocabSentenceCount += day.vocabSentenceCount;
    out.compositionCompletedCount += day.compositionCompletedCount;
  }
  return out;
}

export type LossPointRollupEntry = {
  id: string;
  label: string;     // resolved from catalog when possible, snapshot otherwise
  field: 'editing' | 'reading' | 'grammar' | 'essay';
  count: number;
};

const SCORED_FIELDS = ['editing', 'reading', 'grammar', 'essay'] as const;

/**
 * Build a histogram of loss-point ids referenced across the week's English
 * activities. Output is sorted by count desc so the AI sees the most
 * impactful weaknesses first.
 *
 * `catalogLookup` is optional; when provided, ids resolve to current labels.
 * Otherwise we fall back to whatever was snapshotted on the row, then to id.
 */
export function aggregateLossPoints(
  rows: Array<{ activities?: unknown }>,
  catalogLookup?: Map<string, string>,
): {
  totalLossPointHits: number;
  totalScoredFieldsWithoutLossPoints: number;
  byEntry: LossPointRollupEntry[];
  byField: Record<'editing' | 'reading' | 'grammar' | 'essay', { totalHits: number; otherTexts: string[] }>;
} {
  const byEntry = new Map<string, LossPointRollupEntry>();
  const byField: Record<string, { totalHits: number; otherTexts: string[] }> = {
    editing: { totalHits: 0, otherTexts: [] },
    reading: { totalHits: 0, otherTexts: [] },
    grammar: { totalHits: 0, otherTexts: [] },
    essay: { totalHits: 0, otherTexts: [] },
  };
  let totalLossPointHits = 0;
  let totalScoredFieldsWithoutLossPoints = 0;

  for (const row of rows) {
    if (!row || !Array.isArray(row.activities)) continue;
    for (const a of row.activities) {
      if (!isPlainObject(a) || !isEnglishActivity(a)) continue;
      const eng = normalizeEnglishFields(a.english ?? {});
      for (const field of SCORED_FIELDS) {
        const block = eng[field] as {
          score: number | null;
          lossPointIds: string[];
          lossPointLabelsSnapshot: string[];
          otherLossPointText: string;
        };
        const ids = Array.isArray(block.lossPointIds) ? block.lossPointIds : [];
        const snapshots = Array.isArray(block.lossPointLabelsSnapshot)
          ? block.lossPointLabelsSnapshot
          : [];
        ids.forEach((id, i) => {
          const key = `${field}:${id}`;
          const existing = byEntry.get(key);
          const label =
            catalogLookup?.get(id) ?? snapshots[i] ?? id;
          if (existing) existing.count += 1;
          else byEntry.set(key, { id, label, field, count: 1 });
        });
        byField[field].totalHits += ids.length;
        totalLossPointHits += ids.length;
        if (block.otherLossPointText && block.otherLossPointText.trim()) {
          byField[field].otherTexts.push(block.otherLossPointText.trim());
        }
        if (block.score != null && ids.length === 0 && !block.otherLossPointText.trim()) {
          totalScoredFieldsWithoutLossPoints += 1;
        }
      }
    }
  }

  return {
    totalLossPointHits,
    totalScoredFieldsWithoutLossPoints,
    byEntry: [...byEntry.values()].sort((a, b) => b.count - a.count),
    byField: byField as ReturnType<typeof aggregateLossPoints>['byField'],
  };
}

// ============================================================================
// Subject-level + English-attempt weekly breakdown (for stronger narratives)
// ============================================================================

const toDateYmd = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
};

const toSubjectName = (activity: Record<string, unknown>): string => {
  const candidate =
    String(activity.subjectDisplayName ?? '').trim() ||
    String(activity.subjectName ?? '').trim() ||
    String(activity.subject ?? '').trim();
  return candidate || '未命名科目';
};

const avg = (nums: number[]): number | null => {
  if (!nums.length) return null;
  return Number((nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1));
};

export type WeeklySubjectBreakdownEntry = {
  subjectName: string;
  activityCount: number;
  activeDays: number;
  evidence: string[];
};

export type WeeklyEnglishAttempt = {
  date: string;
  attemptIndex: number;
  accuracy: number | null;
  issues: string;
};

export type WeeklyEnglishSkillBreakdownEntry = {
  skill: 'editing' | 'reading' | 'grammar' | 'essay';
  totalAttempts: number;
  scoredAttempts: number;
  averageAccuracy: number | null;
  attempts: WeeklyEnglishAttempt[];
};

export type WeeklyEnglishBreakdown = {
  editing: WeeklyEnglishSkillBreakdownEntry;
  reading: WeeklyEnglishSkillBreakdownEntry;
  grammar: WeeklyEnglishSkillBreakdownEntry;
  essay: WeeklyEnglishSkillBreakdownEntry;
  vocabularyWordCount: number;
  vocabularySentenceCount: number;
};

export type WeeklyPaperBreakdownEntry = {
  subjectName: string;
  paperCount: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  latestPercentage: number | null;
  evidence: string[];
};

export type WeeklyPaperBreakdown = {
  totalPapers: number;
  subjectPapers: WeeklyPaperBreakdownEntry[];
};

export type WeeklyExamBreakdownEntry = {
  subjectName: string;
  examCount: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  latestPercentage: number | null;
  evidence: string[];
};

export type WeeklyExamBreakdown = {
  totalExams: number;
  subjectExams: WeeklyExamBreakdownEntry[];
};

export function aggregateWeeklySubjectAndEnglishBreakdown(
  rows: Array<{ date?: unknown; attendance?: unknown; activities?: unknown }>,
): {
  subjectBreakdown: WeeklySubjectBreakdownEntry[];
  englishBreakdown: WeeklyEnglishBreakdown;
} {
  const subjectMap = new Map<
    string,
    {
      subjectName: string;
      activityCount: number;
      days: Set<string>;
      evidence: string[];
    }
  >();

  const buildSkill = (skill: 'editing' | 'reading' | 'grammar' | 'essay'): WeeklyEnglishSkillBreakdownEntry => ({
    skill,
    totalAttempts: 0,
    scoredAttempts: 0,
    averageAccuracy: null,
    attempts: [],
  });

  const englishBreakdown: WeeklyEnglishBreakdown = {
    editing: buildSkill('editing'),
    reading: buildSkill('reading'),
    grammar: buildSkill('grammar'),
    essay: buildSkill('essay'),
    vocabularyWordCount: 0,
    vocabularySentenceCount: 0,
  };

  const scoreBuffer: Record<'editing' | 'reading' | 'grammar' | 'essay', number[]> = {
    editing: [],
    reading: [],
    grammar: [],
    essay: [],
  };

  for (const row of rows) {
    const date = toDateYmd(row?.date);
    const attendance = String(row?.attendance ?? '').trim().toLowerCase();
    const isAbsent = attendance === 'absent' || attendance.includes('缺席');
    if (isAbsent) continue;
    if (!Array.isArray(row?.activities)) continue;

    for (const item of row.activities) {
      if (!isPlainObject(item)) continue;
      const subjectName = toSubjectName(item);
      const existing = subjectMap.get(subjectName) || {
        subjectName,
        activityCount: 0,
        days: new Set<string>(),
        evidence: [],
      };
      existing.activityCount += 1;
      if (date) existing.days.add(date);
      const taskSummary =
        String(item.taskSummary ?? '').trim() ||
        String(item.practiceProgress ?? '').trim() ||
        String(item.description ?? '').trim();
      if (taskSummary && existing.evidence.length < 3) {
        existing.evidence.push(taskSummary.slice(0, 80));
      }
      subjectMap.set(subjectName, existing);

      if (!isEnglishActivity(item)) continue;
      const eng = normalizeEnglishFields(item.english ?? {});
      englishBreakdown.vocabularyWordCount += Number(eng.vocab.vocabularyWordCount || 0);
      englishBreakdown.vocabularySentenceCount += Number(eng.vocab.vocabularySentenceCount || 0);

      const pushAttempt = (
        skill: 'editing' | 'reading' | 'grammar',
        accuracy: number | null,
        issues: string,
        attemptIndex: number,
      ) => {
        const target = englishBreakdown[skill];
        target.totalAttempts += 1;
        if (typeof accuracy === 'number') {
          target.scoredAttempts += 1;
          scoreBuffer[skill].push(accuracy);
        }
        if (target.attempts.length < 50) {
          target.attempts.push({
            date: date || '',
            attemptIndex,
            accuracy: typeof accuracy === 'number' ? accuracy : null,
            issues: (issues || '').slice(0, 120),
          });
        }
      };

      (
        [
          ['editing', eng.editing] as const,
          ['reading', eng.reading] as const,
          ['grammar', eng.grammar] as const,
        ] as const
      ).forEach(([skill, block]) => {
        const exercises = Array.isArray(block.exercises) ? block.exercises : [];
        const ids = Array.isArray(block.lossPointLabelsSnapshot) ? block.lossPointLabelsSnapshot : [];
        const commonIssue = String(block.otherLossPointText || '').trim();
        if (exercises.length) {
          exercises.forEach((ex, idx) => {
            const score = typeof ex?.score === 'number' ? ex.score : null;
            const issue = String(ex?.problems || '').trim() || ids.join('、') || commonIssue || '无';
            pushAttempt(skill, score, issue, idx + 1);
          });
        } else if (typeof block.score === 'number') {
          const issue = ids.join('、') || commonIssue || '无';
          pushAttempt(skill, block.score, issue, 1);
        }
      });

      if (eng.essay.completed || typeof eng.essay.score === 'number' || String(eng.essay.text || '').trim()) {
        const target = englishBreakdown.essay;
        target.totalAttempts += 1;
        const score = typeof eng.essay.score === 'number' ? eng.essay.score : null;
        if (typeof score === 'number') {
          target.scoredAttempts += 1;
          scoreBuffer.essay.push(score);
        }
        const issue =
          (Array.isArray(eng.essay.lossPointLabelsSnapshot) ? eng.essay.lossPointLabelsSnapshot.join('、') : '') ||
          String(eng.essay.otherLossPointText || '').trim() ||
          '无';
        if (target.attempts.length < 50) {
          target.attempts.push({
            date: date || '',
            attemptIndex: target.totalAttempts,
            accuracy: score,
            issues: issue.slice(0, 120),
          });
        }
      }

      const customTasks = Array.isArray((item as Record<string, unknown>).customEnglishTasks)
        ? ((item as Record<string, unknown>).customEnglishTasks as unknown[])
        : Array.isArray((item as Record<string, unknown>).englishTasks)
          ? ((item as Record<string, unknown>).englishTasks as unknown[])
          : [];
      for (const rawTask of customTasks) {
        if (!isPlainObject(rawTask)) continue;
        const displayName = String(
          rawTask.displayName ?? rawTask.chineseName ?? rawTask.englishName ?? rawTask.key ?? '自定义项目',
        ).trim();
        const fieldsUsed = Array.isArray(rawTask.fieldsUsed) ? rawTask.fieldsUsed : [];
        const practiceCount = toOptionalNumber(rawTask.practiceCount) ?? 0;
        const taskScore = toOptionalNumber(rawTask.score);
        const taskMax = toOptionalNumber(rawTask.maxScore);
        const taskPct = toPercentage(taskScore, taskMax);
        const taskCompleted = rawTask.completed === true;
        const taskProblems = String(rawTask.problems || '').trim();

        const lowerName = displayName.toLowerCase();
        const targetSkill = lowerName.includes('editing') || displayName.includes('改错')
          ? 'editing'
          : lowerName.includes('reading') || displayName.includes('阅读')
            ? 'reading'
            : lowerName.includes('grammar') || displayName.includes('语法')
              ? 'grammar'
              : lowerName.includes('essay') || lowerName.includes('composition') || displayName.includes('作文')
                ? 'essay'
                : 'essay';

        const target = englishBreakdown[targetSkill];
        const delta = practiceCount > 0 ? Math.floor(practiceCount) : taskCompleted ? 1 : 0;
        target.totalAttempts += delta;
        if (taskPct != null) {
          target.scoredAttempts += 1;
          scoreBuffer[targetSkill].push(taskPct);
        }
        if (target.attempts.length < 50) {
          target.attempts.push({
            date: date || '',
            attemptIndex: target.attempts.length + 1,
            accuracy: taskPct,
            issues: (taskProblems || displayName || '无').slice(0, 120),
          });
        }

        if (displayName.includes('词汇') || lowerName.includes('vocab')) {
          englishBreakdown.vocabularyWordCount += practiceCount > 0 ? Math.floor(practiceCount) : 0;
        }
        if (displayName.includes('句') || lowerName.includes('sentence')) {
          englishBreakdown.vocabularySentenceCount += practiceCount > 0 ? Math.floor(practiceCount) : 0;
        }
        if (!fieldsUsed.length && delta === 0 && taskProblems) {
          target.totalAttempts += 1;
        }
      }
    }
  }

  (['editing', 'reading', 'grammar', 'essay'] as const).forEach((skill) => {
    englishBreakdown[skill].averageAccuracy = avg(scoreBuffer[skill]);
  });

  const subjectBreakdown = [...subjectMap.values()]
    .map((item) => ({
      subjectName: item.subjectName,
      activityCount: item.activityCount,
      activeDays: item.days.size,
      evidence: item.evidence,
    }))
    .sort((a, b) => b.activityCount - a.activityCount);

  return { subjectBreakdown, englishBreakdown };
}

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toPercentage = (score: number | null, total: number | null): number | null => {
  if (score == null) return null;
  if (total != null && total > 0) return Number(((score / total) * 100).toFixed(1));
  if (score >= 0 && score <= 100) return Number(score.toFixed(1));
  return null;
};

/**
 * Build weekly paper/test performance grouped by subject so the AI can cite
 * concrete evidence for each subject paragraph.
 */
export function aggregateWeeklyPaperBreakdown(
  rows: Array<{
    date?: unknown;
    subjectName?: unknown;
    description?: unknown;
    score?: unknown;
    total?: unknown;
    typeName?: unknown;
    schoolName?: unknown;
    strengths?: unknown;
    improvements?: unknown;
  }>,
): WeeklyPaperBreakdown {
  const subjectMap = new Map<
    string,
    {
      subjectName: string;
      paperCount: number;
      percentages: number[];
      latestDate: string;
      latestPercentage: number | null;
      evidence: string[];
    }
  >();

  for (const row of rows) {
    const subjectName = String(row?.subjectName ?? '').trim() || '未命名科目';
    const date = toDateYmd(row?.date);
    const score = toOptionalNumber(row?.score);
    const total = toOptionalNumber(row?.total);
    const percentage = toPercentage(score, total);
    const existing = subjectMap.get(subjectName) || {
      subjectName,
      paperCount: 0,
      percentages: [],
      latestDate: '',
      latestPercentage: null,
      evidence: [],
    };
    existing.paperCount += 1;
    if (percentage != null) existing.percentages.push(percentage);
    if (date && date >= existing.latestDate) {
      existing.latestDate = date;
      existing.latestPercentage = percentage;
    }
    if (existing.evidence.length < 3) {
      const desc = String(row?.description ?? '').trim() || String(row?.typeName ?? '').trim() || '试卷';
      const scoreText =
        score == null
          ? '无分数'
          : total != null && total > 0
            ? `${score}/${total}`
            : `${score}`;
      const school = String(row?.schoolName ?? '').trim();
      existing.evidence.push([date || '未知日期', desc, school, scoreText].filter(Boolean).join(' · '));
    }
    subjectMap.set(subjectName, existing);
  }

  const subjectPapers = [...subjectMap.values()]
    .map((entry) => {
      const averagePercentage = entry.percentages.length
        ? Number((entry.percentages.reduce((s, n) => s + n, 0) / entry.percentages.length).toFixed(1))
        : null;
      const highestPercentage = entry.percentages.length
        ? Number(Math.max(...entry.percentages).toFixed(1))
        : null;
      return {
        subjectName: entry.subjectName,
        paperCount: entry.paperCount,
        averagePercentage,
        highestPercentage,
        latestPercentage: entry.latestPercentage,
        evidence: entry.evidence,
      };
    })
    .sort((a, b) => b.paperCount - a.paperCount);

  return {
    totalPapers: rows.length,
    subjectPapers,
  };
}

/**
 * Build weekly exam performance grouped by subject.
 */
export function aggregateWeeklyExamBreakdown(
  rows: Array<{
    examDate?: unknown;
    name?: unknown;
    subjects?: unknown;
  }>,
): WeeklyExamBreakdown {
  const subjectMap = new Map<
    string,
    {
      subjectName: string;
      examCount: number;
      percentages: number[];
      latestDate: string;
      latestPercentage: number | null;
      evidence: string[];
    }
  >();

  for (const row of rows) {
    const date = toDateYmd(row?.examDate);
    const examName = String(row?.name || '').trim() || '考试';
    const subjects = Array.isArray(row?.subjects) ? row.subjects : [];
    for (const subjectRow of subjects) {
      if (!isPlainObject(subjectRow)) continue;
      const subjectName = String(subjectRow.name || '').trim() || '未命名科目';
      const parsedScore = toOptionalNumber(subjectRow.score);
      const parsedTotal = toOptionalNumber(subjectRow.maxScore ?? subjectRow.total ?? subjectRow.totalScore);
      const pct = toPercentage(parsedScore, parsedTotal);
      const existing = subjectMap.get(subjectName) || {
        subjectName,
        examCount: 0,
        percentages: [],
        latestDate: '',
        latestPercentage: null,
        evidence: [],
      };
      existing.examCount += 1;
      if (pct != null) existing.percentages.push(pct);
      if (date && date >= existing.latestDate) {
        existing.latestDate = date;
        existing.latestPercentage = pct;
      }
      if (existing.evidence.length < 3) {
        const scoreText =
          parsedScore == null
            ? '无分数'
            : parsedTotal != null && parsedTotal > 0
              ? `${parsedScore}/${parsedTotal}`
              : `${parsedScore}`;
        existing.evidence.push([date || '未知日期', examName, scoreText].filter(Boolean).join(' · '));
      }
      subjectMap.set(subjectName, existing);
    }
  }

  const subjectExams = [...subjectMap.values()]
    .map((entry) => {
      const averagePercentage = entry.percentages.length
        ? Number((entry.percentages.reduce((sum, value) => sum + value, 0) / entry.percentages.length).toFixed(1))
        : null;
      const highestPercentage = entry.percentages.length
        ? Number(Math.max(...entry.percentages).toFixed(1))
        : null;
      return {
        subjectName: entry.subjectName,
        examCount: entry.examCount,
        averagePercentage,
        highestPercentage,
        latestPercentage: entry.latestPercentage,
        evidence: entry.evidence,
      };
    })
    .sort((a, b) => b.examCount - a.examCount);

  return {
    totalExams: rows.length,
    subjectExams,
  };
}

type WeeklyContextInput = {
  student: unknown;
  weekStarting: string;
  weekEnding: string;
  recordWeekEnding: string;
  attendance: unknown;
  englishStats: unknown;
  subjectBreakdown: unknown;
  englishBreakdown: unknown;
  weeklyPaperBreakdown: unknown;
  weeklyExamBreakdown: unknown;
  lossPoints: unknown;
  dailyProgress: unknown[];
  papers: unknown[];
  exams?: unknown[];
  weeklyFeedback?: unknown[];
  subjectProgress: unknown;
};

const clip = (value: unknown, maxLen: number) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
};

export function buildCompactWeeklySummaryContext(input: WeeklyContextInput) {
  const dailyRows = Array.isArray(input.dailyProgress) ? input.dailyProgress : [];
  const paperRows = Array.isArray(input.papers) ? input.papers : [];
  const examRows = Array.isArray(input.exams) ? input.exams : [];
  const weeklyRows = Array.isArray(input.weeklyFeedback) ? input.weeklyFeedback : [];
  const dailyLimited = dailyRows.slice(-14).map((row) => {
    const obj = isPlainObject(row) ? row : {};
    const activities = Array.isArray(obj.activities) ? obj.activities : [];
    const attendance = obj.attendance ?? null;
    const attendanceText = String(attendance ?? '').trim().toLowerCase();
    const absentDay = attendanceText === 'absent' || attendanceText.includes('缺席');
    return {
      date: obj.date ?? null,
      attendance,
      attendanceStart: obj.attendanceStart ?? null,
      attendanceEnd: obj.attendanceEnd ?? null,
      absentDay,
      absenceReason:
        obj.absenceReason ??
        obj.absentReason ??
        obj.leaveReason ??
        obj.reason ??
        null,
      summary: clip(obj.summary, 200) || null,
      activities: absentDay ? [] : activities.slice(0, 12).map((raw) => {
        const a = isPlainObject(raw) ? raw : {};
        const english = normalizeEnglishFields(a.english ?? {});
        const customEnglishTasksRaw = Array.isArray(a.customEnglishTasks)
          ? a.customEnglishTasks
          : Array.isArray(a.englishTasks)
            ? a.englishTasks
            : [];
        const customEnglishTasks = customEnglishTasksRaw
          .filter((task) => isPlainObject(task))
          .slice(0, 8)
          .map((task) => ({
            key: task.key ?? null,
            displayName: task.displayName ?? task.chineseName ?? task.englishName ?? task.key ?? null,
            practiceCount: task.practiceCount ?? 0,
            score: task.score ?? null,
            maxScore: task.maxScore ?? null,
            completed: task.completed === true,
            problems: clip(task.problems, 80) || null,
          }));
        return {
          subjectName: a.subjectDisplayName || a.subjectName || a.subject || null,
          taskSummary: clip(a.taskSummary || a.practiceProgress || a.description, 120) || null,
          strengths: clip(a.strengths, 120) || null,
          improvements: clip(a.improvements, 120) || null,
          english:
            isEnglishActivity(a)
              ? {
                  editing: {
                    score: typeof english.editing.score === 'number' ? english.editing.score : null,
                    exerciseCount: Number(english.editing.exerciseCount || 0),
                  },
                  reading: {
                    score: typeof english.reading.score === 'number' ? english.reading.score : null,
                    articleCount: Number(english.reading.articleCount || 0),
                  },
                  grammar: {
                    score: typeof english.grammar.score === 'number' ? english.grammar.score : null,
                    exerciseCount: Number(english.grammar.exerciseCount || 0),
                  },
                  vocab: {
                    vocabularyWordCount: Number(english.vocab.vocabularyWordCount || 0),
                    vocabularySentenceCount: Number(english.vocab.vocabularySentenceCount || 0),
                  },
                }
              : undefined,
          customEnglishTasks,
        };
      }),
    };
  });

  const papersLimited = paperRows.slice(-30).map((row) => {
    const p = isPlainObject(row) ? row : {};
    return {
      date: p.date ?? null,
      subjectName: p.subjectName ?? null,
      description: clip(p.description, 120) || null,
      score: p.score ?? null,
      total: p.total ?? null,
      strengths: clip(p.strengths, 120) || null,
      improvements: clip(p.improvements, 120) || null,
    };
  });

  const examsLimited = examRows.slice(-20).map((row) => {
    const exam = isPlainObject(row) ? row : {};
    const subjects = Array.isArray(exam.subjects) ? exam.subjects : [];
    return {
      name: exam.name ?? null,
      examDate: exam.examDate ?? null,
      subjects: subjects.slice(0, 12).map((raw) => {
        const s = isPlainObject(raw) ? raw : {};
        return {
          name: s.name ?? null,
          score: s.score ?? null,
          maxScore: s.maxScore ?? s.total ?? s.totalScore ?? null,
          scope: clip(s.scope, 80) || null,
        };
      }),
    };
  });

  const weeklyFeedback = weeklyRows.slice(-3).map((row) => {
    const item = isPlainObject(row) ? row : {};
    return {
      weekStarting: item.weekStarting ?? null,
      weekEnding: item.weekEnding ?? null,
      summary: clip(item.summary, 200) || null,
      strengths: Array.isArray(item.strengths) ? item.strengths.slice(0, 5).map((v) => clip(v, 80)).filter(Boolean) : [],
      areasToImprove: Array.isArray(item.areasToImprove) ? item.areasToImprove.slice(0, 5).map((v) => clip(v, 80)).filter(Boolean) : [],
      teacherNotes: clip(item.teacherNotes, 120) || null,
      nextWeekFocus: clip(item.nextWeekFocus, 120) || null,
    };
  });

  const subjectBreakdown = Array.isArray(input.subjectBreakdown)
    ? input.subjectBreakdown.slice(0, 20)
    : [];
  const subjectProgress = Array.isArray(input.subjectProgress)
    ? input.subjectProgress.slice(0, 24)
    : input.subjectProgress;
  const lossPointsObj = isPlainObject(input.lossPoints) ? input.lossPoints : {};
  const compactLossPoints = {
    ...lossPointsObj,
    byEntry: Array.isArray(lossPointsObj.byEntry) ? lossPointsObj.byEntry.slice(0, 20) : [],
  };

  return {
    student: input.student,
    weekStarting: input.weekStarting,
    weekEnding: input.weekEnding,
    recordWeekEnding: input.recordWeekEnding,
    attendance: input.attendance,
    englishStats: input.englishStats,
    subjectBreakdown,
    englishBreakdown: input.englishBreakdown,
    weeklyPaperBreakdown: input.weeklyPaperBreakdown,
    weeklyExamBreakdown: input.weeklyExamBreakdown,
    lossPoints: compactLossPoints,
    dailyProgress: dailyLimited,
    papers: papersLimited,
    exams: examsLimited,
    weeklyFeedback,
    subjectProgress,
    contextMeta: {
      dailyRowsOriginal: dailyRows.length,
      dailyRowsUsed: dailyLimited.length,
      papersOriginal: paperRows.length,
      papersUsed: papersLimited.length,
      examsOriginal: examRows.length,
      examsUsed: examsLimited.length,
      weeklyFeedbackRowsOriginal: weeklyRows.length,
      weeklyFeedbackRowsUsed: weeklyFeedback.length,
    },
  };
}

// ============================================================================
// Prompt
// ============================================================================

/**
 * Default enhanced weekly-summary prompt (Part 5). Used when the
 * DEEPSEEK_WEEKLY_PROMPT env var is empty, and intentionally exhaustive about
 * the output schema and the no-generic-advice rule. Operators can still
 * override via env if they want different phrasing.
 */
export const ENHANCED_WEEKLY_PROMPT = `You are an experienced secondary-school teacher writing the weekly progress report for ONE student. The user message contains a JSON object with: student profile, attendance rollup, English statistics, loss-point histogram, daily_progress entries, paper scores, subject/topic progress.

OUTPUT RULES (HARD):
1. Respond with a SINGLE valid JSON object — no prose, no markdown fences, no commentary outside the object.
2. The object MUST contain exactly these keys, all strings or string arrays:
   - "summary": string, 2–4 sentences, narrative prose covering the student's week.
   - "strengths": string[], at most 5 items.
   - "areasToImprove": string[], at most 5 items.
   - "lossPointAnalysis": string[], at most 6 items, each one referencing a SPECIFIC loss-point label from the input data with the count and which sub-skill it appeared in.
   - "improvementDirections": string[], at most 5 items, each one a concrete instructional direction tied to a specific loss-point, topic, or paper from the input.
   - "teacherActionsTaken": string[], at most 5 items, recapping what the teacher already did this week (drawn from comments / daily descriptions / paper feedback in the input).
   - "nextWeekFocus": string[], at most 5 items, each one citing a specific concrete action with a target metric (e.g. "本周完成 5 篇阅读理解练习，重点关注 主旨理解错误").
3. ALL arrays MUST be present — use [] when there's nothing meaningful to say. Never omit a key.
4. Every recommendation MUST cite at least one of: a loss-point label, a topic name, a paper name, an attendance number, an English stat, or a daily comment. Do NOT use generic phrases like "继续努力" / "加强练习" / "保持良好习惯". If a recommendation cannot cite specific data, drop it.
5. Use the same primary language as the input data (Chinese if Chinese predominates, English otherwise). Do not mix unnecessarily.
6. Numbers in your output must be consistent with numbers in the input. Do not invent statistics.
7. "summary" MUST be structured with clear subject paragraphs. Use this order:
   - first paragraph: 本周总体表现（2-3句）
   - then one paragraph per subject appearing in "subjectBreakdown", each paragraph starts with "【科目名】"
   - final paragraph: 下周重点
   - if a subject appears in weeklyPaperBreakdown.subjectPapers with paperCount > 0, the same subject paragraph MUST mention paper/test performance (paperCount + score evidence).
8. For English subject paragraph, you MUST explicitly describe each sub-skill:
   - editing / reading / grammar / essay
   For each sub-skill, include:
   - this week's total attempts
   - per-attempt accuracy (list briefly from attempts data, e.g. 第1次 78%，第2次 82%)
   - per-attempt major issues (from problems / loss-point labels)
   If data is missing, write "本周该分项无有效记录".
9. For vocabulary/sentences, cite counts from englishBreakdown:
   - vocabularyWordCount, vocabularySentenceCount.
   If a count is 0 or missing, state data is insufficient; do not invent.
10. You MUST use weeklyPaperBreakdown as the source of truth for paper/test statements. Do not invent paper names or scores.
11. If dailyProgress activities include customEnglishTasks, summarize their concrete completion/score status as part of English learning.
12. If weeklyExamBreakdown has data, include exam performance by subject with concrete scores/percentages from that object.
13. If a day is marked absent, do not describe that day as learning activity.

Now produce the JSON.`;

// Even when operators provide DEEPSEEK_WEEKLY_PROMPT in env, we append this
// hard constraint block to keep output consistent with product expectations.
export const WEEKLY_PROMPT_HARD_APPEND = `

ADDITIONAL NON-NEGOTIABLE CONSTRAINTS:
- Every subject in subjectBreakdown must have one dedicated paragraph in summary.
- English paragraph must include editing/reading/grammar/essay attempt counts, per-attempt accuracy, and per-attempt issues.
- For subjects with paperCount > 0 in weeklyPaperBreakdown, include at least one concrete paper/test score statement.
- For subjects with examCount > 0 in weeklyExamBreakdown, include at least one concrete exam score statement.
- If customEnglishTasks exist, include them in English summary coverage.
- Days marked absent must not be narrated as completed study tasks.
- Do not summarize English as one generic sentence.
- If any required field lacks data, explicitly state "本周无有效记录/数据不足以判断", never fabricate.
`;

// ============================================================================
// Output schema + parser
// ============================================================================

export const WeeklySummaryOutputSchema = z.object({
  summary: z.string().default(''),
  strengths: z.array(z.string()).default([]),
  areasToImprove: z.array(z.string()).default([]),
  lossPointAnalysis: z.array(z.string()).default([]),
  improvementDirections: z.array(z.string()).default([]),
  teacherActionsTaken: z.array(z.string()).default([]),
  nextWeekFocus: z.array(z.string()).default([]),
});

export type WeeklySummaryOutput = z.infer<typeof WeeklySummaryOutputSchema>;

const EMPTY_OUTPUT: WeeklySummaryOutput = {
  summary: '',
  strengths: [],
  areasToImprove: [],
  lossPointAnalysis: [],
  improvementDirections: [],
  teacherActionsTaken: [],
  nextWeekFocus: [],
};

/** Strip ```json … ``` fences if the model added them. */
const stripCodeFences = (s: string): string => {
  const m = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(s.trim());
  return m ? m[1].trim() : s;
};

/** Find the first balanced {...} substring; null if not found. */
const extractFirstJsonObject = (s: string): string | null => {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
};

/**
 * Robustly parse the AI's response into the structured shape. We accept:
 *   * direct JSON
 *   * JSON wrapped in markdown code fences
 *   * JSON embedded inside prose
 * On total failure, we put the raw text into `summary` and leave arrays empty
 * — that's better than returning nothing to the teacher.
 */
export function parseStructuredSummary(raw: unknown): WeeklySummaryOutput {
  if (typeof raw !== 'string' || !raw.trim()) return { ...EMPTY_OUTPUT };
  const candidates: string[] = [];
  const trimmed = raw.trim();
  candidates.push(trimmed);
  const unfenced = stripCodeFences(trimmed);
  if (unfenced !== trimmed) candidates.push(unfenced);
  const extracted = extractFirstJsonObject(trimmed);
  if (extracted) candidates.push(extracted);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const validated = WeeklySummaryOutputSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    } catch {
      // try next candidate
    }
  }
  return { ...EMPTY_OUTPUT, summary: trimmed };
}
