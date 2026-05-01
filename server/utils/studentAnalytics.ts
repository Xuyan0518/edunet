// Per-student period analytics (Part 7).
//
// Three reporting windows: term / half-year / year. For each, we compute:
//   - attendance (rate + counts)
//   - English stats (sums)
//   - English task completion (per-task ratios + cycles fully completed)
//   - loss-point histogram
//   - exam score trend
// The caller layers in subject-progress separately (existing helper).
//
// We also expose previousPeriod() so endpoints can return a current-vs-previous
// comparison. Pure date math is in this file; DB-touching code lives in the
// async aggregator computeAnalyticsForPeriod().

import { and, eq, gte, lte } from 'drizzle-orm';
import { parseDateString, chinaTodayDateString } from './chinaDate';
import { aggregateAttendance, aggregateEnglishStats, aggregateLossPoints } from './aiWeeklySummary';
import { DEFAULT_TARGETS, defaultCycleForDate, effectiveTargetsFor, evaluateCompletion, pickCoveringCycle, type WeeklyTargets } from './weeklyCycles';
import {
  dailyProgress,
  examsTable,
  examScoresTable,
  studentWeeklyTaskTargetsTable,
  weeklyStudyCyclesTable,
} from '../schema';

const MS_PER_DAY = 86_400_000;

const ymd = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const utc = (s: string): Date => new Date(`${s}T00:00:00Z`);

const shiftDays = (s: string, days: number): string =>
  ymd(new Date(utc(s).getTime() + days * MS_PER_DAY));

/** Inclusive day count for [startDate, endDate]. */
export function periodLengthDays(startDate: string, endDate: string): number {
  return Math.round((utc(endDate).getTime() - utc(startDate).getTime()) / MS_PER_DAY) + 1;
}

/**
 * Previous comparison period: same length, ending the day before `startDate`.
 *   current  = [2026-01-01, 2026-12-31]  (365 days)
 *   previous = [2025-01-01, 2025-12-31]  (same length, immediately prior)
 */
export function previousPeriod(period: { startDate: string; endDate: string }): {
  startDate: string;
  endDate: string;
} {
  const lengthDays = periodLengthDays(period.startDate, period.endDate);
  const prevEnd = shiftDays(period.startDate, -1);
  const prevStart = shiftDays(prevEnd, -(lengthDays - 1));
  return { startDate: prevStart, endDate: prevEnd };
}

/** Default year period [YYYY-01-01, YYYY-12-31] anchored to Asia/Shanghai today. */
export function defaultYearPeriod(today: string = chinaTodayDateString()): {
  startDate: string;
  endDate: string;
} {
  const t = parseDateString(today) ?? today;
  const y = t.slice(0, 4);
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
}

/**
 * Default half-year period: H1 = Jan 1 → Jun 30, H2 = Jul 1 → Dec 31.
 * Choice based on the month of `today` (CST).
 */
export function defaultHalfYearPeriod(today: string = chinaTodayDateString()): {
  startDate: string;
  endDate: string;
  half: 'H1' | 'H2';
} {
  const t = parseDateString(today) ?? today;
  const y = t.slice(0, 4);
  const month = Number(t.slice(5, 7));
  if (month <= 6) {
    return { startDate: `${y}-01-01`, endDate: `${y}-06-30`, half: 'H1' };
  }
  return { startDate: `${y}-07-01`, endDate: `${y}-12-31`, half: 'H2' };
}

/**
 * Enumerate Sun→Thu default cycles fully contained in [startDate, endDate].
 * Cycles whose start is before period.start or end after period.end are skipped.
 * Returns [{ startDate, endDate }] sorted ascending.
 */
export function enumerateDefaultCycles(startDate: string, endDate: string): Array<{
  startDate: string;
  endDate: string;
}> {
  // Find the first Sunday ≥ startDate.
  const start = utc(startDate);
  const startDow = start.getUTCDay(); // 0 = Sun
  const firstSundayShift = (7 - startDow) % 7;
  const firstSunday = new Date(start.getTime() + firstSundayShift * MS_PER_DAY);
  const out: Array<{ startDate: string; endDate: string }> = [];
  for (let cur = firstSunday.getTime(); ; cur += 7 * MS_PER_DAY) {
    const cycleEnd = cur + 4 * MS_PER_DAY;
    if (ymd(new Date(cycleEnd)) > endDate) break;
    out.push({ startDate: ymd(new Date(cur)), endDate: ymd(new Date(cycleEnd)) });
  }
  return out;
}

