// English activity V2 normalizer.
//
// Why: Legacy daily_progress.activities[*].english stores all subject fields as
// plain strings (editing/vocab/reading/recitation/essay) and has no grammar block,
// no scores, no counts, no loss-point tracking. We are upgrading to a richer V2
// shape WITHOUT a destructive DB migration — every read passes through
// normalizeEnglishFields() so old rows look V2 to consumers, and every write
// passes through it so new rows are persisted in V2.
//
// Backward compatibility rules:
//   - Never throw on unexpected input; always return a complete V2 block.
//   - Idempotent: normalize(normalize(x)) === normalize(x).
//   - Strings are promoted to { text: <string> } so legacy free-text is never lost.
//   - Unknown keys are preserved (we don't strip).

export type LossPointRefs = {
  lossPointIds: string[];
  lossPointLabelsSnapshot: string[];
  otherLossPointText: string;
};

export type ExerciseEntry = {
  score: number | null;
  totalScore: number | null;
  problems: string;
};

export type EditingFieldV2 = {
  text: string;
  score: number | null;
  totalScore: number | null;
  exerciseCount: number;
  exercises: ExerciseEntry[];
} & LossPointRefs;

export type ReadingFieldV2 = {
  text: string;
  score: number | null;
  totalScore: number | null;
  articleCount: number;
  exercises: ExerciseEntry[];
} & LossPointRefs;

export type GrammarFieldV2 = {
  text: string;
  score: number | null;
  totalScore: number | null;
  exerciseCount: number;
  exercises: ExerciseEntry[];
} & LossPointRefs;

export type VocabFieldV2 = {
  text: string;
  // Legacy: single combined count. Keep populated for backward compat with
  // weekly task targets (which check vocabularySentenceCount).
  vocabularySentenceCount: number;
  vocabularyWordCount: number;
};

export type RecitationFieldV2 = {
  text: string;
};

export type EssayFieldV2 = {
  text: string;
  title: string;
  completed: boolean;
  score: number | null;
  totalScore: number | null;
} & LossPointRefs;

export type EnglishFieldsV2 = {
  editing: EditingFieldV2;
  reading: ReadingFieldV2;
  grammar: GrammarFieldV2;
  vocab: VocabFieldV2;
  recitation: RecitationFieldV2;
  essay: EssayFieldV2;
};

const DEFAULT_TOTAL_SCORE_SCORED = 100;

const normalizeExercises = (
  raw: unknown,
  count: number,
  legacyScore: number | null,
  legacyText: string,
): ExerciseEntry[] => {
  const arr: ExerciseEntry[] = [];
  const incoming = Array.isArray(raw) ? raw : [];
  for (let i = 0; i < count; i++) {
    const e = incoming[i];
    if (e && typeof e === 'object' && !Array.isArray(e)) {
      const obj = e as Record<string, unknown>;
      arr.push({
        score: toNumberOrNull(obj.score),
        totalScore: toNumberOrNull(obj.totalScore),
        problems: typeof obj.problems === 'string' ? obj.problems : '',
      });
    } else {
      // No entry in the array yet — for the first slot, fall back to legacy
      // score/text so existing data isn't lost when the form first migrates.
      arr.push({
        score: i === 0 && incoming.length === 0 ? legacyScore : null,
        totalScore: DEFAULT_TOTAL_SCORE_SCORED,
        problems: i === 0 && incoming.length === 0 ? legacyText : '',
      });
    }
  }
  return arr;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const toText = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  if (isPlainObject(v) && typeof v.text === 'string') return v.text;
  return '';
};

const toIntCount = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
};

const toNumberOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const toStringArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
};

const lossPointDefaults = (raw: unknown): LossPointRefs => {
  const obj = isPlainObject(raw) ? raw : {};
  return {
    lossPointIds: toStringArray(obj.lossPointIds),
    lossPointLabelsSnapshot: toStringArray(obj.lossPointLabelsSnapshot),
    otherLossPointText:
      typeof obj.otherLossPointText === 'string' ? obj.otherLossPointText : '',
  };
};

const normalizeEditing = (raw: unknown): EditingFieldV2 => {
  const obj = isPlainObject(raw) ? raw : {};
  const totalScore = toNumberOrNull(obj.totalScore);
  const text = toText(raw);
  const score = toNumberOrNull(obj.score);
  const exerciseCount = toIntCount(obj.exerciseCount);
  return {
    text,
    score,
    totalScore: totalScore ?? DEFAULT_TOTAL_SCORE_SCORED,
    exerciseCount,
    exercises: normalizeExercises(obj.exercises, exerciseCount, score, text),
    ...lossPointDefaults(obj),
  };
};

