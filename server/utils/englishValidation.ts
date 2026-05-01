// Loss-point validation (Part 4).
//
// Rule: when an English V2 sub-field has a numeric `score`, the teacher MUST
// also indicate where the points were lost. We accept either a non-empty
// `lossPointIds` array or a non-empty `otherLossPointText`. A score of `null`
// means "not graded" and is exempt.
//
// Spec scope: editing / reading / grammar are the three required sub-fields.
// Essay also carries lossPointIds in V2 but is NOT subject to mandatory
// selection per the spec — left optional intentionally.

import { normalizeEnglishFields } from './englishNormalize';

const SCORED_FIELDS = ['editing', 'reading', 'grammar'] as const;
type ScoredFieldKey = (typeof SCORED_FIELDS)[number];

export type LossPointValidationError = {
  activityIndex: number;
  field: ScoredFieldKey;
  message: string;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isEnglishActivity = (a: Record<string, unknown>): boolean => {
  if (a.type === 'english') return true;
  if (isPlainObject(a.english)) return true;
  const subjectName = String(a.subjectName ?? a.subject ?? '').toLowerCase();
  return (
    subjectName === 'english' ||
    subjectName.includes('英文') ||
    subjectName.includes('英语')
  );
};

/**
 * Validate that every scored editing/reading/grammar block also identifies
 * loss points. Returns ALL errors (we don't short-circuit) so the client can
 * display them all at once.
 *
 * Accepts pre- or post-normalized activities — we run normalize internally for
 * each english activity so callers don't need to remember to normalize first.
 */
export function validateLossPointsRequired(activities: unknown): {
  ok: boolean;
  errors: LossPointValidationError[];
} {
  if (!Array.isArray(activities)) return { ok: true, errors: [] };
  const errors: LossPointValidationError[] = [];
  activities.forEach((a, idx) => {
    if (!isPlainObject(a) || !isEnglishActivity(a)) return;
    const eng = normalizeEnglishFields(a.english ?? {});
    for (const field of SCORED_FIELDS) {
      const block = eng[field];
      // Loss-points required when any exercise scored less than 100 (i.e. <100% — points lost).
      // Legacy single-score path kicks in when the exercises array is empty
      // and the parent score is below the implicit perfect mark.
      const exercises = Array.isArray(block.exercises) ? block.exercises : [];
      const anyImperfect = exercises.length
        ? exercises.some((ex) => ex.score != null && ex.score < 100)
        : block.score != null && block.score < 100;
      if (!anyImperfect) continue;
      const hasIds = block.lossPointIds.length > 0;
      const hasOther = block.otherLossPointText.trim().length > 0;
      if (!hasIds && !hasOther) {
        errors.push({
          activityIndex: idx,
          field,
          message: `${field} has imperfect scores but no lossPointIds and no otherLossPointText`,
        });
      }
    }
  });
  return { ok: errors.length === 0, errors };
}