// ============================================================================
// DB-touching aggregator
// ============================================================================

export type StudentAnalyticsForPeriod = {
  period: { startDate: string; endDate: string };
  attendance: ReturnType<typeof aggregateAttendance> & { presentRate: number };
  englishStats: ReturnType<typeof aggregateEnglishStats>;
  englishTaskCompletion: {
    cyclesCount: number;
    cyclesFullyCompleted: number;
    perTask: {
      reading: { completed: number; target: number; rate: number };
      editing: { completed: number; target: number; rate: number };
      grammar: { completed: number; target: number; rate: number };
      vocab: { completed: number; target: number; rate: number };
      composition: { completed: number; target: number; rate: number };
    };
  };
  lossPoints: ReturnType<typeof aggregateLossPoints>;
  examScoreTrend: Array<{
    id: string;
    name: string;
    examType: string | null;
    examDate: string;
    subjects: Array<{ name: string; score: string; scope: string | null }>;
  }>;
};

const ratio = (numer: number, denom: number): number => {
  if (!denom || !Number.isFinite(denom)) return 0;
  const r = numer / denom;
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(1, r));
};

const dateColToYmd = (v: string | Date | null | undefined): string => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  return ymd(v);
};

/**
 * Aggregate metrics for a single student over [startDate, endDate].
 *
 * Strategy:
 *   - One daily_progress fetch for the period.
 *   - One weekly_study_cycles + student_weekly_task_targets fetch for cycles
 *     overlapping the period (used for target lookups).
 *   - Sun→Thu default cycles enumerate the "expected" weeks; stored cycles
 *     covering a Sunday override the synthetic.
 *   - Loss-point labels resolved via `lossPointLookup` (caller-supplied so we
 *     don't double-load the catalog when computing two periods back-to-back).
 *   - Exam score trend lists exams in [start, end] ordered by date.
 */
