import { describe, expect, it } from 'vitest';
import { validateLossPointsRequired } from '../../server/utils/englishValidation';
import { enrichLossPointLabels } from '../../server/utils/lossPointLabels';

describe('validateLossPointsRequired', () => {
  const englishActivity = (overrides: Record<string, unknown>) => ({
    type: 'english',
    subjectName: '英文',
    english: overrides,
  });

  it('passes when no scores are entered (legacy data)', () => {
    expect(
      validateLossPointsRequired([
        englishActivity({
          editing: 'free text only',
          reading: '',
          grammar: '',
        }),
      ]),
    ).toEqual({ ok: true, errors: [] });
  });

  it('passes when score is set AND lossPointIds is non-empty', () => {
    expect(
      validateLossPointsRequired([
        englishActivity({
          editing: { score: 7, lossPointIds: ['lp1'] },
          reading: { score: 8, lossPointIds: ['lp2', 'lp3'] },
          grammar: { score: 6, lossPointIds: ['lp4'] },
        }),
      ]).ok,
    ).toBe(true);
  });

  it('passes when score is set AND otherLossPointText is present', () => {
    expect(
      validateLossPointsRequired([
        englishActivity({
          editing: { score: 5, otherLossPointText: '主要是介词搭配' },
        }),
      ]).ok,
    ).toBe(true);
  });

  it('fails when editing has score but neither ids nor other text', () => {
    const r = validateLossPointsRequired([
      englishActivity({ editing: { score: 4 } }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      expect.objectContaining({ activityIndex: 0, field: 'editing' }),
    ]);
  });

  it('reports multiple errors at once across fields and activities', () => {
    const r = validateLossPointsRequired([
      englishActivity({ editing: { score: 4 }, grammar: { score: 5 } }),
      englishActivity({ reading: { score: 3 } }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => `${e.activityIndex}:${e.field}`).sort()).toEqual([
      '0:editing',
      '0:grammar',
      '1:reading',
    ]);
  });

  it('does NOT require loss points for essay even when essay has a score (per spec)', () => {
    const r = validateLossPointsRequired([
      englishActivity({ essay: { score: 6, completed: true } }),
    ]);
    expect(r.ok).toBe(true);
  });

  it('whitespace-only otherLossPointText does not count as provided', () => {
    const r = validateLossPointsRequired([
      englishActivity({ editing: { score: 5, otherLossPointText: '   ' } }),
    ]);
    expect(r.ok).toBe(false);
  });

  it('ignores non-english activities', () => {
    const r = validateLossPointsRequired([
      { subjectName: 'Math', practiceProgress: 'p' },
      englishActivity({ editing: 'just text' }),
    ]);
    expect(r.ok).toBe(true);
  });

  it('returns ok on non-array input (defensive)', () => {
    expect(validateLossPointsRequired(undefined).ok).toBe(true);
    expect(validateLossPointsRequired(null).ok).toBe(true);
    expect(validateLossPointsRequired('nope').ok).toBe(true);
  });
});

describe('enrichLossPointLabels', () => {
  const lookup = new Map<string, string>([
    ['lp1', '时态错误'],
    ['lp2', '主谓一致'],
    ['lp4', '细节理解错误'],
  ]);

  it('replaces lossPointLabelsSnapshot with current catalog labels', () => {
    const out = enrichLossPointLabels(
      [
        {
          type: 'english',
          english: {
            editing: { score: 7, lossPointIds: ['lp1', 'lp2'], lossPointLabelsSnapshot: ['stale a', 'stale b'] },
            reading: { score: 8, lossPointIds: ['lp4'], lossPointLabelsSnapshot: [] },
          },
        },
      ],
      lookup,
    ) as Array<{ english: { editing: { lossPointLabelsSnapshot: string[] }; reading: { lossPointLabelsSnapshot: string[] } } }>;
    expect(out[0].english.editing.lossPointLabelsSnapshot).toEqual(['时态错误', '主谓一致']);
    expect(out[0].english.reading.lossPointLabelsSnapshot).toEqual(['细节理解错误']);
  });

  it('preserves caller-provided label for ids missing from the catalog', () => {
    const out = enrichLossPointLabels(
      [
        {
          type: 'english',
          english: {
            editing: {
              score: 5,
              lossPointIds: ['unknown-id'],
              lossPointLabelsSnapshot: ['historical label'],
            },
          },
        },
      ],
      lookup,
    ) as Array<{ english: { editing: { lossPointLabelsSnapshot: string[] } } }>;
    expect(out[0].english.editing.lossPointLabelsSnapshot).toEqual(['historical label']);
  });

  it('returns empty string for unknown ids when no caller label was provided', () => {
    const out = enrichLossPointLabels(
      [
        {
          type: 'english',
          english: { editing: { score: 5, lossPointIds: ['ghost-id'] } },
        },
      ],
      lookup,
    ) as Array<{ english: { editing: { lossPointLabelsSnapshot: string[] } } }>;
    expect(out[0].english.editing.lossPointLabelsSnapshot).toEqual(['']);
  });

  it('passes through non-english activities', () => {
    const input = [{ subjectName: 'Math', practiceProgress: 'p' }];
    expect(enrichLossPointLabels(input, lookup)).toEqual(input);
  });

  it('returns input as-is on non-array', () => {
    expect(enrichLossPointLabels(null, lookup)).toBeNull();
  });
});
