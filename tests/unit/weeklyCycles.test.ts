import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGETS,
  defaultCycleForDate,
  effectiveTargetsFor,
  evaluateCompletion,
  pickCoveringCycle,
  syntheticCycleFor,
} from '../../server/utils/weeklyCycles';

describe('defaultCycleForDate', () => {
  // 2026-05-03 is a Sunday. The cycle that contains it is Sun 2026-05-03 → Thu 2026-05-07.
  it('Sunday maps to that Sunday → Thursday', () => {
    expect(defaultCycleForDate('2026-05-03')).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-05-07',
    });
  });

  it('Wednesday inside the cycle maps to the same Sun → Thu window', () => {
    expect(defaultCycleForDate('2026-05-06')).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-05-07',
    });
  });

  it('Thursday maps to the Sun → that-Thu window', () => {
    expect(defaultCycleForDate('2026-05-07')).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-05-07',
    });
  });

  it('Friday maps to the just-completed cycle (Sun..Thu that ended yesterday)', () => {
    // 2026-05-08 is a Friday — most recent Sunday is still 2026-05-03.
    expect(defaultCycleForDate('2026-05-08')).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-05-07',
    });
  });

  it('Saturday also maps to the just-completed cycle', () => {
    expect(defaultCycleForDate('2026-05-09')).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-05-07',
    });
  });

  it('throws on invalid date', () => {
    expect(() => defaultCycleForDate('not-a-date')).toThrow();
  });
});

describe('pickCoveringCycle', () => {
  const rows = [
    { id: 'A', startDate: '2026-05-03', endDate: '2026-05-07', notes: null },
    { id: 'B', startDate: '2026-05-10', endDate: '2026-05-14', notes: null },
    { id: 'C', startDate: '2026-05-12', endDate: '2026-05-16', notes: 'overlap' },
  ];

  it('returns null when no cycle covers the date', () => {
    expect(pickCoveringCycle(rows, '2026-04-01')).toBeNull();
  });

  it('returns the unique covering cycle', () => {
    expect(pickCoveringCycle(rows, '2026-05-05')?.id).toBe('A');
  });

  it('on overlap, prefers the cycle whose start is closer to the date (most recent intent)', () => {
    // 2026-05-13 is covered by both B (10..14) and C (12..16). C starts later → wins.
    expect(pickCoveringCycle(rows, '2026-05-13')?.id).toBe('C');
  });

  it('accepts Date objects for start/end columns', () => {
    const dateRows = [
      { id: 'X', startDate: new Date('2026-05-03T00:00:00Z'), endDate: new Date('2026-05-07T00:00:00Z'), notes: null },
    ];
    expect(pickCoveringCycle(dateRows, '2026-05-05')?.id).toBe('X');
  });
});

describe('syntheticCycleFor', () => {
  it('produces a cycle with id=null and the default Sun..Thu window', () => {
    const c = syntheticCycleFor('2026-05-06');
    expect(c.id).toBeNull();
    expect(c.startDate).toBe('2026-05-03');
    expect(c.endDate).toBe('2026-05-07');
    expect(c.notes).toBeNull();
  });
});

describe('effectiveTargetsFor', () => {
  it('returns hardcoded defaults when stored is null/undefined', () => {
    expect(effectiveTargetsFor(null)).toEqual(DEFAULT_TARGETS);
    expect(effectiveTargetsFor(undefined)).toEqual(DEFAULT_TARGETS);
  });

  it('returns stored values when fully provided', () => {
    expect(
      effectiveTargetsFor({
        readingTarget: 7,
        editingTarget: 4,
        grammarTarget: 6,
        vocabTarget: 80,
        compositionTarget: 2,
        isGrammarRequired: false,
        isEditingRequired: true,
      }),
    ).toEqual({
      readingTarget: 7,
      editingTarget: 4,
      grammarTarget: 6,
      vocabTarget: 80,
      compositionTarget: 2,
      isGrammarRequired: false,
      isEditingRequired: true,
    });
  });

  it('fills in missing fields from defaults', () => {
    const t = effectiveTargetsFor({ readingTarget: 9, isGrammarRequired: false });
    expect(t.readingTarget).toBe(9);
    expect(t.isGrammarRequired).toBe(false);
    expect(t.editingTarget).toBe(DEFAULT_TARGETS.editingTarget);
    expect(t.vocabTarget).toBe(DEFAULT_TARGETS.vocabTarget);
    expect(t.isEditingRequired).toBe(true);
  });
});

describe('evaluateCompletion', () => {
  const baseStats = {
    readingArticleCount: 5,
    editingExerciseCount: 5,
    grammarExerciseCount: 5,
    vocabSentenceCount: 50,
    compositionCompletedCount: 1,
  };

  it('reports allRequiredMet=true when every default target is exactly hit', () => {
    const r = evaluateCompletion(DEFAULT_TARGETS, baseStats);
    expect(r.allRequiredMet).toBe(true);
    expect(r.reading.met).toBe(true);
    expect(r.composition.met).toBe(true);
  });

  it('drops to false when reading is below target', () => {
    const r = evaluateCompletion(DEFAULT_TARGETS, { ...baseStats, readingArticleCount: 4 });
    expect(r.allRequiredMet).toBe(false);
    expect(r.reading.met).toBe(false);
  });

  it('grammar shortfall does not block completion when isGrammarRequired=false', () => {
    const targets = { ...DEFAULT_TARGETS, isGrammarRequired: false };
    const r = evaluateCompletion(targets, { ...baseStats, grammarExerciseCount: 0 });
    expect(r.grammar.met).toBe(false);
    expect(r.grammar.required).toBe(false);
    expect(r.allRequiredMet).toBe(true);
  });

  it('grammar shortfall does block when isGrammarRequired=true', () => {
    const r = evaluateCompletion(DEFAULT_TARGETS, { ...baseStats, grammarExerciseCount: 0 });
    expect(r.allRequiredMet).toBe(false);
  });

  it('editing shortfall is gated by isEditingRequired', () => {
    const required = evaluateCompletion(DEFAULT_TARGETS, { ...baseStats, editingExerciseCount: 0 });
    expect(required.allRequiredMet).toBe(false);
    const optional = evaluateCompletion(
      { ...DEFAULT_TARGETS, isEditingRequired: false },
      { ...baseStats, editingExerciseCount: 0 },
    );
    expect(optional.allRequiredMet).toBe(true);
    expect(optional.editing.required).toBe(false);
  });

  it('vocab and composition are always required', () => {
    const r = evaluateCompletion(DEFAULT_TARGETS, { ...baseStats, vocabSentenceCount: 49 });
    expect(r.allRequiredMet).toBe(false);
    const r2 = evaluateCompletion(DEFAULT_TARGETS, { ...baseStats, compositionCompletedCount: 0 });
    expect(r2.allRequiredMet).toBe(false);
  });
});
