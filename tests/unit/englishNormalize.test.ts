import { describe, expect, it } from 'vitest';
import {
  extractEnglishStats,
  normalizeActivities,
  normalizeActivity,
  normalizeEnglishFields,
} from '../../server/utils/englishNormalize';

describe('normalizeEnglishFields', () => {
  it('promotes legacy string-only english block to V2 with all fields', () => {
    const result = normalizeEnglishFields({
      editing: '改错练习 5 道',
      vocab: '词汇 30 个',
      reading: '阅读 2 篇',
      recitation: '背诵 unit 3',
      essay: '作文：My Day',
    });
    expect(result.editing.text).toBe('改错练习 5 道');
    expect(result.editing.score).toBeNull();
    expect(result.editing.totalScore).toBe(100);
    expect(result.editing.exerciseCount).toBe(0);
    expect(result.editing.lossPointIds).toEqual([]);
    expect(result.editing.lossPointLabelsSnapshot).toEqual([]);
    expect(result.editing.otherLossPointText).toBe('');
    expect(result.vocab).toEqual({ text: '词汇 30 个', vocabularySentenceCount: 0, vocabularyWordCount: 0 });
    expect(result.recitation).toEqual({ text: '背诵 unit 3' });
    expect(result.essay.text).toBe('作文：My Day');
    expect(result.essay.completed).toBe(false);
    expect(result.essay.totalScore).toBeNull();
  });

  it('inserts an empty grammar block for legacy data (grammar is new in V2)', () => {
    const result = normalizeEnglishFields({ editing: 'x', vocab: 'y', reading: 'z' });
    expect(result.grammar).toEqual({
      text: '',
      score: null,
      totalScore: 100,
      exerciseCount: 0,
      exercises: [],
      lossPointIds: [],
      lossPointLabelsSnapshot: [],
      otherLossPointText: '',
    });
  });

  it('fills missing defaults on partial V2 input', () => {
    const result = normalizeEnglishFields({
      reading: { text: 'A', articleCount: 3, score: 8 },
    });
    expect(result.reading).toEqual({
      text: 'A',
      score: 8,
      totalScore: 100,
      articleCount: 3,
      exercises: [
        { score: 8, problems: 'A' },
        { score: null, problems: '' },
        { score: null, problems: '' },
      ],
      lossPointIds: [],
      lossPointLabelsSnapshot: [],
      otherLossPointText: '',
    });
  });

  it('is idempotent on already-V2 input', () => {
    const v2 = normalizeEnglishFields({ editing: 'a', reading: 'b', essay: 'c' });
    const twice = normalizeEnglishFields(v2);
    expect(twice).toEqual(v2);
  });

  it('accepts an activity-shaped wrapper and reads the nested english block', () => {
    const activity = {
      type: 'english',
      subjectName: '英文',
      english: { editing: 'legacy editing text' },
    };
    const result = normalizeEnglishFields(activity);
    expect(result.editing.text).toBe('legacy editing text');
  });

  it('returns full V2 defaults when input is empty / null / undefined', () => {
    for (const input of [undefined, null, {}, 'oops', 42] as const) {
      const result = normalizeEnglishFields(input);
      expect(result).toHaveProperty('editing.text', '');
      expect(result).toHaveProperty('grammar.text', '');
      expect(result).toHaveProperty('essay.completed', false);
    }
  });

  it('preserves caller-provided lossPointIds and snapshot labels', () => {
    const result = normalizeEnglishFields({
      editing: {
        text: 'x',
        score: 6,
        lossPointIds: ['lp1', 'lp2'],
        lossPointLabelsSnapshot: ['介词错误', '时态错误'],
        otherLossPointText: '其他细节',
      },
    });
    expect(result.editing.lossPointIds).toEqual(['lp1', 'lp2']);
    expect(result.editing.lossPointLabelsSnapshot).toEqual(['介词错误', '时态错误']);
    expect(result.editing.otherLossPointText).toBe('其他细节');
  });

  it('coerces numeric strings on counts and rejects negatives', () => {
    const result = normalizeEnglishFields({
      reading: { articleCount: '5' },
      grammar: { exerciseCount: -3 },
      vocab: { vocabularySentenceCount: 'abc' },
    });
    expect(result.reading.articleCount).toBe(5);
    expect(result.grammar.exerciseCount).toBe(0);
    expect(result.vocab.vocabularySentenceCount).toBe(0);
  });
});

