export type GradeCode = 'A1' | 'A2' | 'B3' | 'B4' | 'C5' | 'C6' | 'D7' | 'E8' | 'F9';

export type ScoreGradeMeta = {
  score: number | null;
  total: number | null;
  percentage: number | null;
  grade: GradeCode | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export const percentageToGrade = (percentage: number | null): GradeCode | null => {
  if (percentage === null || !Number.isFinite(percentage)) return null;
  if (percentage >= 75) return 'A1';
  if (percentage >= 70) return 'A2';
  if (percentage >= 65) return 'B3';
  if (percentage >= 60) return 'B4';
  if (percentage >= 55) return 'C5';
  if (percentage >= 50) return 'C6';
  if (percentage >= 45) return 'D7';
  if (percentage >= 40) return 'E8';
  return 'F9';
};

export const parseScoreMeta = (scoreRaw: unknown, totalRaw?: unknown): ScoreGradeMeta => {
  const scoreText = typeof scoreRaw === 'string' ? scoreRaw.trim() : '';
  const slashMatch = scoreText.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (slashMatch) {
    const score = toFiniteNumber(slashMatch[1]);
    const total = toFiniteNumber(slashMatch[2]);
    const percentage = score !== null && total !== null && total > 0 ? round2((score / total) * 100) : null;
    return { score, total, percentage, grade: percentageToGrade(percentage) };
  }

  const score = toFiniteNumber(scoreRaw);
  const total = toFiniteNumber(totalRaw);
  if (score === null) return { score: null, total: total ?? null, percentage: null, grade: null };
  if (total !== null && total > 0) {
    const percentage = round2((score / total) * 100);
    return { score, total, percentage, grade: percentageToGrade(percentage) };
  }

  // Legacy fallback: old rows may only have a single score that already means %.
  const pct = score >= 0 && score <= 100 ? round2(score) : null;
  return { score, total: null, percentage: pct, grade: percentageToGrade(pct) };
};
