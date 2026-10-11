// Compatibility rules from server/utils/scoreGrade.ts; never coerce null into zero.
export const grades = [
  "A1",
  "A2",
  "B3",
  "B4",
  "C5",
  "C6",
  "D7",
  "E8",
  "F9"
] as const;
export type Grade = typeof grades[number];
export function finiteNumber(value: unknown): number | null {
  if (
    value == null ||
    typeof value === "boolean" ||
    String(value).trim() === ""
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function gradeFor(percentage: number | null): Grade | null {
  if (percentage === null) return null;
  return (
    grades[
      [75, 70, 65, 60, 55, 50, 45, 40].findIndex(
        boundary => percentage >= boundary
      )
    ] || "F9"
  );
}
export function scoreDisplay(input: {
  score?: unknown;
  total?: unknown;
  totalScore?: unknown;
  maxScore?: unknown;
  percentage?: unknown;
  grade?: unknown;
}) {
  const fraction =
    typeof input.score === "string"
      ? input.score.trim().match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
      : null;
  const score = finiteNumber(fraction ? fraction[1] : input.score);
  const total = finiteNumber(
    fraction ? fraction[2] : input.total ?? input.totalScore ?? input.maxScore
  );
  const returned = finiteNumber(input.percentage);
  const inferred =
    score === null
      ? null
      : total !== null && total > 0
      ? (score / total) * 100
      : score >= 0 && score <= 100
      ? score
      : null;
  const percentage =
    returned !== null && returned >= 0 && returned <= 100
      ? returned
      : inferred === null
      ? null
      : Math.round(inferred * 100) / 100;
  const grade = grades.includes(input.grade as Grade)
    ? (input.grade as Grade)
    : gradeFor(percentage);
  return {
    score,
    total: total !== null && total > 0 ? total : null,
    percentage,
    grade
  };
}
