import { parseDateString } from '../utils/chinaDate';
import { normalizeEnglishFields } from '../utils/englishNormalize';

export type ReportType = 'quarterly' | 'yearly';

type StudentLike = {
  id?: string;
  name?: string;
  grade?: string;
};

type DailyProgressLike = {
  date?: string | Date | null;
  attendance?: string | null;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  activities?: unknown;
};

type WeeklyReportLike = {
  weekStarting?: string | Date | null;
  weekEnding?: string | Date | null;
  summary?: string | null;
  strengths?: string[] | null;
  areasToImprove?: string[] | null;
  teacherNotes?: string | null;
  nextWeekFocus?: string | null;
};

type PaperLike = {
  date?: string | Date | null;
  subjectName?: string | null;
  description?: string | null;
  score?: number | string | null;
  total?: number | string | null;
  strengths?: string | null;
  improvements?: string | null;
};

type ExamSubjectLike = {
  name?: string | null;
  score?: number | string | null;
  maxScore?: number | string | null;
  total?: number | string | null;
  totalScore?: number | string | null;
  scope?: string | null;
};

type ExamLike = {
  name?: string | null;
  examDate?: string | Date | null;
  date?: string | Date | null;
  subjects?: ExamSubjectLike[] | null;
};

type TrendType = 'improving' | 'declining' | 'stable' | 'insufficient_data';
type IntensityType = 'none' | 'low' | 'medium' | 'high';
type EnglishSkillKey =
  | 'editing'
  | 'composition'
  | 'readingComprehension'
  | 'grammar'
  | 'vocabulary'
  | 'sentences';

type EnglishScorePoint = {
  date: string;
  score: number;
  maxScore: number | null;
  percentage: number | null;
  source: 'dailyProgress' | 'paper' | 'exam';
  title: string | null;
};

type CustomEnglishTaskLike = {
  key: string;
  displayName: string;
  practiceCount: number;
  score: number | null;
  maxScore: number | null;
  problems: string;
  exercises: Array<{
    score: number | null;
    maxScore: number | null;
    problems: string;
  }>;
  completed: boolean;
};

export type StudentReportAnalytics = {
  reportMeta: {
    reportType: ReportType;
    startDate: string;
    endDate: string;
    generatedAt: string;
    totalCalendarDays: number;
  };
  overview: {
    activeDays: number;
    activeRate: number;
    totalDailyProgressRecords: number;
    totalWeeklyReports: number;
    totalPapers: number;
    totalExams: number;
    totalSubjects: number;
    subjectsCovered: string[];
    topSubjectsByActivity: Array<{ subjectName: string; activityCount: number; activeDays: number }>;
    strongestSubjects: string[];
    improvingSubjects: string[];
    subjectsNeedingAttention: string[];
  };
  attendanceAndStudyTime: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    attendanceRecordedDays: number;
    totalStudyMinutes: number;
    totalStudyHours: number;
    daysWithStudyTime: number;
    averageStudyHoursPerDay: number | null;
  };
  learningActivity: {
    dailyActivity: Array<{
      date: string;
      activityCount: number;
      subjectCount: number;
      subjects: string[];
      intensity: IntensityType;
    }>;
    weeklyActivity: Array<{
      weekStart: string;
      weekEnd: string;
      activeDays: number;
      activityCount: number;
      subjectCount: number;
    }>;
    longestActiveStreak: number;
    longestInactiveStreak: number;
    averageActiveDaysPerWeek: number;
  };
  subjectStats: Array<{
    subjectName: string;
    activeDays: number;
    activityCount: number;
    paperCount: number;
    examCount: number;
    averageScore: number | null;
    latestScore: number | null;
    firstScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    improvement: number | null;
    trend: TrendType;
    evidence: string[];
  }>;
  scoreTrends: Array<{
    subjectName: string;
    points: Array<{
      date: string;
      score: number;
      maxScore: number | null;
      percentage: number | null;
      source: 'paper' | 'exam';
      title: string | null;
    }>;
  }>;
  subjectDistribution: Array<{
    subjectName: string;
    activityCount: number;
    activeDays: number;
    percentageOfTotalActivity: number;
  }>;
  examSummary: {
    exams: Array<{
      examName: string | null;
      date: string;
      subjects: Array<{
        subjectName: string;
        score: number | null;
        maxScore: number | null;
        percentage: number | null;
      }>;
    }>;
    overallAveragePercentage: number | null;
    bestExamSubject: string | null;
    weakestExamSubject: string | null;
  };
  paperSummary: {
    papers: Array<{
      title: string | null;
      date: string;
      subjectName: string;
      score: number | null;
      maxScore: number | null;
      percentage: number | null;
      goodPoints: string | null;
      improvementPoints: string | null;
    }>;
    overallAveragePercentage: number | null;
  };
  recurringPatterns: {
    strengths: Array<{ label: string; count: number; evidence: string[] }>;
    weaknesses: Array<{ label: string; count: number; evidence: string[] }>;
    learningHabits: Array<{ label: string; count: number; evidence: string[] }>;
  };
  aiGuidance: {
    suggestedStudentProfileLabel: string;
    summaryBullets: string[];
    cautionNotes: string[];
    dataQualityNotes: string[];
  };
  englishAnalytics: {
    hasEnglishData: boolean;
    subjectNamesMatched: string[];
    dateRange: {
      startDate: string;
      endDate: string;
    };
    skillBreakdown: Record<
      EnglishSkillKey,
      {
        key: EnglishSkillKey;
        label: string;
        activityCount: number;
        recordCount: number;
        scoreRecordCount: number;
        averageScore: number | null;
        highestScore: number | null;
        latestScore: number | null;
        firstScore: number | null;
        improvement: number | null;
        trend: TrendType;
        scorePoints: EnglishScorePoint[];
        evidence: string[];
      }
    >;
    overallEnglishScoreTrend: {
      points: EnglishScorePoint[];
      averageScore: number | null;
      trend: TrendType;
    };
    vocabularyStats: {
      vocabularyItemsCount: number | null;
      sentenceItemsCount: number | null;
      totalLanguageItemsCount: number | null;
      recordsWithVocabulary: number;
      recordsWithSentences: number;
      evidence: string[];
      dataQualityNotes: string[];
    };
    customTaskStats: Array<{
      key: string;
      displayName: string;
      completedCount: number;
      scoreRecordCount: number;
      averageScore: number | null;
      latestScore: number | null;
      evidence: string[];
    }>;
  };
};

type BuildParams = {
  student: StudentLike | null | undefined;
  startDate: string;
  endDate: string;
  dailyProgress: DailyProgressLike[] | null | undefined;
  weeklyReports: WeeklyReportLike[] | null | undefined;
  papers: PaperLike[] | null | undefined;
  exams: ExamLike[] | null | undefined;
  previousQuarterSummary?: unknown;
  quarterlySummaries?: unknown[];
  reportType: ReportType;
};

type ScorePoint = {
  subjectName: string;
  date: string;
  score: number;
  maxScore: number | null;
  percentage: number | null;
  source: 'paper' | 'exam';
  title: string | null;
};

type SubjectCounter = {
  activityCount: number;
  activeDaysSet: Set<string>;
  paperCount: number;
  examCount: number;
};

const MS_PER_DAY = 86_400_000;
const MAX_SAFE_SCORE = 500;
const MAX_SAFE_PERCENTAGE = 100;
const MAX_SAFE_COUNT = 500;
const MAX_SCORE_POINTS_PER_SUBJECT = 30;
const MAX_SCORE_POINTS_PER_SKILL = 30;

const round2 = (v: number) => Math.round(v * 100) / 100;

const parseYmd = (input: unknown): string | null => {
  if (input instanceof Date) {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.getUTCDate()).padStart(2, '0');
    return parseDateString(`${y}-${m}-${d}`);
  }
  return parseDateString(input);
};

const toUtc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const daysBetweenInclusive = (startDate: string, endDate: string) =>
  Math.round((toUtc(endDate).getTime() - toUtc(startDate).getTime()) / MS_PER_DAY) + 1;

