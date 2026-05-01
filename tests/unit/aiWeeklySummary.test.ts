import { describe, expect, it } from 'vitest';
import {
  aggregateAttendance,
  aggregateEnglishStats,
  aggregateLossPoints,
  parseStructuredSummary,
} from '../../server/utils/aiWeeklySummary';

describe('aggregateAttendance', () => {
  it('counts present/late/absent across rows', () => {
    expect(
      aggregateAttendance([
        { attendance: 'present' },
        { attendance: 'present' },
        { attendance: 'late' },
        { attendance: 'absent' },
        { attendance: null },
      ]),
    ).toEqual({ totalDays: 5, present: 2, late: 1, absent: 1 });
  });

  it('returns zeros on empty array', () => {
    expect(aggregateAttendance([])).toEqual({ totalDays: 0, present: 0, late: 0, absent: 0 });
  });
});

describe('aggregateEnglishStats', () => {
  it('sums per-day stats from V2 activities', () => {
    const day = (v: Record<string, unknown>) => ({
      activities: [{ type: 'english', english: v }],
    });
    const total = aggregateEnglishStats([
      day({ reading: { articleCount: 2 }, editing: { exerciseCount: 3 }, essay: { completed: true } }),
      day({ reading: { articleCount: 1 }, vocab: { vocabularySentenceCount: 20 } }),
      day({ grammar: { exerciseCount: 4 }, essay: { completed: false } }),
    ]);
    expect(total).toEqual({
      readingArticleCount: 3,
      editingExerciseCount: 3,
      grammarExerciseCount: 4,
      vocabSentenceCount: 20,
      compositionCompletedCount: 1,
    });
  });

  it('handles legacy string-only english as zero counts', () => {
    expect(
      aggregateEnglishStats([
        { activities: [{ type: 'english', english: { editing: 'free text', reading: 'r' } }] },
      ]),
    ).toEqual({
      readingArticleCount: 0,
      editingExerciseCount: 0,
      grammarExerciseCount: 0,
      vocabSentenceCount: 0,
      compositionCompletedCount: 0,
    });
  });
});

describe('aggregateLossPoints', () => {
  const lookup = new Map<string, string>([
    ['lp-tense', '时态错误'],
    ['lp-detail', '细节理解错误'],
  ]);

  const sample = [
    {
      activities: [
        {
          type: 'english',
          english: {
            editing: { score: 7, lossPointIds: ['lp-tense', 'lp-tense', 'lp-other'], otherLossPointText: '介词搭配' },
            reading: { score: 8, lossPointIds: ['lp-detail'] },
            grammar: { score: 6, lossPointIds: [] },
          },
        },
      ],
    },
    {
      activities: [
        {
          type: 'english',
          english: {
            editing: { score: 6, lossPointIds: ['lp-tense'] },
          },
        },
      ],
    },
  ];

  it('counts loss-point hits and sorts by frequency', () => {
    const r = aggregateLossPoints(sample, lookup);
    expect(r.byEntry[0]).toEqual({ id: 'lp-tense', label: '时态错误', field: 'editing', count: 3 });
    expect(r.totalLossPointHits).toBe(5); // 3 editing + 1 reading + 0 grammar from 1st row, + 1 editing from 2nd
  });

  it('falls back to snapshot label, then to id, when catalog lacks the entry', () => {
    const r = aggregateLossPoints(
      [
        {
          activities: [
            {
              type: 'english',
              english: {
                editing: {
                  score: 5,
                  lossPointIds: ['ghost'],
                  lossPointLabelsSnapshot: ['historical'],
                },
                reading: {
                  score: 5,
                  lossPointIds: ['unknown'],
                  lossPointLabelsSnapshot: [],
                },
              },
            },
          ],
        },
      ],
      new Map(),
    );
    const editEntry = r.byEntry.find((e) => e.id === 'ghost');
    const readEntry = r.byEntry.find((e) => e.id === 'unknown');
    expect(editEntry?.label).toBe('historical');
    expect(readEntry?.label).toBe('unknown');
  });

  it('counts scored fields with neither lossPointIds nor otherText (compliance gap)', () => {
    const r = aggregateLossPoints(sample, lookup);
    // grammar in 1st row has score=6 with empty ids and no other text → counts as 1
    expect(r.totalScoredFieldsWithoutLossPoints).toBe(1);
  });

  it('collects otherLossPointText per field', () => {
    const r = aggregateLossPoints(sample, lookup);
    expect(r.byField.editing.otherTexts).toContain('介词搭配');
    expect(r.byField.reading.otherTexts).toEqual([]);
  });
});

describe('parseStructuredSummary', () => {
  const fullObject = {
    summary: 's',
    strengths: ['a'],
    areasToImprove: ['b'],
    lossPointAnalysis: ['c'],
    improvementDirections: ['d'],
    teacherActionsTaken: ['e'],
    nextWeekFocus: ['f'],
  };

  it('parses well-formed JSON', () => {
    expect(parseStructuredSummary(JSON.stringify(fullObject))).toEqual(fullObject);
  });

  it('strips markdown code fences around JSON', () => {
    const raw = '```json\n' + JSON.stringify(fullObject) + '\n```';
    expect(parseStructuredSummary(raw)).toEqual(fullObject);
  });

  it('extracts JSON embedded in prose', () => {
    const raw = `Sure, here's the report: ${JSON.stringify(fullObject)} let me know.`;
    expect(parseStructuredSummary(raw)).toEqual(fullObject);
  });

  it('fills missing fields with defaults', () => {
    const raw = JSON.stringify({ summary: 'just a sentence', strengths: ['x'] });
    const out = parseStructuredSummary(raw);
    expect(out.summary).toBe('just a sentence');
    expect(out.strengths).toEqual(['x']);
    expect(out.areasToImprove).toEqual([]);
    expect(out.lossPointAnalysis).toEqual([]);
    expect(out.nextWeekFocus).toEqual([]);
  });

  it('falls back to raw text in `summary` when input is unparseable', () => {
    const out = parseStructuredSummary('the AI rambled and never produced JSON');
    expect(out.summary).toBe('the AI rambled and never produced JSON');
    expect(out.strengths).toEqual([]);
  });

  it('returns empty defaults on empty / null input', () => {
    const empty = {
      summary: '',
      strengths: [],
      areasToImprove: [],
      lossPointAnalysis: [],
      improvementDirections: [],
      teacherActionsTaken: [],
      nextWeekFocus: [],
    };
    expect(parseStructuredSummary('')).toEqual(empty);
    expect(parseStructuredSummary('   ')).toEqual(empty);
    expect(parseStructuredSummary(null)).toEqual(empty);
    expect(parseStructuredSummary(undefined)).toEqual(empty);
  });
});