const normalizeReading = (raw: unknown): ReadingFieldV2 => {
  const obj = isPlainObject(raw) ? raw : {};
  const totalScore = toNumberOrNull(obj.totalScore);
  const text = toText(raw);
  const score = toNumberOrNull(obj.score);
  const articleCount = toIntCount(obj.articleCount);
  return {
    text,
    score,
    totalScore: totalScore ?? DEFAULT_TOTAL_SCORE_SCORED,
    articleCount,
    exercises: normalizeExercises(obj.exercises, articleCount, score, text),
    ...lossPointDefaults(obj),
  };
};

const normalizeGrammar = (raw: unknown): GrammarFieldV2 => {
  const obj = isPlainObject(raw) ? raw : {};
  const totalScore = toNumberOrNull(obj.totalScore);
  const text = toText(raw);
  const score = toNumberOrNull(obj.score);
  const exerciseCount = toIntCount(obj.exerciseCount);
  return {
    text,
    score,
    totalScore: totalScore ?? DEFAULT_TOTAL_SCORE_SCORED,
    exerciseCount,
    exercises: normalizeExercises(obj.exercises, exerciseCount, score, text),
    ...lossPointDefaults(obj),
  };
};

const normalizeVocab = (raw: unknown): VocabFieldV2 => {
  const obj = isPlainObject(raw) ? raw : {};
  return {
    text: toText(raw),
    vocabularySentenceCount: toIntCount(obj.vocabularySentenceCount),
    vocabularyWordCount: toIntCount(obj.vocabularyWordCount),
  };
};

const normalizeRecitation = (raw: unknown): RecitationFieldV2 => ({
  text: toText(raw),
});

const normalizeEssay = (raw: unknown): EssayFieldV2 => {
  const obj = isPlainObject(raw) ? raw : {};
  return {
    text: toText(raw),
    title: typeof obj.title === 'string' ? obj.title : '',
    completed: obj.completed === true,
    score: toNumberOrNull(obj.score),
    totalScore: toNumberOrNull(obj.totalScore),
    ...lossPointDefaults(obj),
  };
};

/**
 * Normalize an `english` block (or a whole activity-like object) to V2.
 * Accepts: legacy string-keyed object, partial V2, full V2, undefined/null.
 * Returns a complete V2 object with every field populated.
 */
export function normalizeEnglishFields(input: unknown): EnglishFieldsV2 {
  const raw = isPlainObject(input) ? input : {};
  // Some callers pass the whole activity which has `english` nested inside.
  const inner =
    isPlainObject(raw.english) ? (raw.english as Record<string, unknown>) : raw;
  return {
    editing: normalizeEditing(inner.editing),
    reading: normalizeReading(inner.reading),
    grammar: normalizeGrammar(inner.grammar),
    vocab: normalizeVocab(inner.vocab),
    recitation: normalizeRecitation(inner.recitation),
    essay: normalizeEssay(inner.essay),
  };
}

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
 * Normalize a single activity (any subject). English activities get their
 * `english` block normalized to V2; everything else passes through with
 * unknown keys preserved.
 */
export function normalizeActivity(activity: unknown): Record<string, unknown> {
  if (!isPlainObject(activity)) return activity as Record<string, unknown>;
  if (!isEnglishActivity(activity)) return activity;
  return {
    ...activity,
    type: 'english',
    english: normalizeEnglishFields(activity.english ?? {}),
  };
}

/** Normalize an activities array. Safe on non-arrays (returns as-is). */
export function normalizeActivities(activities: unknown): unknown {
  if (!Array.isArray(activities)) return activities;
  return activities.map(normalizeActivity);
}

/** Aggregated counters from a single day's activities array. */
export type EnglishDailyStats = {
  readingArticleCount: number;
  editingExerciseCount: number;
  grammarExerciseCount: number;
  vocabSentenceCount: number;
  compositionCompletedCount: number;
};

const ZERO_STATS: EnglishDailyStats = {
  readingArticleCount: 0,
  editingExerciseCount: 0,
  grammarExerciseCount: 0,
  vocabSentenceCount: 0,
  compositionCompletedCount: 0,
};

/**
 * Sum English completion counters across an activities array (one day's worth,
 * or a flattened multi-day list — the function does not care about dates).
 *
 * Used by Part 3 weekly task completion; safe to call on legacy data because
 * normalization runs first.
 */
export function extractEnglishStats(activities: unknown): EnglishDailyStats {
  if (!Array.isArray(activities)) return { ...ZERO_STATS };
  const out = { ...ZERO_STATS };
  for (const a of activities) {
    if (!isPlainObject(a) || !isEnglishActivity(a)) continue;
    const eng = normalizeEnglishFields(a.english ?? {});
    out.readingArticleCount += eng.reading.articleCount;
    out.editingExerciseCount += eng.editing.exerciseCount;
    out.grammarExerciseCount += eng.grammar.exerciseCount;
    out.vocabSentenceCount += eng.vocab.vocabularySentenceCount;
    if (eng.essay.completed) out.compositionCompletedCount += 1;
  }
  return out;
}