const enumerateDatesInclusive = (startDate: string, endDate: string) => {
  const out: string[] = [];
  const start = toUtc(startDate).getTime();
  const end = toUtc(endDate).getTime();
  for (let t = start; t <= end; t += MS_PER_DAY) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
};

const getWeekStartSunday = (ymd: string) => {
  const base = toUtc(ymd);
  const shift = base.getUTCDay();
  const start = new Date(base.getTime() - shift * MS_PER_DAY);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, '0');
  const d = String(start.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (ymd: string, days: number) => {
  const d = new Date(toUtc(ymd).getTime() + days * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toNumOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const asString = String(value).trim();
  if (!asString) return null;
  if (/^-?\d+(\.\d+)?$/.test(asString)) {
    const n = Number(asString);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const parseScoreAndMax = (
  scoreRaw: unknown,
  maxRaw: unknown,
): { score: number | null; maxScore: number | null; fromSlash: boolean } => {
  const scoreNum = toNumOrNull(scoreRaw);
  let maxNum = toNumOrNull(maxRaw);
  let score = scoreNum;
  let fromSlash = false;
  if (score === null && typeof scoreRaw === 'string') {
    const m = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(scoreRaw.trim());
    if (m) {
      score = Number(m[1]);
      if (maxNum === null) maxNum = Number(m[2]);
      fromSlash = true;
    }
  }
  if (maxNum !== null && (maxNum <= 0 || maxNum > MAX_SAFE_SCORE)) maxNum = null;
  if (score !== null && (score < 0 || score > MAX_SAFE_SCORE)) score = null;
  return { score, maxScore: maxNum, fromSlash };
};

const calcPercentage = (
  score: number | null,
  maxScore: number | null,
): { percentage: number | null; inferredFrom100: boolean } => {
  if (score === null) return { percentage: null, inferredFrom100: false };
  if (maxScore !== null && maxScore > 0) {
    const pct = round2((score / maxScore) * 100);
    if (!Number.isFinite(pct) || pct < 0 || pct > MAX_SAFE_PERCENTAGE) {
      return { percentage: null, inferredFrom100: false };
    }
    return { percentage: pct, inferredFrom100: false };
  }
  if (score >= 0 && score <= 100) {
    return { percentage: round2(score), inferredFrom100: true };
  }
  return { percentage: null, inferredFrom100: false };
};

const normalizeSubjectName = (raw: unknown): string | null => {
  const text = String(raw || '').trim();
  if (!text) return null;
  return text;
};

const normalizeMatchText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEnglishSubjectName = (raw: unknown) => {
  const s = normalizeMatchText(raw);
  if (!s) return false;
  return (
    s === 'english' ||
    s.includes(' english ') ||
    s.includes('english') ||
    s.includes('英文') ||
    s.includes('英语')
  );
};

const ENGLISH_SKILL_LABELS: Record<EnglishSkillKey, string> = {
  editing: 'Editing',
  composition: '作文',
  readingComprehension: '阅读理解',
  grammar: '语法',
  vocabulary: '词汇',
  sentences: '句子',
};

const SKILL_KEYWORDS: Record<EnglishSkillKey, string[]> = {
  editing: ['editing', 'edit', '改错', '语篇改错', 'proofread', 'proofreading'],
  composition: [
    'composition',
    'compo',
    'essay',
    'writing',
    '作文',
    '写作',
    'narrative',
    'argumentative',
    'situational writing',
    'continuous writing',
    'summary writing',
  ],
  readingComprehension: [
    'reading comprehension',
    'comprehension',
    'reading',
    'cloze',
    'passage',
    '阅读理解',
    '阅读',
    '完形填空',
  ],
  grammar: [
    'grammar',
    'tense',
    'tenses',
    'sentence structure',
    'punctuation',
    '语法',
    '时态',
    '句型',
    '标点',
  ],
  vocabulary: [
    'vocabulary',
    'vocab',
    'words',
    'word',
    'spelling',
    'dictation',
    '词汇',
    '单词',
    '背词',
    '默写',
    '拼写',
  ],
  sentences: ['sentence', 'sentences', 'phrases', '句子', '短语', '句型', '好句', '佳句'],
};

const classifyEnglishActivity = (textRaw: unknown): EnglishSkillKey[] => {
  const text = normalizeMatchText(textRaw);
  if (!text) return [];
  const out: EnglishSkillKey[] = [];
  const hasKeyword = (skills: string[]) => skills.some((k) => text.includes(normalizeMatchText(k)));
  if (hasKeyword(SKILL_KEYWORDS.editing)) out.push('editing');
  if (hasKeyword(SKILL_KEYWORDS.composition)) out.push('composition');
  if (hasKeyword(SKILL_KEYWORDS.readingComprehension)) out.push('readingComprehension');
  if (hasKeyword(SKILL_KEYWORDS.grammar)) out.push('grammar');
  if (hasKeyword(SKILL_KEYWORDS.vocabulary)) out.push('vocabulary');
  if (hasKeyword(SKILL_KEYWORDS.sentences)) out.push('sentences');
  return out;
};

const collectTextFields = (obj: Record<string, unknown>, keys: string[]) =>
  keys
    .map((key) => obj[key])
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v))
    .map((v) => v.trim())
    .filter(Boolean);

const normalizeCustomEnglishTasks = (raw: unknown): CustomEnglishTaskLike[] => {
  if (!Array.isArray(raw)) return [];
  const tasks: CustomEnglishTaskLike[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key || '').trim().toLowerCase();
    const displayName = String(row.displayName || row.chineseName || row.englishName || row.key || '').trim();
    if (!key && !displayName) continue;
    const practiceCount = Number(row.practiceCount ?? 0);
    const parsed = parseScoreAndMax(row.score, row.maxScore);
    const problems = String(row.problems || '').trim();
    const exercises = Array.isArray(row.exercises)
      ? row.exercises
          .map((ex) => {
            if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return null;
            const exRow = ex as Record<string, unknown>;
            const exParsed = parseScoreAndMax(exRow.score, exRow.totalScore ?? exRow.maxScore ?? row.maxScore);
            return {
              score: exParsed.score,
              maxScore: exParsed.maxScore,
              problems: String(exRow.problems || '').trim(),
            };
          })
          .filter((ex): ex is { score: number | null; maxScore: number | null; problems: string } => !!ex)
      : [];
    const completed = row.completed === true;
    tasks.push({
      key: key || displayName.toLowerCase().replace(/\s+/g, '_'),
      displayName,
      practiceCount: Number.isFinite(practiceCount) && practiceCount > 0 ? Math.floor(practiceCount) : 0,
      score: parsed.score,
      maxScore: parsed.maxScore,
      problems,
      exercises,
      completed,
    });
  }
  return tasks;
};

const CANONICAL_ENGLISH_TASK_KEYS = new Set([
  'editing',
  'reading',
  'readingcomprehension',
  'grammar',
  'vocab',
  'vocabulary',
  'recitation',
  'essay',
  'composition',
]);

const extractCountFromPatterns = (textRaw: unknown, patterns: RegExp[]): number | null => {
  const text = String(textRaw || '');
  if (!text.trim()) return null;
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_SAFE_COUNT) return Math.floor(n);
  }
  return null;
};

const extractVocabularyCount = (textRaw: unknown) =>
  extractCountFromPatterns(textRaw, [
    /(?:词汇量|vocabulary count)\s*[:：]?\s*(\d{1,5})/i,
    /(?:vocabulary|vocab|words?|单词|词汇|背词|拼写|默写)\s*[:：]?\s*(\d{1,4})/i,
    /(\d{1,4})\s*(?:个|条)?\s*(?:单词|词汇|words?|vocabulary|vocab)/i,
    /(?:learn(?:ed|t)?|复习|背诵|学习)\s*(\d{1,4})\s*(?:个|条)?\s*(?:单词|词汇|words?)/i,
  ]);

