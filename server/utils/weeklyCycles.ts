// Weekly study cycle helpers (Part 3).
//
// "Cycle" = a study week. Default is Sunday → Thursday in Asia/Shanghai but
// teachers can override by inserting rows into weekly_study_cycles. When no
// row covers a given date, the server synthesises a default cycle in memory
// — callers receive a cycle object either way.
//
// Targets default to 5/5/5/50/1 (reading/editing/grammar/vocab/composition)
// with both editing and grammar required. Per (student, cycle) overrides
// live in student_weekly_task_targets; a missing row falls back to defaults.

import { parseDateString } from './chinaDate';
import type { EnglishDailyStats } from './englishNormalize';

export type CycleWindow = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
};

export type ResolvedCycle = CycleWindow & {
  id: string | null;       // null = synthesised default, no DB row
  notes: string | null;
};

export type WeeklyTargets = {
  readingTarget: number;
  editingTarget: number;
  grammarTarget: number;
  vocabTarget: number;
  compositionTarget: number;
  isGrammarRequired: boolean;
  isEditingRequired: boolean;
};

export const DEFAULT_TARGETS: WeeklyTargets = Object.freeze({
  readingTarget: 5,
  editingTarget: 5,
  grammarTarget: 5,
  vocabTarget: 50,
  compositionTarget: 1,
  isGrammarRequired: true,
  isEditingRequired: true,
});

const MS_PER_DAY = 86_400_000;

const formatYmd = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Default Sunday → Thursday cycle covering `dateStr`. Date arithmetic uses UTC
 * so it doesn't shift around the runtime's local TZ — `dateStr` is already in
 * Asia/Shanghai per the chinaDate helper.
 *
 * Mapping: take the most recent Sunday (date.getUTCDay()===0) on or before
 * `dateStr`. The cycle is [that Sunday, Sunday+4 days = Thursday]. So Friday
 * and Saturday map to the *just-completed* cycle, which is what teachers want
 * when they review on Friday morning.
 */
export function defaultCycleForDate(dateStr: string): CycleWindow {
  const parsed = parseDateString(dateStr);
  if (!parsed) {
    throw new Error(`Invalid date for cycle calculation: ${dateStr}`);
  }
  const anchor = new Date(`${parsed}T00:00:00Z`);
  const dow = anchor.getUTCDay(); // 0 = Sunday
  const start = new Date(anchor.getTime() - dow * MS_PER_DAY);
  const end = new Date(start.getTime() + 4 * MS_PER_DAY);
  return { startDate: formatYmd(start), endDate: formatYmd(end) };
}

type StoredCycleRow = {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  notes: string | null;
};

const dateColToYmd = (v: string | Date): string => {
  if (typeof v === 'string') return v.slice(0, 10);
  return formatYmd(v);
};

/**
 * Pick the cycle covering `dateStr` from a list of stored cycles. Returns the
 * stored row converted to ResolvedCycle, or null if none covers the date.
 *
 * If multiple rows happen to cover the same date (overlapping cycles), the one
 * starting closest to `dateStr` wins — most recent intent.
 */
export function pickCoveringCycle(
  rows: StoredCycleRow[],
  dateStr: string,
): ResolvedCycle | null {
  const candidates = rows
    .map((r) => ({
      id: r.id,
      startDate: dateColToYmd(r.startDate),
      endDate: dateColToYmd(r.endDate),
      notes: r.notes ?? null,
    }))
    .filter((r) => r.startDate <= dateStr && dateStr <= r.endDate);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
  return candidates[0];
}

/** Synthesised cycle for use when no row covers the date. */
export function syntheticCycleFor(dateStr: string): ResolvedCycle {
  const w = defaultCycleForDate(dateStr);
  return { ...w, id: null, notes: null };
}

type StoredTargetsRow = Partial<WeeklyTargets> | null | undefined;

/**
 * Merge a stored targets row over the hardcoded defaults. Null/undefined →
 * pure defaults. Partial rows fill in missing fields from defaults.
 */
export function effectiveTargetsFor(stored: StoredTargetsRow): WeeklyTargets {
  if (!stored) return { ...DEFAULT_TARGETS };
  return {
    readingTarget:
      typeof stored.readingTarget === 'number' ? stored.readingTarget : DEFAULT_TARGETS.readingTarget,
    editingTarget:
      typeof stored.editingTarget === 'number' ? stored.editingTarget : DEFAULT_TARGETS.editingTarget,
    grammarTarget:
      typeof stored.grammarTarget === 'number' ? stored.grammarTarget : DEFAULT_TARGETS.grammarTarget,
    vocabTarget:
      typeof stored.vocabTarget === 'number' ? stored.vocabTarget : DEFAULT_TARGETS.vocabTarget,
    compositionTarget:
      typeof stored.compositionTarget === 'number'
        ? stored.compositionTarget
        : DEFAULT_TARGETS.compositionTarget,
    isGrammarRequired:
      typeof stored.isGrammarRequired === 'boolean'
        ? stored.isGrammarRequired
        : DEFAULT_TARGETS.isGrammarRequired,
    isEditingRequired:
      typeof stored.isEditingRequired === 'boolean'
        ? stored.isEditingRequired
        : DEFAULT_TARGETS.isEditingRequired,
  };
}

export type TaskCompletion = {
  reading: { completed: number; target: number; met: boolean };
  editing: { completed: number; target: number; met: boolean; required: boolean };
  grammar: { completed: number; target: number; met: boolean; required: boolean };
  vocab: { completed: number; target: number; met: boolean };
  composition: { completed: number; target: number; met: boolean };
  /**
   * True iff every required task is complete. Editing/grammar contribute only
   * if their `required` flag is true (so isGrammarRequired=false silently
   * excludes grammar from the gating logic, per spec).
   */
  allRequiredMet: boolean;
};

/**
 * Compute completion against targets given the summed English stats for a
 * cycle. `stats` is typically `extractEnglishStats(allActivitiesInCycle)`.
 */
export function evaluateCompletion(
  targets: WeeklyTargets,
  stats: EnglishDailyStats,
): TaskCompletion {
  const reading = {
    completed: stats.readingArticleCount,
    target: targets.readingTarget,
    met: stats.readingArticleCount >= targets.readingTarget,
  };
  const editing = {
    completed: stats.editingExerciseCount,
    target: targets.editingTarget,
    met: stats.editingExerciseCount >= targets.editingTarget,
    required: targets.isEditingRequired,
  };
  const grammar = {
    completed: stats.grammarExerciseCount,
    target: targets.grammarTarget,
    met: stats.grammarExerciseCount >= targets.grammarTarget,
    required: targets.isGrammarRequired,
  };
  const vocab = {
    completed: stats.vocabSentenceCount,
    target: targets.vocabTarget,
    met: stats.vocabSentenceCount >= targets.vocabTarget,
  };
  const composition = {
    completed: stats.compositionCompletedCount,
    target: targets.compositionTarget,
    met: stats.compositionCompletedCount >= targets.compositionTarget,
  };
  const allRequiredMet =
    reading.met &&
    vocab.met &&
    composition.met &&
    (!editing.required || editing.met) &&
    (!grammar.required || grammar.met);
  return { reading, editing, grammar, vocab, composition, allRequiredMet };
}
