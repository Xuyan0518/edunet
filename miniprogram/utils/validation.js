const LIMITS = {
  titleMax: 120,
  shortTextMax: 200,
  summaryMax: 5000,
  commentMax: 1000,
  activityTextMax: 1000,
  reportTextMax: 5000,
  scoreMin: 0,
  scoreMax: 500,
  percentageMax: 100,
  englishScoreMax: 100,
  englishExerciseMax: 30,
  englishVocabMax: 500,
  englishSentenceMax: 500,
  examSubjectsMax: 30,
  papersBatchMax: 60,
  yearMin: 2000,
  yearMax: 2100,
  weeklyRangeMaxDays: 10,
  quarterlyRangeMaxDays: 220,
  yearlyRangeMaxDays: 380,
  exportRangeMaxDays: 370,
  scorePointsRenderMax: 30,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const trimText = (value) => String(value == null ? '' : value).trim();

const toFiniteNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toFiniteInt = (value) => {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  return n;
};

const clampIntInput = (value, min, max) => {
  const n = toFiniteInt(value);
  if (n === null) return min;
  return Math.min(max, Math.max(min, n));
};

const clampNumberInput = (value, min, max) => {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  return Math.min(max, Math.max(min, n));
};

const isYmd = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const toDayValue = (ymd) => {
  if (!isYmd(ymd)) return null;
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return t;
};

const validateDateRange = ({ startDate, endDate, maxDays }) => {
  if (!isYmd(startDate) || !isYmd(endDate)) return { ok: false, message: '日期格式无效' };
  if (startDate > endDate) return { ok: false, message: '开始日期不能晚于结束日期' };
  const start = toDayValue(startDate);
  const end = toDayValue(endDate);
  if (start == null || end == null) return { ok: false, message: '日期格式无效' };
  const days = Math.floor((end - start) / MS_PER_DAY) + 1;
  if (days > maxDays) return { ok: false, message: `日期范围过大（最多 ${maxDays} 天）` };
  return { ok: true, days };
};

const validateYear = (value) => {
  const y = toFiniteInt(value);
  if (y === null) return { ok: false, message: '年份必须是整数' };
  if (y < LIMITS.yearMin || y > LIMITS.yearMax) {
    return { ok: false, message: `年份必须在 ${LIMITS.yearMin}-${LIMITS.yearMax}` };
  }
  return { ok: true, year: y };
};

const validateTextLength = ({ value, max, required = false, label = '内容' }) => {
  const text = trimText(value);
  if (required && !text) return { ok: false, message: `${label}不能为空` };
  if (text.length > max) return { ok: false, message: `${label}过长（最多 ${max} 字）` };
  return { ok: true, value: text };
};

const limitArray = (arr, max) => {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, max);
};

const sanitizeScorePoints = (points, max = LIMITS.scorePointsRenderMax) => {
  if (!Array.isArray(points)) return [];
  const filtered = points
    .map((item) => ({ ...(item || {}) }))
    .filter((item) => Number.isFinite(Number(item.percentage)))
    .map((item) => ({
      ...item,
      percentage: Math.min(100, Math.max(0, Number(item.percentage))),
    }));
  return filtered.slice(-max);
};

module.exports = {
  LIMITS,
  trimText,
  toFiniteNumber,
  toFiniteInt,
  clampIntInput,
  clampNumberInput,
  isYmd,
  validateDateRange,
  validateYear,
  validateTextLength,
  limitArray,
  sanitizeScorePoints,
};