const extractSentenceCount = (textRaw: unknown) =>
  extractCountFromPatterns(textRaw, [
    /(?:sentences?|sentence count|phrases?|句子|短语|句型)\s*[:：]?\s*(\d{1,4})/i,
    /(\d{1,4})\s*(?:句|条|个)?\s*(?:sentences?|phrases?|句子|短语|句型)/i,
    /(?:背诵|练习|复习)\s*(\d{1,4})\s*(?:句|条|个)\s*(?:句子|短语|句型)/i,
  ]);

const intensityFromCount = (count: number): IntensityType => {
  if (count <= 0) return 'none';
  if (count === 1) return 'low';
  if (count <= 3) return 'medium';
  return 'high';
};

const clipEvidence = (value: unknown, maxLen = 60) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
};

const toTimeMinutes = (value: unknown): number | null => {
  const text = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hh, mm] = text.split(":").map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
};

const pickTrend = (first: number | null, latest: number | null, count: number): TrendType => {
  if (count < 2 || first === null || latest === null) return 'insufficient_data';
  const diff = latest - first;
  if (diff >= 5) return 'improving';
  if (diff <= -5) return 'declining';
  return 'stable';
};

const profileLabel = (
  activeRate: number,
  improvingCount: number,
  decliningCount: number,
  lowAverageCount: number,
  hasEnoughData: boolean,
) => {
  if (!hasEnoughData) return '数据不足，暂不判断';
  if (decliningCount > 0 || lowAverageCount > 0) return '需要重点跟进型';
  if (improvingCount > 0 && activeRate >= 0.6) return '稳步进步型';
  if (activeRate >= 0.75) return '学习投入较高型';
  if (improvingCount === 0 && decliningCount === 0) return '表现稳定型';
  return '成绩波动型';
};

const buildPatternCounts = (
  reports: WeeklyReportLike[],
  keywords: Array<{ label: string; words: string[] }>,
) => {
  const rows: Array<{ label: string; count: number; evidence: string[] }> = [];
  for (const k of keywords) {
    let count = 0;
    const evidence: string[] = [];
    for (const r of reports) {
      const parts: string[] = [];
      if (r.summary) parts.push(String(r.summary));
      if (Array.isArray(r.strengths)) parts.push(r.strengths.join('；'));
      if (Array.isArray(r.areasToImprove)) parts.push(r.areasToImprove.join('；'));
      if (r.teacherNotes) parts.push(String(r.teacherNotes));
      if (r.nextWeekFocus) parts.push(String(r.nextWeekFocus));
      const fullText = parts.join(' ').trim();
      if (!fullText) continue;
      const hit = k.words.some((w) => fullText.includes(w));
      if (!hit) continue;
      count += 1;
      if (evidence.length < 3) evidence.push(clipEvidence(fullText));
    }
    if (count > 0) rows.push({ label: k.label, count, evidence });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, 8);
};

const STRENGTH_KEYWORDS = [
  { label: '认真', words: ['认真'] },
  { label: '稳定', words: ['稳定'] },
  { label: '进步', words: ['进步', '有提升', '提升'] },
  { label: '主动', words: ['主动', '自主'] },
  { label: '完成度高', words: ['完成度高', '按时完成'] },
  { label: '理解较好', words: ['理解较好'] },
  { label: '准确率提高', words: ['准确率提高'] },
  { label: '表现良好', words: ['表现良好'] },
];

const WEAKNESS_KEYWORDS = [
  { label: '粗心', words: ['粗心'] },
  { label: '不稳定', words: ['不稳定'] },
  { label: '需要加强', words: ['需要加强'] },
  { label: '需要复习', words: ['需要复习'] },
  { label: '词汇', words: ['词汇'] },
  { label: '推理', words: ['推理'] },
  { label: '表达', words: ['表达'] },
  { label: '计算', words: ['计算'] },
  { label: '概念不牢', words: ['概念不牢', '掌握不牢'] },
  { label: '注意力', words: ['注意力'] },
  { label: '容易出错', words: ['容易出错'] },
];

const HABIT_KEYWORDS = [
  { label: '按时完成', words: ['按时完成'] },
  { label: '连续学习', words: ['连续学习'] },
  { label: '复习习惯', words: ['复习'] },
  { label: '自主学习', words: ['自主'] },
  { label: '依赖提醒', words: ['依赖提醒'] },
  { label: '拖延', words: ['拖延'] },
  { label: '专注', words: ['专注'] },
  { label: '学习习惯', words: ['习惯'] },
];

type MutableEnglishSkill = {
  key: EnglishSkillKey;
  label: string;
  activityCount: number;
  recordCount: number;
  scorePoints: EnglishScorePoint[];
  evidence: string[];
};