describe('normalizeActivity', () => {
  it('upgrades a miniprogram-shape english activity in place', () => {
    const activity = {
      subjectId: 'subj-1',
      subjectName: '英文',
      type: 'english',
      english: { editing: '改错', vocab: '词汇' },
      comment: 'OK',
      papers: [],
    };
    const out = normalizeActivity(activity) as { english: { editing: { text: string } } };
    expect(out.english.editing.text).toBe('改错');
    expect((out as { comment: string }).comment).toBe('OK');
  });

  it('detects an english activity by subject name even without type:"english"', () => {
    const out = normalizeActivity({
      subjectName: 'English',
      english: { reading: 'r' },
    }) as { type: string; english: { reading: { text: string } } };
    expect(out.type).toBe('english');
    expect(out.english.reading.text).toBe('r');
  });

  it('passes through non-english activities unchanged', () => {
    const a = {
      subjectId: 's',
      subjectName: 'Math',
      type: 'generic',
      practiceProgress: 'p',
      definitionRecitation: 'd',
      comment: 'c',
    };
    expect(normalizeActivity(a)).toBe(a);
  });
});

describe('normalizeActivities', () => {
  it('returns the input as-is when not an array', () => {
    expect(normalizeActivities(null)).toBeNull();
    expect(normalizeActivities('x')).toBe('x');
  });

  it('normalizes each activity in an array', () => {
    const out = normalizeActivities([
      { subjectName: '英文', english: { editing: 'a' } },
      { subjectName: 'Math', practiceProgress: 'p' },
    ]) as Array<Record<string, unknown>>;
    expect((out[0].english as { editing: { text: string } }).editing.text).toBe('a');
    expect(out[1].practiceProgress).toBe('p');
  });
});

describe('extractEnglishStats', () => {
  it('sums counters across multiple english activities', () => {
    const stats = extractEnglishStats([
      {
        type: 'english',
        english: {
          reading: { articleCount: 2 },
          editing: { exerciseCount: 3 },
          grammar: { exerciseCount: 1 },
          vocab: { vocabularySentenceCount: 10 },
          essay: { completed: true },
        },
      },
      {
        type: 'english',
        english: {
          reading: { articleCount: 1 },
          essay: { completed: false },
        },
      },
    ]);
    expect(stats).toEqual({
      readingArticleCount: 3,
      editingExerciseCount: 3,
      grammarExerciseCount: 1,
      vocabSentenceCount: 10,
      compositionCompletedCount: 1,
    });
  });

  it('ignores non-english activities', () => {
    const stats = extractEnglishStats([
      { subjectName: 'Math', practiceProgress: 'whatever' },
      { type: 'english', english: { reading: { articleCount: 4 } } },
    ]);
    expect(stats.readingArticleCount).toBe(4);
    expect(stats.editingExerciseCount).toBe(0);
  });

  it('treats legacy string english as zero counts (no count info available)', () => {
    const stats = extractEnglishStats([
      { type: 'english', english: { editing: 'hi', vocab: 'x', reading: 'y' } },
    ]);
    expect(stats).toEqual({
      readingArticleCount: 0,
      editingExerciseCount: 0,
      grammarExerciseCount: 0,
      vocabSentenceCount: 0,
      compositionCompletedCount: 0,
    });
  });

  it('returns all-zero stats on non-array / empty input', () => {
    expect(extractEnglishStats(undefined)).toEqual({
      readingArticleCount: 0,
      editingExerciseCount: 0,
      grammarExerciseCount: 0,
      vocabSentenceCount: 0,
      compositionCompletedCount: 0,
    });
    expect(extractEnglishStats([])).toEqual({
      readingArticleCount: 0,
      editingExerciseCount: 0,
      grammarExerciseCount: 0,
      vocabSentenceCount: 0,
      compositionCompletedCount: 0,
    });
  });
});