export async function computeAnalyticsForPeriod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  studentId: string,
  startDate: string,
  endDate: string,
  options: {
    lossPointLookup?: Map<string, string>;
    normalizeActivities: (activities: unknown) => unknown;
  },
): Promise<StudentAnalyticsForPeriod> {
  // ---- attendance + english stats from daily_progress ----
  const progressRows = await db
    .select()
    .from(dailyProgress)
    .where(
      and(
        eq(dailyProgress.studentId, studentId),
        gte(dailyProgress.date, startDate),
        lte(dailyProgress.date, endDate),
      ),
    )
    .orderBy(dailyProgress.date);

  // Normalize once so downstream aggregators see V2.
  const v2Progress = progressRows.map((r: { activities?: unknown }) => ({
    ...r,
    activities: options.normalizeActivities(r.activities),
  }));

  const attendance = aggregateAttendance(v2Progress);
  const englishStats = aggregateEnglishStats(v2Progress);
  const lossPoints = aggregateLossPoints(v2Progress, options.lossPointLookup);

  // ---- weekly task completion ----
  const cycleRows = await db
    .select({
      id: weeklyStudyCyclesTable.id,
      startDate: weeklyStudyCyclesTable.startDate,
      endDate: weeklyStudyCyclesTable.endDate,
      notes: weeklyStudyCyclesTable.notes,
    })
    .from(weeklyStudyCyclesTable);
  const targetsRows = await db
    .select()
    .from(studentWeeklyTaskTargetsTable)
    .where(eq(studentWeeklyTaskTargetsTable.studentId, studentId));
  const targetsByCycle = new Map<string, WeeklyTargets>(
    targetsRows.map((r: { cycleId: string }) => [r.cycleId, effectiveTargetsFor(r as Partial<WeeklyTargets>)]),
  );

  // Build the list of effective cycles in the period: Sun→Thu enumeration,
  // upgraded to a stored cycle when one covers that Sunday.
  const defaultCycles = enumerateDefaultCycles(startDate, endDate);
  const effectiveCycles = defaultCycles.map((c) => {
    const pick = pickCoveringCycle(cycleRows, c.startDate);
    if (pick) {
      return {
        id: pick.id,
        startDate: pick.startDate,
        endDate: pick.endDate,
      };
    }
    return { id: null as string | null, startDate: c.startDate, endDate: c.endDate };
  });

  // Group progress rows by date for fast cycle-window scans.
  const progressByDate = new Map<string, typeof v2Progress>();
  for (const r of v2Progress) {
    const key = dateColToYmd(r.date as string | Date);
    const list = progressByDate.get(key) ?? [];
    list.push(r);
    progressByDate.set(key, list);
  }

  // Per-cycle stat rollup.
  let cyclesFullyCompleted = 0;
  const perTaskTotals = {
    reading: { completed: 0, target: 0 },
    editing: { completed: 0, target: 0 },
    grammar: { completed: 0, target: 0 },
    vocab: { completed: 0, target: 0 },
    composition: { completed: 0, target: 0 },
  };
  for (const cycle of effectiveCycles) {
    const inCycle: typeof v2Progress = [];
    for (let cur = utc(cycle.startDate).getTime(); cur <= utc(cycle.endDate).getTime(); cur += MS_PER_DAY) {
      const day = ymd(new Date(cur));
      const rows = progressByDate.get(day);
      if (rows) inCycle.push(...rows);
    }
    const stats = aggregateEnglishStats(inCycle);
    const targets = cycle.id ? targetsByCycle.get(cycle.id) ?? { ...DEFAULT_TARGETS } : { ...DEFAULT_TARGETS };
    const completion = evaluateCompletion(targets, stats);
    if (completion.allRequiredMet) cyclesFullyCompleted += 1;
    perTaskTotals.reading.completed += completion.reading.completed;
    perTaskTotals.reading.target += completion.reading.target;
    perTaskTotals.editing.completed += completion.editing.completed;
    perTaskTotals.editing.target += completion.editing.required ? completion.editing.target : 0;
    perTaskTotals.grammar.completed += completion.grammar.completed;
    perTaskTotals.grammar.target += completion.grammar.required ? completion.grammar.target : 0;
    perTaskTotals.vocab.completed += completion.vocab.completed;
    perTaskTotals.vocab.target += completion.vocab.target;
    perTaskTotals.composition.completed += completion.composition.completed;
    perTaskTotals.composition.target += completion.composition.target;
  }

  const englishTaskCompletion = {
    cyclesCount: effectiveCycles.length,
    cyclesFullyCompleted,
    perTask: {
      reading: { ...perTaskTotals.reading, rate: ratio(perTaskTotals.reading.completed, perTaskTotals.reading.target) },
      editing: { ...perTaskTotals.editing, rate: ratio(perTaskTotals.editing.completed, perTaskTotals.editing.target) },
      grammar: { ...perTaskTotals.grammar, rate: ratio(perTaskTotals.grammar.completed, perTaskTotals.grammar.target) },
      vocab: { ...perTaskTotals.vocab, rate: ratio(perTaskTotals.vocab.completed, perTaskTotals.vocab.target) },
      composition: {
        ...perTaskTotals.composition,
        rate: ratio(perTaskTotals.composition.completed, perTaskTotals.composition.target),
      },
    },
  };

  // ---- exam score trend ----
  const examRows = await db
    .select({
      id: examsTable.id,
      name: examsTable.name,
      examType: examsTable.examType,
      examDate: examsTable.examDate,
    })
    .from(examsTable)
    .where(
      and(
        eq(examsTable.studentId, studentId),
        gte(examsTable.examDate, startDate),
        lte(examsTable.examDate, endDate),
      ),
    )
    .orderBy(examsTable.examDate);
  let scoresByExam = new Map<string, Array<{ name: string; score: string; scope: string | null }>>();
  if (examRows.length) {
    const examIds = examRows.map((e: { id: string }) => e.id);
    const scoreRows = await db
      .select()
      .from(examScoresTable);
    // tiny-table filter in code so we don't depend on inArray here
    const interesting = scoreRows.filter((s: { examId: string }) => examIds.includes(s.examId));
    scoresByExam = new Map();
    for (const s of interesting) {
      const list = scoresByExam.get(s.examId) ?? [];
      list.push({ name: s.name, score: s.score, scope: s.scope ?? null });
      scoresByExam.set(s.examId, list);
    }
  }
  const examScoreTrend = examRows.map((e: { id: string; name: string; examType: string | null; examDate: string | Date }) => ({
    id: e.id,
    name: e.name,
    examType: e.examType,
    examDate: dateColToYmd(e.examDate),
    subjects: scoresByExam.get(e.id) ?? [],
  }));

  return {
    period: { startDate, endDate },
    attendance: {
      ...attendance,
      presentRate: ratio(attendance.present + attendance.late, attendance.totalDays),
    },
    englishStats,
    englishTaskCompletion,
    lossPoints,
    examScoreTrend,
  };
}