export function buildStudentReportAnalytics(params: BuildParams): StudentReportAnalytics {
  const notesSet = new Set<string>();
  const cautionSet = new Set<string>();

  const now = new Date().toISOString();
  let startDate = parseYmd(params.startDate);
  let endDate = parseYmd(params.endDate);
  if (!startDate) {
    notesSet.add(`Invalid startDate: ${String(params.startDate)}`);
    startDate = endDate || '1970-01-01';
  }
  if (!endDate) {
    notesSet.add(`Invalid endDate: ${String(params.endDate)}`);
    endDate = startDate || '1970-01-01';
  }
  if (startDate > endDate) {
    notesSet.add('startDate is later than endDate; swapped for analytics safety');
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  const totalCalendarDays = daysBetweenInclusive(startDate, endDate);
  const allDates = enumerateDatesInclusive(startDate, endDate);
  const dailyRows = Array.isArray(params.dailyProgress) ? params.dailyProgress : [];
  const weeklyRows = Array.isArray(params.weeklyReports) ? params.weeklyReports : [];
  const paperRows = Array.isArray(params.papers) ? params.papers : [];
  const examRows = Array.isArray(params.exams) ? params.exams : [];

  if (!dailyRows.length) notesSet.add('No dailyProgress records in this period');
  if (!weeklyRows.length) notesSet.add('No weeklyReports records in this period');
  if (!paperRows.length) notesSet.add('No papers records in this period');
  if (!examRows.length) notesSet.add('No exams records in this period');
  if (params.reportType === 'quarterly' && !params.previousQuarterSummary) {
    cautionSet.add('缺少上一学期总结，环比观察可能不完整');
  }
  if (params.reportType === 'yearly' && (!Array.isArray(params.quarterlySummaries) || !params.quarterlySummaries.length)) {
    cautionSet.add('缺少学期总结数据，年度阶段性回顾可能不完整');
  }

  const dayMap = new Map<string, { activityCount: number; subjects: Set<string> }>();
  const subjectCounters = new Map<string, SubjectCounter>();
  const englishSkillMap = new Map<EnglishSkillKey, MutableEnglishSkill>();
  (Object.keys(ENGLISH_SKILL_LABELS) as EnglishSkillKey[]).forEach((key) => {
    englishSkillMap.set(key, {
      key,
      label: ENGLISH_SKILL_LABELS[key],
      activityCount: 0,
      recordCount: 0,
      scorePoints: [],
      evidence: [],
    });
  });
  const englishSubjectNameSet = new Set<string>();
  const customEnglishTaskMap = new Map<
    string,
    {
      key: string;
      displayName: string;
      completedCount: number;
      scores: number[];
      latestScore: number | null;
      evidence: string[];
    }
  >();
  const overallEnglishPoints: EnglishScorePoint[] = [];
  const englishVocabularyEvidence: string[] = [];
  const englishVocabularyNotes: string[] = [];
  let recordsWithVocabulary = 0;
  let recordsWithSentences = 0;
  let vocabularyItemsCount = 0;
  let sentenceItemsCount = 0;
  let hasExplicitVocabularyCount = false;
  let hasExplicitSentenceCount = false;
  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let totalStudyMinutes = 0;
  let daysWithStudyTime = 0;

  const addEnglishEvidence = (skillKey: EnglishSkillKey, text: string) => {
    const entry = englishSkillMap.get(skillKey);
    if (!entry || !text) return;
    if (entry.evidence.includes(text)) return;
    if (entry.evidence.length < 3) entry.evidence.push(text);
  };

  const addVocabularyEvidence = (text: string) => {
    if (!text) return;
    if (englishVocabularyEvidence.includes(text)) return;
    if (englishVocabularyEvidence.length < 4) englishVocabularyEvidence.push(text);
  };

  const observeEnglishSkill = (
    skillKey: EnglishSkillKey,
    params: {
      activityDelta?: number;
      recordHit?: boolean;
      scorePoint?: EnglishScorePoint | null;
      evidence?: string;
    },
  ) => {
    const entry = englishSkillMap.get(skillKey);
    if (!entry) return;
    const delta = Number(params.activityDelta ?? 0);
    if (Number.isFinite(delta) && delta > 0) entry.activityCount += delta;
    if (params.recordHit) entry.recordCount += 1;
    if (params.scorePoint) {
      entry.scorePoints.push(params.scorePoint);
    }
    if (params.evidence) addEnglishEvidence(skillKey, params.evidence);
  };
  for (const d of allDates) {
    dayMap.set(d, { activityCount: 0, subjects: new Set<string>() });
  }

  for (const row of dailyRows) {
    const date = parseYmd(row?.date);
    if (!date) {
      notesSet.add('Skipped one dailyProgress record due to invalid/missing date');
      continue;
    }
    if (date < startDate || date > endDate) continue;
    const attendanceRaw = String(row?.attendance || "").trim().toLowerCase();
    if (attendanceRaw === "present") presentDays += 1;
    else if (attendanceRaw === "late") lateDays += 1;
    else if (attendanceRaw === "absent" || attendanceRaw.includes("缺席")) absentDays += 1;
    const startMinute = toTimeMinutes(row?.attendanceStart);
    const endMinute = toTimeMinutes(row?.attendanceEnd);
    if (startMinute !== null && endMinute !== null && endMinute > startMinute) {
      const duration = endMinute - startMinute;
      // Keep a sane bound to avoid malformed time inflating analytics.
      if (duration <= 12 * 60) {
        totalStudyMinutes += duration;
        daysWithStudyTime += 1;
      } else {
        notesSet.add(`Ignored unrealistic study duration on ${date}`);
      }
    }
    const day = dayMap.get(date) || { activityCount: 0, subjects: new Set<string>() };
    const activities = Array.isArray(row?.activities) ? row.activities : [];
    if (!Array.isArray(row?.activities)) notesSet.add(`dailyProgress ${date} has non-array activities`);

    for (const a of activities) {
      if (!a || typeof a !== 'object') {
        day.activityCount += 1;
        continue;
      }
      const activity = a as Record<string, unknown>;
      const subject =
        normalizeSubjectName(activity.subjectDisplayName) ||
        normalizeSubjectName(activity.subjectName) ||
        normalizeSubjectName(activity.subject);
      if (!subject) {
        notesSet.add(`Missing subjectName in dailyProgress activity on ${date}`);
        day.activityCount += 1;
        continue;
      }
      day.activityCount += 1;
      day.subjects.add(subject);
      const counter = subjectCounters.get(subject) || {
        activityCount: 0,
        activeDaysSet: new Set<string>(),
        paperCount: 0,
        examCount: 0,
      };
      counter.activityCount += 1;
      counter.activeDaysSet.add(date);
      subjectCounters.set(subject, counter);

      if (isEnglishSubjectName(subject) || activity.type === 'english' || activity.english) {
        englishSubjectNameSet.add(subject);
        const evidenceBase = clipEvidence(
          [
            subject,
            ...collectTextFields(activity, [
              'taskSummary',
              'practiceProgress',
              'description',
              'remarks',
              'content',
              'title',
              'summary',
            ]),
          ].join(' | '),
          90,
        );

        const activitySkills = new Set<EnglishSkillKey>();
        classifyEnglishActivity(evidenceBase).forEach((k) => activitySkills.add(k));
        const countedSkillRecords = new Set<EnglishSkillKey>();

        const english = normalizeEnglishFields(activity.english ?? {});
        const scoredSections: Array<{
          key: EnglishSkillKey;
          score: number | null;
          total: number | null;
          count: number;
          exercises: Array<{ score: number | null; totalScore?: number | null; maxScore?: number | null; problems: string }>;
          title: string;
          textualHint: string;
        }> = [
          {
            key: 'editing',
            score: english.editing.score,
            total: english.editing.totalScore,
            count: english.editing.exerciseCount,
            exercises: Array.isArray(english.editing.exercises) ? english.editing.exercises : [],
            title: 'English Editing',
            textualHint: english.editing.text,
          },
          {
            key: 'readingComprehension',
            score: english.reading.score,
            total: english.reading.totalScore,
            count: english.reading.articleCount,
            exercises: Array.isArray(english.reading.exercises) ? english.reading.exercises : [],
            title: 'English Reading',
            textualHint: english.reading.text,
          },
          {
            key: 'grammar',
            score: english.grammar.score,
            total: english.grammar.totalScore,
            count: english.grammar.exerciseCount,
            exercises: Array.isArray(english.grammar.exercises) ? english.grammar.exercises : [],
            title: 'English Grammar',
            textualHint: english.grammar.text,
          },
          {
            key: 'composition',
            score: english.essay.score,
            total: english.essay.totalScore,
            count: english.essay.completed ? 1 : 0,
            exercises: [],
            title: english.essay.title ? `English Essay: ${english.essay.title}` : 'English Essay',
            textualHint: `${english.essay.title || ''} ${english.essay.text || ''}`.trim(),
          },
        ];

        for (const section of scoredSections) {
          const hasExerciseScore = section.exercises.some((ex) => toNumOrNull(ex?.score) !== null);
          const hasSignal = section.count > 0 || !!section.textualHint || section.score !== null || hasExerciseScore;
          if (!hasSignal) continue;
          activitySkills.add(section.key);
          const exercisePoints = section.exercises
            .map((ex) => {
              const parsed = parseScoreAndMax(ex?.score, ex?.totalScore ?? ex?.maxScore ?? section.total);
              const pct = calcPercentage(parsed.score, parsed.maxScore);
              if (parsed.score === null) return null;
              return {
                date,
                score: parsed.score,
                maxScore: parsed.maxScore,
                percentage: pct.percentage,
                source: 'dailyProgress' as const,
                title: section.title,
              };
            })
            .filter((row): row is EnglishScorePoint => !!row);
          const fallbackParsed = parseScoreAndMax(section.score, section.total);
          const fallbackPct = calcPercentage(fallbackParsed.score, fallbackParsed.maxScore);
          const fallbackPoint =
            fallbackParsed.score !== null
              ? {
                  date,
                  score: fallbackParsed.score,
                  maxScore: fallbackParsed.maxScore,
                  percentage: fallbackPct.percentage,
                  source: 'dailyProgress' as const,
                  title: section.title,
                }
              : null;
          const scorePoints = exercisePoints.length ? exercisePoints : (fallbackPoint ? [fallbackPoint] : []);
          scorePoints.forEach((scorePoint) => {
            overallEnglishPoints.push(scorePoint);
            observeEnglishSkill(section.key, {
              activityDelta: 0,
              recordHit: false,
              scorePoint,
              evidence: evidenceBase || clipEvidence(section.textualHint || section.title),
            });
          });
          observeEnglishSkill(section.key, {
            activityDelta: section.count > 0 ? section.count : 1,
            recordHit: true,
            scorePoint: null,
            evidence: evidenceBase || clipEvidence(section.textualHint || section.title),
          });
          countedSkillRecords.add(section.key);
        }

        const customTasks = normalizeCustomEnglishTasks(activity.englishTasks);
        for (const task of customTasks) {
          if (CANONICAL_ENGLISH_TASK_KEYS.has(String(task.key || '').toLowerCase())) {
            continue;
          }
          const taskEvidence = clipEvidence(
            [task.displayName, task.problems, evidenceBase].filter(Boolean).join(' | '),
            90,
          );
          const taskSkills = classifyEnglishActivity(`${task.key} ${task.displayName} ${task.problems}`);
          const primarySkill = taskSkills[0] || null;
          if (primarySkill) activitySkills.add(primarySkill);
          const parsedScore = parseScoreAndMax(task.score, task.maxScore);
          const fallbackScorePoint =
            parsedScore.score !== null
              ? {
                  date,
                  score: parsedScore.score,
                  maxScore: parsedScore.maxScore,
                  percentage: calcPercentage(parsedScore.score, parsedScore.maxScore).percentage,
                  source: 'dailyProgress' as const,
                  title: task.displayName || 'English Task',
                }
              : null;
          const exerciseScorePoints = task.exercises
            .map((ex, exIndex) => {
              if (ex.score === null) return null;
              const exPct = calcPercentage(ex.score, ex.maxScore);
              return {
                date,
                score: ex.score,
                maxScore: ex.maxScore,
                percentage: exPct.percentage,
                source: 'dailyProgress' as const,
                title: `${task.displayName || 'English Task'} ${exIndex + 1}`,
              };
            })
            .filter((row): row is EnglishScorePoint => !!row);
          const scorePoints = exerciseScorePoints.length
            ? exerciseScorePoints
            : (fallbackScorePoint ? [fallbackScorePoint] : []);
          scorePoints.forEach((scorePoint) => overallEnglishPoints.push(scorePoint));
          if (primarySkill) {
            scorePoints.forEach((scorePoint) => {
              observeEnglishSkill(primarySkill, {
                activityDelta: 0,
                recordHit: false,
                scorePoint,
                evidence: taskEvidence || evidenceBase,
              });
            });
            observeEnglishSkill(primarySkill, {
              activityDelta: task.practiceCount > 0 ? task.practiceCount : task.completed ? 1 : 0,
              recordHit: true,
              scorePoint: null,
              evidence: taskEvidence || evidenceBase,
            });
            countedSkillRecords.add(primarySkill);
          } else if (task.practiceCount > 0 || task.completed || task.problems || scorePoints.length) {
            // No exact skill match: still mark a generic English activity.
            scorePoints.forEach((scorePoint) => {
              observeEnglishSkill('composition', {
                activityDelta: 0,
                recordHit: false,
                scorePoint,
                evidence: taskEvidence || evidenceBase,
              });
            });
            observeEnglishSkill('composition', {
              activityDelta: task.practiceCount > 0 ? task.practiceCount : task.completed ? 1 : 0,
              recordHit: true,
              scorePoint: null,
              evidence: taskEvidence || evidenceBase,
            });
            countedSkillRecords.add('composition');
          }
          if (taskSkills.includes('vocabulary') && task.practiceCount > 0) {
            hasExplicitVocabularyCount = true;
            vocabularyItemsCount += task.practiceCount;
            recordsWithVocabulary += 1;
            addVocabularyEvidence(`词汇记录 ${date}：约 ${task.practiceCount} 项`);
          }
          if (taskSkills.includes('sentences') && task.practiceCount > 0) {
            hasExplicitSentenceCount = true;
            sentenceItemsCount += task.practiceCount;
            recordsWithSentences += 1;
            addVocabularyEvidence(`句子记录 ${date}：约 ${task.practiceCount} 项`);
          }

          const customKey = `${task.key || task.displayName || 'custom'}::${task.displayName || task.key || '自定义任务'}`;
          const currentCustom = customEnglishTaskMap.get(customKey) || {
            key: task.key || 'custom',
            displayName: task.displayName || task.key || '自定义任务',
            completedCount: 0,
            scores: [],
            latestScore: null,
            evidence: [],
          };
          const completedDelta = task.practiceCount > 0 ? task.practiceCount : task.completed ? 1 : 0;
          currentCustom.completedCount += completedDelta;
          const taskPercentages = scorePoints
            .map((scorePoint) => scorePoint.percentage)
            .filter((percentage): percentage is number => percentage !== null);
          taskPercentages.forEach((percentage) => {
            currentCustom.scores.push(percentage);
            currentCustom.latestScore = percentage;
          });
          if (taskEvidence && currentCustom.evidence.length < 3 && !currentCustom.evidence.includes(taskEvidence)) {
            currentCustom.evidence.push(taskEvidence);
          }
          customEnglishTaskMap.set(customKey, currentCustom);
        }

        const vocabCount = Number(english.vocab.vocabularyWordCount || 0);
        const sentenceCount = Number(english.vocab.vocabularySentenceCount || 0);
        const vocabText = `${english.vocab.text || ''} ${english.recitation.text || ''}`.trim();
        const vocabFromText = extractVocabularyCount(vocabText || evidenceBase);
        const sentenceFromText = extractSentenceCount(vocabText || evidenceBase);
        const resolvedVocabCount = vocabCount > 0 ? vocabCount : vocabFromText ?? 0;
        const resolvedSentenceCount = sentenceCount > 0 ? sentenceCount : sentenceFromText ?? 0;
        const vocabRecordHit =
          resolvedVocabCount > 0 ||
          activitySkills.has('vocabulary') ||
          classifyEnglishActivity(vocabText).includes('vocabulary');
        const sentenceRecordHit =
          resolvedSentenceCount > 0 ||
          activitySkills.has('sentences') ||
          classifyEnglishActivity(vocabText).includes('sentences');

        if (vocabRecordHit) {
          recordsWithVocabulary += 1;
          observeEnglishSkill('vocabulary', {
            activityDelta: resolvedVocabCount > 0 ? resolvedVocabCount : 1,
            recordHit: true,
            evidence: evidenceBase,
          });
          countedSkillRecords.add('vocabulary');
        }
        if (sentenceRecordHit) {
          recordsWithSentences += 1;
          observeEnglishSkill('sentences', {
            activityDelta: resolvedSentenceCount > 0 ? resolvedSentenceCount : 1,
            recordHit: true,
            evidence: evidenceBase,
          });
          countedSkillRecords.add('sentences');
        }

        if (vocabCount > 0 || (vocabFromText ?? 0) > 0) {
          hasExplicitVocabularyCount = true;
          vocabularyItemsCount += resolvedVocabCount;
          addVocabularyEvidence(`词汇记录 ${date}：约 ${resolvedVocabCount} 项`);
        } else if (vocabRecordHit) {
          addVocabularyEvidence(`词汇记录 ${date}：有练习但未明确数量`);
        }

        if (sentenceCount > 0 || (sentenceFromText ?? 0) > 0) {
          hasExplicitSentenceCount = true;
          sentenceItemsCount += resolvedSentenceCount;
          addVocabularyEvidence(`句子记录 ${date}：约 ${resolvedSentenceCount} 项`);
        } else if (sentenceRecordHit) {
          addVocabularyEvidence(`句子记录 ${date}：有练习但未明确数量`);
        }

        for (const skill of activitySkills) {
          if (countedSkillRecords.has(skill)) continue;
          observeEnglishSkill(skill, { activityDelta: 1, recordHit: true, evidence: evidenceBase });
        }
      }
    }
    dayMap.set(date, day);
  }

  const dailyActivity = allDates.map((date) => {
    const day = dayMap.get(date) || { activityCount: 0, subjects: new Set<string>() };
    const subjects = Array.from(day.subjects).sort();
    return {
      date,
      activityCount: day.activityCount,
      subjectCount: subjects.length,
      subjects,
      intensity: intensityFromCount(day.activityCount),
    };
  });

  const activeDays = dailyActivity.filter((d) => d.activityCount > 0).length;
  const activeRate = totalCalendarDays > 0 ? round2(activeDays / totalCalendarDays) : 0;
  const attendanceRecordedDays = presentDays + lateDays + absentDays;
  const totalStudyHours = round2(totalStudyMinutes / 60);
  const averageStudyHoursPerDay = daysWithStudyTime > 0
    ? round2(totalStudyHours / daysWithStudyTime)
    : null;

  let longestActiveStreak = 0;
  let longestInactiveStreak = 0;
  let currentActive = 0;
  let currentInactive = 0;
  for (const day of dailyActivity) {
    if (day.activityCount > 0) {
      currentActive += 1;
      currentInactive = 0;
    } else {
      currentInactive += 1;
      currentActive = 0;
    }
    if (currentActive > longestActiveStreak) longestActiveStreak = currentActive;
    if (currentInactive > longestInactiveStreak) longestInactiveStreak = currentInactive;
  }

  const weekMap = new Map<string, { activityCount: number; activeDays: number; subjects: Set<string> }>();
  for (const day of dailyActivity) {
    const weekStart = getWeekStartSunday(day.date);
    const bucket = weekMap.get(weekStart) || { activityCount: 0, activeDays: 0, subjects: new Set<string>() };
    bucket.activityCount += day.activityCount;
    if (day.activityCount > 0) bucket.activeDays += 1;
    for (const s of day.subjects) bucket.subjects.add(s);
    weekMap.set(weekStart, bucket);
  }
  const weeklyActivity = Array.from(weekMap.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([weekStart, bucket]) => ({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      activeDays: bucket.activeDays,
      activityCount: bucket.activityCount,
      subjectCount: bucket.subjects.size,
    }));
  const averageActiveDaysPerWeek = weeklyActivity.length
    ? round2(activeDays / weeklyActivity.length)
    : 0;

  const scorePoints: ScorePoint[] = [];
  const paperSummaryRows: StudentReportAnalytics['paperSummary']['papers'] = [];
  const examSummaryRows: StudentReportAnalytics['examSummary']['exams'] = [];
  const examPercentages: Array<{ subjectName: string; percentage: number }> = [];
  const paperPercentages: number[] = [];

  for (const p of paperRows) {
    const date = parseYmd(p?.date);
    if (!date) {
      notesSet.add('Skipped one paper due to invalid/missing date');
      continue;
    }
    if (date < startDate || date > endDate) continue;
    const subject = normalizeSubjectName(p?.subjectName);
    if (!subject) {
      notesSet.add(`Paper on ${date} missing subjectName`);
      continue;
    }
    const parsed = parseScoreAndMax(p?.score, p?.total);
    const score = parsed.score;
    const maxScore = parsed.maxScore;
    if (score !== null && maxScore === null) notesSet.add(`Paper ${subject} on ${date} missing maxScore`);
    const pct = calcPercentage(score, maxScore);
    if (pct.inferredFrom100) notesSet.add(`Paper ${subject} on ${date} uses score as percentage due to missing maxScore`);
    if (pct.percentage !== null) paperPercentages.push(pct.percentage);
    if (score !== null) {
      scorePoints.push({
        subjectName: subject,
        date,
        score,
        maxScore,
        percentage: pct.percentage,
        source: 'paper',
        title: p?.description ? String(p.description) : null,
      });
    }
    const counter = subjectCounters.get(subject) || {
      activityCount: 0,
      activeDaysSet: new Set<string>(),
      paperCount: 0,
      examCount: 0,
    };
    counter.paperCount += 1;
    subjectCounters.set(subject, counter);
    paperSummaryRows.push({
      title: p?.description ? String(p.description) : null,
      date,
      subjectName: subject,
      score,
      maxScore,
      percentage: pct.percentage,
      goodPoints: p?.strengths ? String(p.strengths) : null,
      improvementPoints: p?.improvements ? String(p.improvements) : null,
    });

    if (isEnglishSubjectName(subject)) {
      englishSubjectNameSet.add(subject);
      const paperText = [
        subject,
        p?.description ? String(p.description) : '',
        p?.strengths ? String(p.strengths) : '',
        p?.improvements ? String(p.improvements) : '',
      ]
        .join(' ')
        .trim();
      const skills = classifyEnglishActivity(paperText);
      const evidence = clipEvidence(`试卷 ${date}：${paperText || '英文科目'}`, 90);
      const scorePoint =
        score !== null
          ? {
              date,
              score,
              maxScore,
              percentage: pct.percentage,
              source: 'paper' as const,
              title: p?.description ? String(p.description) : 'English Paper',
            }
          : null;
      if (scorePoint) overallEnglishPoints.push(scorePoint);

      if (!skills.length) {
        // Keep this score in English overall trend even when skill is unclear.
      } else {
        for (const skill of skills) {
          observeEnglishSkill(skill, {
            activityDelta: 1,
            recordHit: true,
            scorePoint,
            evidence,
          });
        }
      }

      const vocabCount = extractVocabularyCount(paperText);
      const sentenceCount = extractSentenceCount(paperText);
      if (skills.includes('vocabulary')) {
        recordsWithVocabulary += 1;
        if (vocabCount !== null) {
          hasExplicitVocabularyCount = true;
          vocabularyItemsCount += vocabCount;
          addVocabularyEvidence(`词汇记录 ${date}：约 ${vocabCount} 项`);
        } else {
          addVocabularyEvidence(`词汇记录 ${date}：有练习但未明确数量`);
        }
      }
      if (skills.includes('sentences')) {
        recordsWithSentences += 1;
        if (sentenceCount !== null) {
          hasExplicitSentenceCount = true;
          sentenceItemsCount += sentenceCount;
          addVocabularyEvidence(`句子记录 ${date}：约 ${sentenceCount} 项`);
        } else {
          addVocabularyEvidence(`句子记录 ${date}：有练习但未明确数量`);
        }
      }
    }
  }

  for (const exam of examRows) {
    const date = parseYmd(exam?.examDate || exam?.date);
    if (!date) {
      notesSet.add('Skipped one exam due to invalid/missing examDate');
      continue;
    }
    if (date < startDate || date > endDate) continue;
    const subjectsRaw = Array.isArray(exam?.subjects) ? exam.subjects : [];
    const examSubjects: Array<{
      subjectName: string;
      score: number | null;
      maxScore: number | null;
      percentage: number | null;
    }> = [];
    for (const s of subjectsRaw) {
      const subject = normalizeSubjectName(s?.name);
      if (!subject) {
        notesSet.add(`Exam on ${date} has subject with missing name`);
        continue;
      }
      const parsed = parseScoreAndMax(s?.score, s?.maxScore ?? s?.total ?? s?.totalScore);
      const score = parsed.score;
      const maxScore = parsed.maxScore;
      if (score !== null && maxScore === null && !parsed.fromSlash) {
        notesSet.add(`Exam subject ${subject} on ${date} missing maxScore`);
      }
      const pct = calcPercentage(score, maxScore);
      if (pct.inferredFrom100) notesSet.add(`Exam subject ${subject} on ${date} uses score as percentage due to missing maxScore`);
      examSubjects.push({
        subjectName: subject,
        score,
        maxScore,
        percentage: pct.percentage,
      });
      if (pct.percentage !== null) {
        examPercentages.push({ subjectName: subject, percentage: pct.percentage });
      }
      if (score !== null) {
        scorePoints.push({
          subjectName: subject,
          date,
          score,
          maxScore,
          percentage: pct.percentage,
          source: 'exam',
          title: exam?.name ? String(exam.name) : null,
        });
      }
      const counter = subjectCounters.get(subject) || {
        activityCount: 0,
        activeDaysSet: new Set<string>(),
        paperCount: 0,
        examCount: 0,
      };
      counter.examCount += 1;
      subjectCounters.set(subject, counter);

      if (isEnglishSubjectName(subject)) {
        englishSubjectNameSet.add(subject);
        const examText = [exam?.name ? String(exam.name) : '', s?.scope ? String(s.scope) : '', subject]
          .join(' ')
          .trim();
        const skills = classifyEnglishActivity(examText);
        const scorePoint =
          score !== null
            ? {
                date,
                score,
                maxScore,
                percentage: pct.percentage,
                source: 'exam' as const,
                title: exam?.name ? String(exam.name) : 'English Exam',
              }
            : null;
        if (scorePoint) overallEnglishPoints.push(scorePoint);
        const evidence = clipEvidence(`考试 ${date}：${examText || '英文科目'}`, 90);
        if (!skills.length) {
          // Keep this score in English overall trend even when skill is unclear.
        } else {
          for (const skill of skills) {
            observeEnglishSkill(skill, {
              activityDelta: 1,
              recordHit: true,
              scorePoint,
              evidence,
            });
          }
        }
      }
    }
    examSummaryRows.push({
      examName: exam?.name ? String(exam.name) : null,
      date,
      subjects: examSubjects,
    });
  }

  const subjectsCovered = Array.from(subjectCounters.keys()).sort();
  const totalActivityCount = dailyActivity.reduce((sum, d) => sum + d.activityCount, 0);
  const topSubjectsByActivity = subjectsCovered
    .map((name) => {
      const c = subjectCounters.get(name)!;
      return { subjectName: name, activityCount: c.activityCount, activeDays: c.activeDaysSet.size };
    })
    .sort((a, b) => b.activityCount - a.activityCount || b.activeDays - a.activeDays);

  const subjectDistribution = topSubjectsByActivity.map((s) => ({
    subjectName: s.subjectName,
    activityCount: s.activityCount,
    activeDays: s.activeDays,
    percentageOfTotalActivity: totalActivityCount > 0 ? round2((s.activityCount / totalActivityCount) * 100) : 0,
  }));

  scorePoints.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? 1 : -1;
    if (a.source !== b.source) return a.source > b.source ? 1 : -1;
    return a.subjectName > b.subjectName ? 1 : -1;
  });

  const trendMap = new Map<string, ScorePoint[]>();
  for (const p of scorePoints) {
    const list = trendMap.get(p.subjectName) || [];
    list.push(p);
    if (list.length > MAX_SCORE_POINTS_PER_SUBJECT) {
      list.splice(0, list.length - MAX_SCORE_POINTS_PER_SUBJECT);
    }
    trendMap.set(p.subjectName, list);
  }
  const scoreTrends = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subjectName, points]) => ({
      subjectName,
      points: points.map((p) => ({
        date: p.date,
        score: p.score,
        maxScore: p.maxScore,
        percentage: p.percentage,
        source: p.source,
        title: p.title,
      })),
    }));

  const subjectStats = subjectsCovered.map((subjectName) => {
    const counters = subjectCounters.get(subjectName)!;
    const points = (trendMap.get(subjectName) || []).filter((p) => p.percentage !== null);
    const percentages = points.map((p) => p.percentage as number);
    const firstScore = percentages.length ? percentages[0] : null;
    const latestScore = percentages.length ? percentages[percentages.length - 1] : null;
    const averageScore = percentages.length
      ? round2(percentages.reduce((s, n) => s + n, 0) / percentages.length)
      : null;
    const highestScore = percentages.length ? Math.max(...percentages) : null;
    const lowestScore = percentages.length ? Math.min(...percentages) : null;
    const trend = pickTrend(firstScore, latestScore, percentages.length);
    const improvement = percentages.length < 2 || firstScore === null || latestScore === null
      ? null
      : round2(latestScore - firstScore);
    const evidence: string[] = [];
    for (const point of points.slice(-2)) {
      evidence.push(
        `${subjectName}：${point.date} ${point.source} ${round2(point.percentage as number)}%`,
      );
    }
    if (counters.activeDaysSet.size > 0) {
      evidence.push(`本周期内该科目有 ${counters.activeDaysSet.size} 天学习记录`);
    }
    return {
      subjectName,
      activeDays: counters.activeDaysSet.size,
      activityCount: counters.activityCount,
      paperCount: counters.paperCount,
      examCount: counters.examCount,
      averageScore,
      latestScore,
      firstScore,
      highestScore,
      lowestScore,
      improvement,
      trend,
      evidence: evidence.slice(0, 3),
    };
  });

  const withAverage = subjectStats.filter((s) => s.averageScore !== null);
  const strongestSubjects = (withAverage.length
    ? [...withAverage].sort((a, b) => (b.averageScore as number) - (a.averageScore as number)).map((s) => s.subjectName)
    : [...subjectStats].sort((a, b) => b.activityCount - a.activityCount).map((s) => s.subjectName)
  ).slice(0, 3);

  const improvingSubjects = subjectStats.filter((s) => s.trend === 'improving').map((s) => s.subjectName);

  const weaknessPatterns = buildPatternCounts(weeklyRows, WEAKNESS_KEYWORDS);
  const subjectsNeedingAttention = Array.from(
    new Set(
      subjectStats
        .filter((s) =>
          s.trend === 'declining' ||
          (s.averageScore !== null && s.averageScore < 60) ||
          (s.activeDays <= 1 && (s.paperCount > 0 || s.examCount > 0)),
        )
        .map((s) => s.subjectName),
    ),
  );
  if (weaknessPatterns.length >= 3 && subjectsNeedingAttention.length === 0 && subjectStats.length > 0) {
    const lowActivity = [...subjectStats].sort((a, b) => a.activeDays - b.activeDays)[0];
    if (lowActivity) subjectsNeedingAttention.push(lowActivity.subjectName);
  }

  const recurringPatterns = {
    strengths: buildPatternCounts(weeklyRows, STRENGTH_KEYWORDS),
    weaknesses: weaknessPatterns,
    learningHabits: buildPatternCounts(weeklyRows, HABIT_KEYWORDS),
  };

  const examOverall = examPercentages.length
    ? round2(examPercentages.reduce((s, x) => s + x.percentage, 0) / examPercentages.length)
    : null;
  const paperOverall = paperPercentages.length
    ? round2(paperPercentages.reduce((s, x) => s + x, 0) / paperPercentages.length)
    : null;

  let bestExamSubject: string | null = null;
  let weakestExamSubject: string | null = null;
  if (examPercentages.length) {
    const bySubject = new Map<string, number[]>();
    for (const p of examPercentages) {
      const list = bySubject.get(p.subjectName) || [];
      list.push(p.percentage);
      bySubject.set(p.subjectName, list);
    }
    const rows = Array.from(bySubject.entries()).map(([subjectName, values]) => ({
      subjectName,
      avg: values.reduce((s, n) => s + n, 0) / values.length,
    }));
    rows.sort((a, b) => b.avg - a.avg);
    bestExamSubject = rows[0]?.subjectName || null;
    weakestExamSubject = rows[rows.length - 1]?.subjectName || null;
  }

  const improvingCount = subjectStats.filter((s) => s.trend === 'improving').length;
  const decliningCount = subjectStats.filter((s) => s.trend === 'declining').length;
  const lowAverageCount = subjectStats.filter((s) => s.averageScore !== null && s.averageScore < 60).length;
  const hasEnoughData = activeDays > 0 || scorePoints.length > 0 || weeklyRows.length > 0;
  const suggestedStudentProfileLabel = profileLabel(
    activeRate,
    improvingCount,
    decliningCount,
    lowAverageCount,
    hasEnoughData,
  );

  const summaryBullets: string[] = [];
  summaryBullets.push(`学生本周期有 ${activeDays} 天学习记录，学习活跃率约为 ${round2(activeRate * 100)}%。`);
  if (improvingSubjects.length) {
    summaryBullets.push(`趋势向上的科目：${improvingSubjects.slice(0, 3).join('、')}。`);
  }
  if (subjectsNeedingAttention.length) {
    summaryBullets.push(`建议优先关注科目：${subjectsNeedingAttention.slice(0, 3).join('、')}。`);
  }
  if (paperOverall !== null) {
    summaryBullets.push(`试卷平均得分率约 ${paperOverall}%。`);
  }
  if (examOverall !== null) {
    summaryBullets.push(`考试平均得分率约 ${examOverall}%。`);
  }
  if (!scorePoints.length) {
    summaryBullets.push('当前周期缺少可计算的分数趋势数据。');
  }

  if (subjectStats.some((s) => s.trend === 'insufficient_data')) {
    cautionSet.add('部分科目有效分数少于 2 次，无法判断趋势。');
  }
  if (Array.from(notesSet).some((x) => x.includes('missing maxScore'))) {
    cautionSet.add('部分成绩缺少 maxScore，部分 percentage 为近似处理。');
  }
  if (!weeklyRows.length) {
    cautionSet.add('weeklyReports 为空，学习习惯分析信息有限。');
  }

  const normalizeEnglishPoints = (points: EnglishScorePoint[]) =>
    [...points].sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? 1 : -1;
      if (a.source !== b.source) return a.source > b.source ? 1 : -1;
      return (a.title || '').localeCompare(b.title || '');
    });

