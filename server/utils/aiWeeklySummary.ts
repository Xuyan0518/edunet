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

Now produce the JSON.`;

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