const finalizeEnglishSkill = (skill: MutableEnglishSkill) => {
    const sorted = normalizeEnglishPoints(skill.scorePoints).slice(-MAX_SCORE_POINTS_PER_SKILL);
    const percentages = sorted
      .map((p) => p.percentage)
      .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
    const firstScore = percentages.length ? percentages[0] : null;
    const latestScore = percentages.length ? percentages[percentages.length - 1] : null;
    const averageScore = percentages.length
      ? round2(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null;
    const highestScore = percentages.length ? Math.max(...percentages) : null;
    const trend = pickTrend(firstScore, latestScore, percentages.length);
    const improvement =
      firstScore === null || latestScore === null || percentages.length < 2
        ? null
        : round2(latestScore - firstScore);
    return {
      key: skill.key,
      label: skill.label,
      activityCount: skill.activityCount,
      recordCount: skill.recordCount,
      scoreRecordCount: sorted.length,
      averageScore,
      highestScore,
      latestScore,
      firstScore,
      improvement,
      trend,
      scorePoints: sorted,
      evidence: skill.evidence.slice(0, 3),
    };
  };

  const englishSkillBreakdown = {
    editing: finalizeEnglishSkill(englishSkillMap.get('editing')!),
    composition: finalizeEnglishSkill(englishSkillMap.get('composition')!),
    readingComprehension: finalizeEnglishSkill(englishSkillMap.get('readingComprehension')!),
    grammar: finalizeEnglishSkill(englishSkillMap.get('grammar')!),
    vocabulary: finalizeEnglishSkill(englishSkillMap.get('vocabulary')!),
    sentences: finalizeEnglishSkill(englishSkillMap.get('sentences')!),
  };

  const overallEnglishPointsSorted = normalizeEnglishPoints(overallEnglishPoints).slice(-MAX_SCORE_POINTS_PER_SKILL);
  const overallEnglishPercentages = overallEnglishPointsSorted
    .map((p) => p.percentage)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  const overallEnglishAverage = overallEnglishPercentages.length
    ? round2(overallEnglishPercentages.reduce((sum, value) => sum + value, 0) / overallEnglishPercentages.length)
    : null;
  const overallEnglishTrend = pickTrend(
    overallEnglishPercentages[0] ?? null,
    overallEnglishPercentages.length ? overallEnglishPercentages[overallEnglishPercentages.length - 1] : null,
    overallEnglishPercentages.length,
  );

  const hasVocabularyRecord = recordsWithVocabulary > 0;
  const hasSentenceRecord = recordsWithSentences > 0;
  if (hasVocabularyRecord && !hasExplicitVocabularyCount) {
    const note = '英文词汇有练习记录，但未记录明确数量。';
    englishVocabularyNotes.push(note);
    notesSet.add(note);
  }
  if (hasSentenceRecord && !hasExplicitSentenceCount) {
    const note = '英文句子有练习记录，但未记录明确数量。';
    englishVocabularyNotes.push(note);
    notesSet.add(note);
  }
  if (
    englishSubjectNameSet.size > 0 &&
    !overallEnglishPointsSorted.length &&
    !Object.values(englishSkillBreakdown).some((s) => s.activityCount > 0 || s.recordCount > 0)
  ) {
    notesSet.add('英文科目存在记录，但缺少可用的英文专项结构化数据。');
  }

  const englishAnalytics = {
    hasEnglishData:
      englishSubjectNameSet.size > 0 ||
      overallEnglishPointsSorted.length > 0 ||
      Object.values(englishSkillBreakdown).some((s) => s.activityCount > 0 || s.recordCount > 0),
    subjectNamesMatched: Array.from(englishSubjectNameSet).sort(),
    dateRange: {
      startDate,
      endDate,
    },
    skillBreakdown: englishSkillBreakdown,
    overallEnglishScoreTrend: {
      points: overallEnglishPointsSorted,
      averageScore: overallEnglishAverage,
      trend: overallEnglishTrend,
    },
    vocabularyStats: {
      vocabularyItemsCount: hasExplicitVocabularyCount ? vocabularyItemsCount : null,
      sentenceItemsCount: hasExplicitSentenceCount ? sentenceItemsCount : null,
      totalLanguageItemsCount:
        hasExplicitVocabularyCount && hasExplicitSentenceCount
          ? vocabularyItemsCount + sentenceItemsCount
          : null,
      recordsWithVocabulary,
      recordsWithSentences,
      evidence: englishVocabularyEvidence.slice(0, 4),
      dataQualityNotes: englishVocabularyNotes,
    },
    customTaskStats: Array.from(customEnglishTaskMap.values())
      .map((row) => ({
        key: row.key,
        displayName: row.displayName,
        completedCount: row.completedCount,
        scoreRecordCount: row.scores.length,
        averageScore: row.scores.length
          ? round2(row.scores.reduce((sum, value) => sum + value, 0) / row.scores.length)
          : null,
        latestScore: row.latestScore,
        evidence: row.evidence.slice(0, 3),
      }))
      .sort((a, b) => b.completedCount - a.completedCount),
  };

  return {
    reportMeta: {
      reportType: params.reportType,
      startDate,
      endDate,
      generatedAt: now,
      totalCalendarDays,
    },
    overview: {
      activeDays,
      activeRate,
      totalDailyProgressRecords: dailyRows.filter((r) => {
        const date = parseYmd(r?.date);
        return Boolean(date && date >= startDate && date <= endDate);
      }).length,
      totalWeeklyReports: weeklyRows.length,
      totalPapers: paperSummaryRows.length,
      totalExams: examSummaryRows.length,
      totalSubjects: subjectsCovered.length,
      subjectsCovered,
      topSubjectsByActivity: topSubjectsByActivity.slice(0, 8),
      strongestSubjects,
      improvingSubjects,
      subjectsNeedingAttention,
    },
    attendanceAndStudyTime: {
      presentDays,
      lateDays,
      absentDays,
      attendanceRecordedDays,
      totalStudyMinutes,
      totalStudyHours,
      daysWithStudyTime,
      averageStudyHoursPerDay,
    },
    learningActivity: {
      dailyActivity,
      weeklyActivity,
      longestActiveStreak,
      longestInactiveStreak,
      averageActiveDaysPerWeek,
    },
    subjectStats: subjectStats.sort((a, b) => b.activityCount - a.activityCount || a.subjectName.localeCompare(b.subjectName)),
    scoreTrends,
    subjectDistribution,
    examSummary: {
      exams: examSummaryRows.sort((a, b) => (a.date > b.date ? 1 : -1)),
      overallAveragePercentage: examOverall,
      bestExamSubject,
      weakestExamSubject,
    },
    paperSummary: {
      papers: paperSummaryRows.sort((a, b) => (a.date > b.date ? 1 : -1)),
      overallAveragePercentage: paperOverall,
    },
    recurringPatterns,
    aiGuidance: {
      suggestedStudentProfileLabel,
      summaryBullets: summaryBullets.slice(0, 6),
      cautionNotes: Array.from(cautionSet),
      dataQualityNotes: Array.from(notesSet),
    },
    englishAnalytics,
  };
}

export const reportAnalyticsTestUtils = {
  isEnglishSubjectName,
  classifyEnglishActivity,
  extractVocabularyCount,
  extractSentenceCount,
};
