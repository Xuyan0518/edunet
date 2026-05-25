import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { db } from './db';
import { eq, desc, and, isNull, inArray, gte, lte, lt } from 'drizzle-orm';
import { format } from 'date-fns';
import {
  studentsTable,
  dailyProgress,
  weeklyFeedback,
  examsTable,
  examScoresTable,
  quarterlySummaryTable,
  yearlySummaryTable,
  studentReportsTable,
  teachersTable,
  parentsTable,
  StudentSchema,
  DailyProgressSchema,
  DailyProgressRequestSchema,
  EnglishFieldsV2Schema,
  WeeklyFeedbackSchema,
  ExamSchema,
  ExamScoreSchema,
  EXAM_TYPES,
  QuarterlySummarySchema,
  YearlySummarySchema,
  StudentReportSchema,
  type Student,
  adminsTable
} from './schema';

import { extractEnglishStats, normalizeActivities } from './utils/englishNormalize';
import { chinaTodayDateString, parseDateString } from './utils/chinaDate';
import {
  defaultCycleForDate,
  effectiveTargetsFor,
  evaluateCompletion,
  pickCoveringCycle,
  syntheticCycleFor,
  type ResolvedCycle,
} from './utils/weeklyCycles';
import { validateLossPointsRequired } from './utils/englishValidation';
import { validateActivityNarratives } from './utils/activityNarrativeValidation';
import { enrichLossPointLabels, type LossPointLookup } from './utils/lossPointLabels';
import {
  ENHANCED_WEEKLY_PROMPT,
  WEEKLY_PROMPT_HARD_APPEND,
  aggregateAttendance,
  aggregateEnglishStats,
  aggregateLossPoints,
  aggregateWeeklyExamBreakdown,
  aggregateWeeklyPaperBreakdown,
  aggregateWeeklySubjectAndEnglishBreakdown,
  buildCompactWeeklySummaryContext,
  parseStructuredSummary,
} from './utils/aiWeeklySummary';
import {
  daysUntilExam,
  effectiveReminderDate,
  isExamUpcoming,
} from './utils/examWindow';
import {
  computeAnalyticsForPeriod,
  defaultHalfYearPeriod,
  defaultYearPeriod,
  previousPeriod,
} from './utils/studentAnalytics';
import { pickCurrentTerm } from './utils/academicTerms';
import { buildStudentReportAnalytics } from './services/reportAnalytics';
import {
  DEEPSEEK_QUARTERLY_PROMPT,
  DEEPSEEK_YEARLY_PROMPT,
  buildCompactReportContext,
  parseAiStructuredReportResponse,
} from './utils/aiStructuredReport';
import {
  canUserAccessReport,
  canUserListStudentReports,
  canUserManageReport,
  hydrateStudentReport,
  isManagerRole,
  normalizeReportPayload,
  normalizeReportStatus,
  normalizeReportType,
  parseBooleanLike,
} from './services/studentReports';
import {
  buildActionLockConflictPayload,
  isActionLockConflictError,
  withActionLock,
} from './services/actionLocks';
import { parseReportJson, serializeReportJson } from './utils/reportJson';
import {
  INPUT_LIMITS,
  parseFiniteInteger,
  trimString,
  validateDailyProgressExtremes,
  validateDateRange,
  validateDisplayName,
  validateExamSubjects,
  validatePaperPayload,
  validateReportInput,
  validateYearRange,
} from './utils/inputValidation';
import { parseScoreMeta } from './utils/scoreGrade';

// Apply V2 English normalization to a daily_progress row's activities. Used at
// every read/write boundary so legacy rows look V2 to consumers and new writes
// land in V2 shape regardless of whether the client sent legacy strings.
const withV2Activities = <T extends { activities?: unknown }>(row: T): T => {
  if (!row || row.activities == null) return row;
  return { ...row, activities: normalizeActivities(row.activities) } as T;
};

// Post-normalize structural sanity check on V2 English blocks (Part 9).
// Catches programmer-error regressions in normalizeEnglishFields by running
// the strict Zod schema on every english block after normalization. Should
// always pass for well-formed normalize output; if it fires, the bug is in
// the normalizer (or the client crafted a deliberately broken object).
const validateNormalizedEnglish = (
  activities: unknown,
): { ok: true } | { ok: false; errors: Array<{ activityIndex: number; path: string; message: string }> } => {
  if (!Array.isArray(activities)) return { ok: true };
  const errors: Array<{ activityIndex: number; path: string; message: string }> = [];
  activities.forEach((a, idx) => {
    if (!a || typeof a !== 'object') return;
    const eng = (a as { english?: unknown }).english;
    if (!eng) return;
    const result = EnglishFieldsV2Schema.safeParse(eng);
    if (!result.success) {
      result.error.errors.forEach((e) => {
        errors.push({ activityIndex: idx, path: e.path.join('.'), message: e.message });
      });
    }
  });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};

// Load id→label lookup for the active loss-point catalog. Cheap query (~25 rows).
// Called per-write to keep snapshots current; if this becomes a hot path we can
// memoize with TTL.
const loadLossPointLookup = async (): Promise<LossPointLookup> => {
  const rows = await db
    .select({ id: lossPointsTable.id, label: lossPointsTable.label })
    .from(lossPointsTable);
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.id, r.label);
  return map;
};

import {
  weeklyStudyCyclesTable,
  studentWeeklyTaskTargetsTable,
  WeeklyStudyCycleSchema,
  StudentWeeklyTaskTargetsSchema,
  lossPointCategoriesTable,
  lossPointsTable,
  academicTermsTable,
  AcademicTermSchema,
  subjectsTable,
  topicsTable,
  studentSubjectsTable,
  studentTopicProgressTable,
  paperTypesTable,
  paperSchoolsTable,
  studentPapersTable,
  SubjectSchema,
  TopicSchema,
  StudentTopicProgressSchema,
  TOPIC_STATUS,
  subjectLevelsTable,
  studentEnglishTaskConfigsTable,
} from './schema';

import { generateToken } from './utils/auth';
import { authenticate, requireTeacher, requireParent, requireAdmin, requireRole } from './middleware/auth';
import { verifyParentStudentAccess } from './middleware/parentStudent';
import { syncCatalogForStudentSubjects } from './utils/catalogSync';
import { DEFAULT_ENGLISH_TASKS, hasCustomEnglishTaskConfig, normalizeEnglishTaskConfig } from './utils/englishTasks';
import {
  DEFAULT_SUBJECT_LEVEL_NAME,
  ensureDefaultSubjectLevel,
  sanitizeLevelDescription,
  sanitizeLevelName,
  sanitizeSortOrder,
} from './utils/subjectLevels';
import { sendWeChatSubscribeMessage } from './utils/wechatNotify';
import { DEFAULT_USER_NAME, pickDisplayName, toPublicUser } from './auth/userIdentity';

dotenv.config();

const app = express();
const port = process.env.API_PORT || process.env.PORT || 3003;
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const fallbackCorsOrigins = ['http://localhost:3001', 'http://localhost:5173'];
const allowedCorsOrigins = configuredCorsOrigins.length ? configuredCorsOrigins : fallbackCorsOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Non-browser clients (like WeChat Mini Program requests) may not send origin.
    if (!origin || allowedCorsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
}));
app.use(bodyParser.json());

const ACTION_LOCK_TTL = {
  studentWriteMs: 60_000,
  studentAiMs: 240_000,
  subjectCatalogMs: 90_000,
} as const;

const studentWriteLockKey = (studentId: string) => `student:${studentId}:write`;
const studentAiLockKey = (studentId: string) => `student:${studentId}:ai`;
const studentSubjectProgressLockKey = (studentId: string) => `student:${studentId}:subject-progress`;
const subjectCatalogWriteLockKey = () => 'subject-catalog:write';

const withLockActor = (req: express.Request) => ({
  actorUserId: req.user?.id || 'unknown-user',
  actorName: req.user?.name || null,
});

const parseBooleanInput = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

type TopicStatusValue = (typeof TOPIC_STATUS)[number];

const isTopicStatus = (value: string): value is TopicStatusValue => {
  return (TOPIC_STATUS as readonly string[]).includes(value);
};

const deriveTopicStatus = (
  definitionRecited: boolean,
  chapterExerciseCompleted: boolean
): TopicStatusValue => {
  if (definitionRecited && chapterExerciseCompleted) return 'completed';
  if (definitionRecited || chapterExerciseCompleted) return 'in_progress';
  return 'not_started';
};

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const parseTimestamp = (value: any): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toMillis = (value: any): number | null => {
  const d = parseTimestamp(value);
  return d ? d.getTime() : null;
};

const isSameTimestamp = (a: any, b: any): boolean => {
  const am = toMillis(a);
  const bm = toMillis(b);
  if (am === null || bm === null) return false;
  return am === bm;
};

const getErrorDetails = (err: unknown) => {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { message: String(err), stack: undefined, name: 'UnknownError' };
};

const addDaysToDate = (dateStr: string, days: number) => {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return format(date, 'yyyy-MM-dd');
};

const parseOptionalInt = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
};

const requirePaperEvaluations = (
  papers: unknown[],
): { ok: true } | { ok: false; details: Array<{ index: number; missingFields: string[] }> } => {
  const details: Array<{ index: number; missingFields: string[] }> = [];
  papers.forEach((raw, index) => {
    const paper = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const strengths = String(paper.strengths || '').trim();
    const improvements = String(paper.improvements || '').trim();
    const missingFields: string[] = [];
    if (!strengths) missingFields.push('strengths');
    if (!improvements) missingFields.push('improvements');
    if (missingFields.length) {
      details.push({ index, missingFields });
    }
  });
  return details.length ? { ok: false, details } : { ok: true };
};

const REVIEWER_USERNAME = String(process.env.REVIEWER_USERNAME || 'account').trim();
const REVIEWER_PASSWORD = String(process.env.REVIEWER_PASSWORD || 'xyz2026!!');
const REVIEWER_DISPLAY_NAME = String(process.env.REVIEWER_DISPLAY_NAME || '审核体验账号').trim() || '审核体验账号';
const REVIEWER_EMAIL = String(process.env.REVIEWER_EMAIL || 'reviewer@local.edunet').trim();
const REVIEWER_TEACHER_ID = String(process.env.REVIEWER_TEACHER_ID || '').trim();
const REVIEWER_STUDENT_ID = String(process.env.REVIEWER_STUDENT_ID || '').trim();

const safeEq = (a: string, b: string) => {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const isReviewerSession = (req: express.Request) =>
  req.user?.role === 'teacher' && req.user?.isReviewer === true;

const enforceReviewerScope = (req: express.Request, res: express.Response, studentId?: unknown) => {
  if (!isReviewerSession(req)) return true;
  const reviewerStudentId = String(req.user?.reviewerStudentId || '').trim();
  if (!reviewerStudentId) {
    res.status(403).json({ error: 'Reviewer account is not configured with a demo student' });
    return false;
  }
  if (studentId == null || studentId === '') return true;
  if (String(studentId) !== reviewerStudentId) {
    res.status(403).json({ error: 'Reviewer account can only access demo student data' });
    return false;
  }
  return true;
};

const invalidInput = (res: express.Response, issues: Array<{ field: string; message: string }>) =>
  res.status(400).json({ error: 'INVALID_INPUT', details: issues });

type WeChatSessionResponse = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

const exchangeWeChatCode = async (code: string) => {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('Missing WECHAT_APP_ID or WECHAT_APP_SECRET');
  }
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  const resp = await fetch(url);
  const data = (await resp.json()) as WeChatSessionResponse;
  return data;
};

const dailyTemplateId = process.env.WECHAT_DAILY_TEMPLATE_ID || '';
const weeklyTemplateId = process.env.WECHAT_WEEKLY_TEMPLATE_ID || '';
const examTemplateId = process.env.WECHAT_EXAM_TEMPLATE_ID || '';
const semesterTemplateId = process.env.WECHAT_SEMESTER_TEMPLATE_ID || '';
const yearlyTemplateId = process.env.WECHAT_YEARLY_TEMPLATE_ID || '';
const weeklyTemplateContentKey = process.env.WECHAT_WEEKLY_TEMPLATE_CONTENT_KEY || 'thing6';
const weeklyTemplateTimeKey = process.env.WECHAT_WEEKLY_TEMPLATE_TIME_KEY || 'time1';
const examTemplateContentKey = process.env.WECHAT_EXAM_TEMPLATE_CONTENT_KEY || 'thing6';
const examTemplateTimeKey = process.env.WECHAT_EXAM_TEMPLATE_TIME_KEY || 'time1';
const semesterTemplateContentKey = process.env.WECHAT_SEMESTER_TEMPLATE_CONTENT_KEY || 'thing6';
const semesterTemplateTimeKey = process.env.WECHAT_SEMESTER_TEMPLATE_TIME_KEY || 'time1';
// Some public template variants use thing5/time1 for yearly summary reminder.
const yearlyTemplateContentKey = process.env.WECHAT_YEARLY_TEMPLATE_CONTENT_KEY || 'thing5';
const yearlyTemplateTimeKey = process.env.WECHAT_YEARLY_TEMPLATE_TIME_KEY || 'time1';
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
const deepseekApiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const weeklySummaryPrompt = process.env.DEEPSEEK_WEEKLY_PROMPT || '';
const quarterlySummaryPrompt = process.env.DEEPSEEK_QUARTERLY_PROMPT || '';
const yearlySummaryPrompt = process.env.DEEPSEEK_YEARLY_PROMPT || '';

app.get('/api/health', (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const notifyParent = async (payload: {
  studentId: string;
  parentId: string | null;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
}) => {
  if (!payload.parentId || !payload.templateId) {
    console.warn('[wechat-notify] skipped: missing parentId/templateId', {
      studentId: payload.studentId,
      hasParentId: Boolean(payload.parentId),
      hasTemplateId: Boolean(payload.templateId),
    });
    return;
  }
  const parents = await db.select().from(parentsTable).where(eq(parentsTable.id, payload.parentId));
  if (!parents.length || !parents[0].wechatOpenId) {
    console.warn('[wechat-notify] skipped: parent/openid missing', {
      studentId: payload.studentId,
      parentId: payload.parentId,
      parentFound: parents.length > 0,
      hasWechatOpenId: Boolean(parents[0]?.wechatOpenId),
    });
    return;
  }
  const sendResult = await sendWeChatSubscribeMessage({
    toUser: parents[0].wechatOpenId,
    templateId: payload.templateId,
    page: payload.page,
    data: payload.data,
  });
  if (!sendResult.ok) {
    console.warn('[wechat-notify] send failed', {
      studentId: payload.studentId,
      parentId: payload.parentId,
      templateId: payload.templateId,
      error: sendResult.error,
      errcode: sendResult.errcode ?? null,
      errmsg: sendResult.errmsg ?? null,
    });
    return;
  }
  console.info('[wechat-notify] send ok', {
    studentId: payload.studentId,
    parentId: payload.parentId,
    templateId: payload.templateId,
  });
};

const buildTemplateData = (
  contentKey: string,
  contentValue: string,
  timeKey: string,
  timeValue: string,
) => {
  const contentField = String(contentKey || '').trim() || 'thing6';
  const timeField = String(timeKey || '').trim() || 'time1';
  return {
    [contentField]: { value: String(contentValue || '').trim() },
    [timeField]: { value: String(timeValue || '').trim() },
  };
};

const notifyParentStudentReportPublished = async (report: {
  id: string;
  studentId: string;
  studentParentId?: string | null;
  reportType?: string | null;
  endDate?: string | Date | null;
}) => {
  const isYearly = String(report.reportType || '').toLowerCase() === 'yearly';
  const templateId = isYearly ? yearlyTemplateId : semesterTemplateId;
  const title = isYearly ? '年度学习报告已发布' : '学期学习报告已发布';
  const timeValue = toDateString(report.endDate) || format(new Date(), 'yyyy-MM-dd');

  await notifyParent({
    studentId: report.studentId,
    parentId: report.studentParentId ?? null,
    templateId,
    page: `/pages/reports/index?studentId=${report.studentId}`,
    data: isYearly
      ? buildTemplateData(yearlyTemplateContentKey, title, yearlyTemplateTimeKey, timeValue)
      : buildTemplateData(semesterTemplateContentKey, title, semesterTemplateTimeKey, timeValue),
  });
};

const callDeepSeek = async (
  prompt: string,
  context: any,
  options?: {
    temperature?: number;
    responseFormat?: 'text' | 'json_object';
  }
) => {
  if (!deepseekApiKey || !deepseekApiUrl || !prompt) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  const bodyPayload: Record<string, unknown> = {
    model: deepseekModel,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify(context) },
    ],
  };
  if (typeof options?.temperature === 'number') {
    bodyPayload.temperature = options.temperature;
  }
  if (options?.responseFormat === 'json_object') {
    bodyPayload.response_format = { type: 'json_object' };
  }
  const resp = await fetch(deepseekApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${text}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
};

const getSubjectProgressSummary = async (studentId: string) => {
  const rows = await db
    .select({
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      topicId: topicsTable.id,
      status: studentTopicProgressTable.status,
    })
    .from(studentSubjectsTable)
    .where(eq(studentSubjectsTable.studentId, studentId))
    .leftJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
    .leftJoin(topicsTable, eq(topicsTable.subjectId, subjectsTable.id))
    .leftJoin(
      studentTopicProgressTable,
      and(
        eq(studentTopicProgressTable.studentId, studentId),
        eq(studentTopicProgressTable.topicId, topicsTable.id)
      )
    );
  const map = new Map<string, any>();
  rows.forEach((row) => {
    if (!row.subjectId) return;
    const item = map.get(row.subjectId) || {
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      totalTopics: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
    };
    if (row.topicId) {
      item.totalTopics += 1;
      const status = row.status || 'not_started';
      if (status === 'completed') item.completed += 1;
      else if (status === 'in_progress') item.inProgress += 1;
      else item.notStarted += 1;
    }
    map.set(row.subjectId, item);
  });
  return Array.from(map.values());
};

const toDateString = (value: string | Date | null | undefined) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return format(value, 'yyyy-MM-dd');
};

const getStudentById = async (studentId: string) => {
  const rows = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  return rows[0] || null;
};

const getReportWithStudent = async (reportId: string) => {
  const rows = await db
    .select({
      id: studentReportsTable.id,
      studentId: studentReportsTable.studentId,
      reportType: studentReportsTable.reportType,
      title: studentReportsTable.title,
      startDate: studentReportsTable.startDate,
      endDate: studentReportsTable.endDate,
      year: studentReportsTable.year,
      summaryText: studentReportsTable.summaryText,
      analyticsJson: studentReportsTable.analyticsJson,
      structuredReportJson: studentReportsTable.structuredReportJson,
      finalReportJson: studentReportsTable.finalReportJson,
      rawAiResponse: studentReportsTable.rawAiResponse,
      parseError: studentReportsTable.parseError,
      status: studentReportsTable.status,
      visibleToParent: studentReportsTable.visibleToParent,
      createdBy: studentReportsTable.createdBy,
      updatedBy: studentReportsTable.updatedBy,
      createdAt: studentReportsTable.createdAt,
      updatedAt: studentReportsTable.updatedAt,
      updatedByName: studentReportsTable.updatedByName,
      studentParentId: studentsTable.parentId,
    })
    .from(studentReportsTable)
    .leftJoin(studentsTable, eq(studentReportsTable.studentId, studentsTable.id))
    .where(eq(studentReportsTable.id, reportId))
    .limit(1);
  return rows[0] || null;
};

const buildMarkdownReport = (params: {
  studentName: string;
  grade: string;
  startDate: string;
  endDate: string;
  subjectProgress: Array<{
    subjectName: string;
    totalTopics: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  }>;
  daily: Array<any>;
  weekly: Array<any>;
  papers: Array<any>;
  exams: Array<any>;
}) => {
  const clipMd = (value: unknown, max = 280) => {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };

  const dailyRows = (params.daily || []).slice(-30);
  const weeklyRows = (params.weekly || []).slice(-20);
  const paperRows = (params.papers || []).slice(-30);
  const examRows = (params.exams || []).slice(-20);
  const subjectProgressRows = (params.subjectProgress || []).slice(0, 20);

  const lines: string[] = [];
  lines.push(`# 学生学习总结报告`);
  lines.push('');
  lines.push(`- 学生：${params.studentName}`);
  lines.push(`- 年级：${params.grade}`);
  lines.push(`- 日期范围：${params.startDate} ~ ${params.endDate}`);
  lines.push(`- 生成时间：${format(new Date(), 'yyyy-MM-dd HH:mm')}`);
  lines.push('');

  lines.push('## 章节完成情况');
  if (!subjectProgressRows.length) {
    lines.push('- 暂无章节进度数据');
  } else {
    subjectProgressRows.forEach((s) => {
      lines.push(`- ${s.subjectName || '未命名科目'}：完成 ${s.completed}/${s.totalTopics}，进行中 ${s.inProgress}，未开始 ${s.notStarted}`);
    });
  }
  lines.push('');

  lines.push('## 每日进度');
  if (!dailyRows.length) {
    lines.push('- 暂无每日进度');
  } else {
    dailyRows.forEach((d) => {
      lines.push(`### ${toDateString(d.date)}`);
      lines.push(`- 出勤：${d.attendance || '-'}`);
      if (d.summary) lines.push(`- 当日总结：${clipMd(d.summary, 240)}`);
      const activities = (Array.isArray(d.activities) ? d.activities : []).slice(0, 16);
      if (activities.length) {
        activities.forEach((a: any, idx: number) => {
          const subject = a?.subjectDisplayName || a?.subjectName || a?.subject || `科目${idx + 1}`;
          const taskSummary = clipMd(a?.taskSummary || a?.practiceProgress || a?.description, 180);
          const strengths = clipMd(a?.strengths, 180);
          const improvements = clipMd(a?.improvements, 180);
          lines.push(`- ${subject}`);
          if (taskSummary) lines.push(`  - 学生具体做了什么：${taskSummary}`);
          if (strengths) lines.push(`  - 做得好的地方：${strengths}`);
          if (improvements) lines.push(`  - 需要改进的地方：${improvements}`);
        });
      }
      lines.push('');
    });
  }

  lines.push('## 每周反馈');
  if (!weeklyRows.length) {
    lines.push('- 暂无每周反馈');
  } else {
    weeklyRows.forEach((w) => {
      lines.push(`- ${toDateString(w.weekStarting)} ~ ${toDateString(w.weekEnding)}：${clipMd(w.summary, 220) || '无'}`);
    });
  }
  lines.push('');

  lines.push('## 试卷 / 测验记录');
  if (!paperRows.length) {
    lines.push('- 暂无试卷记录');
  } else {
    paperRows.forEach((p) => {
      lines.push(`- ${toDateString(p.date)}｜${p.subjectName || '未指定科目'}｜${p.typeName || '未分类类型'}｜${p.schoolName || '未指定学校'}｜${p.score ?? '-'} / ${p.total ?? '-'}`);
      if (p.description) lines.push(`  - 描述：${clipMd(p.description, 180)}`);
      if (p.strengths) lines.push(`  - 做得好的地方：${clipMd(p.strengths, 180)}`);
      if (p.improvements) lines.push(`  - 需要改进的地方：${clipMd(p.improvements, 180)}`);
    });
  }
  lines.push('');

  lines.push('## 考试成绩');
  if (!examRows.length) {
    lines.push('- 暂无考试成绩');
  } else {
    examRows.forEach((e) => {
      lines.push(`- ${e.name}（${toDateString(e.examDate)}）`);
      const subjects = (Array.isArray(e.subjects) ? e.subjects : []).slice(0, 24);
      if (!subjects.length) {
        lines.push('  - 暂无科目成绩');
      } else {
        subjects.forEach((s: any) => {
          lines.push(`  - ${s.name}：${s.score || '未录入'}${s.scope ? `；范围：${clipMd(s.scope, 120)}` : ''}`);
        });
      }
    });
  }
  lines.push('');
  return lines.join('\n');
};

// ========== TEACHER ROUTES ==========

app.get('/api/teachers', authenticate, requireAdmin, async (_, res) => {
  try {
    const result = await db.select().from(teachersTable);
    res.json(result.map((item) => toPublicUser(item, 'teacher')));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/teachers/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(teachersTable).where(eq(teachersTable.id, id));
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(toPublicUser(result[0], 'teacher'));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/teachers', async (req, res) => {
  res.status(410).json({
    error: 'Email/password signup is deprecated. Use WeChat login to create teacher accounts.',
  });
});

app.put('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const nextName = pickDisplayName(req.body?.displayName) || pickDisplayName(req.body?.name);
    const nextStatus = typeof req.body?.status === 'string' ? req.body.status : undefined;
    const nextAvatar =
      typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim() ? req.body.avatarUrl.trim() : null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (nextName) {
      patch.name = nextName;
      patch.displayName = nextName;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatarUrl')) {
      patch.avatarUrl = nextAvatar;
    }
    if (nextStatus === 'pending' || nextStatus === 'approved' || nextStatus === 'rejected') {
      patch.status = nextStatus;
    }
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    const result = await db.update(teachersTable).set(patch).where(eq(teachersTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(toPublicUser(result[0], 'teacher'));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/teachers/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.delete(teachersTable).where(eq(teachersTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== PARENT ROUTES ==========
app.get('/api/parents/unassigned', async (req, res) => {
  try {
    const unassignedParents = await db
      .select()
      .from(parentsTable)
      .leftJoin(studentsTable, eq(parentsTable.id, studentsTable.parentId))
      .where(
        and(
          eq(parentsTable.status, 'approved'),
          isNull(studentsTable.parentId) 
        )
      );
    
    const flattenedParents = unassignedParents.map(p => p.parents);
    res.status(200).json(flattenedParents.map((item) => toPublicUser(item, 'parent')));
  } catch (error) {
    console.error('Error fetching available parents:', error);
    res.status(500).json({ error: 'Failed to fetch available parents' });
  }
});

app.get('/api/parents', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot access parent directory' });
  try {
    const result = await db
      .select()
      .from(parentsTable)
      .where(eq(parentsTable.status, 'approved'));
    res.json(result.map((item) => toPublicUser(item, 'parent')));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/parents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(parentsTable).where(eq(parentsTable.id, id));
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json(toPublicUser(result[0], 'parent'));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/parents/:id/students', authenticate, requireTeacher, async (req, res) => {
  const parentId = req.params.id;
  try {
    const result = await db.select().from(studentsTable).where(eq(studentsTable.parentId, parentId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/parents', async (req, res) => {
  res.status(410).json({
    error: 'Email/password signup is deprecated. Use WeChat login to create parent accounts.',
  });
});

app.put('/api/parents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const nextName = pickDisplayName(req.body?.displayName) || pickDisplayName(req.body?.name);
    const nextStatus = typeof req.body?.status === 'string' ? req.body.status : undefined;
    const nextAvatar =
      typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim() ? req.body.avatarUrl.trim() : null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (nextName) {
      patch.name = nextName;
      patch.displayName = nextName;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatarUrl')) {
      patch.avatarUrl = nextAvatar;
    }
    if (nextStatus === 'pending' || nextStatus === 'approved' || nextStatus === 'rejected') {
      patch.status = nextStatus;
    }
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    const result = await db.update(parentsTable).set(patch).where(eq(parentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json(toPublicUser(result[0], 'parent'));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/parents/:id', authenticate, requireTeacher, async (req, res) => {
  const id = req.params.id;
  try {
    const students = await db.select().from(studentsTable).where(eq(studentsTable.parentId, id));
    if (students.length) {
      return res.status(400).json({
        error: '该家长已绑定学生，请先解绑后再删除。',
      });
    }
    const result = await db.delete(parentsTable).where(eq(parentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json({ message: 'Parent deleted successfully' });
  } catch (err) {
    console.error('Error deleting parent:', err);
    const message = getErrorMessage(err);
    const code = (err as { code?: string })?.code;
    if (code === '23503' || message.includes('foreign key')) {
      return res.status(400).json({
        error: '该家长已绑定学生，请先解绑后再删除。',
      });
    }
    res.status(500).json({ error: 'Database error', details: message });
  }
});

// ========== STUDENT ROUTES ==========

// Get all students (teachers see all, parents see only their children)
app.get('/api/students', authenticate, async (req, res) => {
  try {
    if (isReviewerSession(req)) {
      const reviewerStudentId = String(req.user?.reviewerStudentId || '').trim();
      if (!reviewerStudentId) {
        return res.status(403).json({ error: 'Reviewer account is not configured with a demo student' });
      }
      const rows = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.id, reviewerStudentId))
        .limit(1);
      return res.json(rows);
    }
    if (req.user?.role === 'parent') {
      // Parents only see their own children
      const result = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.parentId, req.user.id));
      res.json(result);
    } else {
      // Teachers and admins see all students
      const result = await db.select().from(studentsTable);
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:id', authenticate, verifyParentStudentAccess, async (req, res) => {
  const id = req.params.id;
  try {
    console.log(`Fetching student with ID: ${id}`);
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }
    const result = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
    console.log(`Query result:`, result);
    if (!result.length) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error fetching student by ID:', err);
    res.status(500).json({ error: 'Database error', details: getErrorMessage(err) });
  }
});

app.post('/api/students', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage student roster' });
  // Normalize parentId field (handle both parentId and parent_id from frontend)
  const body = { ...req.body };
  if (body.parent_id && !body.parentId) {
    body.parentId = body.parent_id;
    delete body.parent_id;
  }
  
  const parsed = StudentSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const studentData: Student = parsed.data;
    const result = await db.insert(studentsTable).values({
      id: studentData.id,
      name: studentData.name,
      grade: studentData.grade,
      parentId: studentData.parentId ?? null,
    }).returning();
    if (result[0]?.id) {
      const englishRows = await db
        .select({ id: subjectsTable.id })
        .from(subjectsTable)
        .where(eq(subjectsTable.code, 'ENGLISH'))
        .limit(1);
      if (englishRows.length) {
        await db
          .insert(studentSubjectsTable)
          .values({ studentId: result[0].id, subjectId: englishRows[0].id })
          .onConflictDoNothing();
      }
    }
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:id', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage student roster' });
  const id = req.params.id;
  // Normalize parentId field (handle both parentId and parent_id from frontend)
  const body = { ...req.body };
  if (body.parent_id && !body.parentId) {
    body.parentId = body.parent_id;
    delete body.parent_id;
  }
  
  const parsed = StudentSchema.safeParse({ ...body, id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const studentData: Student = parsed.data;
    const result = await db
      .update(studentsTable)
      .set({
        name: studentData.name,
        grade: studentData.grade,
        parentId: studentData.parentId ?? null,
      })
      .where(eq(studentsTable.id, id))
      .returning();
    if (!result.length) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/students/:id', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage student roster' });
  const id = req.params.id;
  try {
    const existing = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(eq(studentsTable.id, id))
      .limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Student not found' });

    // Delete dependent records first to avoid FK errors
    await db.delete(studentTopicProgressTable).where(eq(studentTopicProgressTable.studentId, id));
    await db.delete(studentSubjectsTable).where(eq(studentSubjectsTable.studentId, id));
    await db.delete(weeklyFeedback).where(eq(weeklyFeedback.studentId, id));
    await db.delete(dailyProgress).where(eq(dailyProgress.studentId, id));
    const examRows = await db.select({ id: examsTable.id }).from(examsTable).where(eq(examsTable.studentId, id));
    const examIds = examRows.map(r => r.id);
    if (examIds.length) {
      await db.delete(examScoresTable).where(inArray(examScoresTable.examId, examIds));
    }
    await db.delete(examsTable).where(eq(examsTable.studentId, id));
    await db.delete(quarterlySummaryTable).where(eq(quarterlySummaryTable.studentId, id));
    await db.delete(yearlySummaryTable).where(eq(yearlySummaryTable.studentId, id));
    await db.delete(studentReportsTable).where(eq(studentReportsTable.studentId, id));

    await db.delete(studentsTable).where(eq(studentsTable.id, id));
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== STUDENT ENGLISH TASK CONFIG ======
app.get('/api/students/:studentId/english-tasks', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  try {
    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const rows = await db
      .select()
      .from(studentEnglishTaskConfigsTable)
      .where(eq(studentEnglishTaskConfigsTable.studentId, studentId))
      .limit(1);
    const row = rows[0];
    const tasks = normalizeEnglishTaskConfig(row?.tasksJson ?? DEFAULT_ENGLISH_TASKS);
    res.json({
      studentId,
      isDefault: !row || !hasCustomEnglishTaskConfig(row.tasksJson),
      tasks,
      updatedAt: row?.updatedAt || null,
      updatedBy: row?.updatedBy || null,
    });
  } catch (err) {
    console.error('Error fetching english task config:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:studentId/english-tasks', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const rawTasks = Array.isArray(req.body?.tasks) ? req.body.tasks : null;
  if (!rawTasks) {
    return res.status(400).json({ error: 'tasks must be an array' });
  }
  const normalizedTasks = normalizeEnglishTaskConfig(rawTasks);
  if (normalizedTasks.length > 30) {
    return invalidInput(res, [{ field: 'tasks', message: '任务数量过多（最多 30 项）' }]);
  }
  for (let i = 0; i < normalizedTasks.length; i += 1) {
    const task = normalizedTasks[i];
    if (!trimString(task.displayName)) {
      return invalidInput(res, [{ field: `tasks[${i}].displayName`, message: '任务名称不能为空' }]);
    }
    if (task.weeklyTargetCount < 0 || task.weeklyTargetCount > INPUT_LIMITS.englishVocabCountMax) {
      return invalidInput(res, [{ field: `tasks[${i}].weeklyTargetCount`, message: '每周目标超出范围' }]);
    }
  }

  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新学生英文任务配置',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/english-tasks' },
      },
      async () => {
        const student = await getStudentById(studentId);
        if (!student) {
          res.status(404).json({ error: 'Student not found' });
          return;
        }
        const existing = await db
          .select()
          .from(studentEnglishTaskConfigsTable)
          .where(eq(studentEnglishTaskConfigsTable.studentId, studentId))
          .limit(1);
        const now = new Date();
        const actorId = req.user?.id || null;
        if (!existing.length) {
          await db.insert(studentEnglishTaskConfigsTable).values({
            studentId,
            tasksJson: normalizedTasks as unknown as Record<string, unknown>[],
            createdBy: actorId,
            updatedBy: actorId,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(studentEnglishTaskConfigsTable)
            .set({
              tasksJson: normalizedTasks as unknown as Record<string, unknown>[],
              updatedBy: actorId,
              updatedAt: now,
            })
            .where(eq(studentEnglishTaskConfigsTable.studentId, studentId));
        }
        res.json({
          studentId,
          isDefault: false,
          tasks: normalizedTasks,
          updatedAt: now,
          updatedBy: actorId,
        });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error saving english task config:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/students/:studentId/english-tasks/reset', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '重置学生英文任务配置',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/english-tasks/reset' },
      },
      async () => {
        await db
          .delete(studentEnglishTaskConfigsTable)
          .where(eq(studentEnglishTaskConfigsTable.studentId, studentId));
        res.json({
          studentId,
          isDefault: true,
          tasks: DEFAULT_ENGLISH_TASKS,
        });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error resetting english task config:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== EXAM ROUTES ======
app.get('/api/students/:studentId/exams', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  try {
    const exams = await db
      .select()
      .from(examsTable)
      .where(eq(examsTable.studentId, studentId))
      .orderBy(desc(examsTable.createdAt));
    if (!exams.length) return res.json([]);
    const examIds = exams.map(e => e.id);
    const scores = await db
      .select()
      .from(examScoresTable)
      .where(inArray(examScoresTable.examId, examIds));
    const scoreMap = new Map<string, {
      name: string;
      score: string;
      scope: string | null;
      examDate: string | Date | null;
      scoreValue: number | null;
      totalValue: number | null;
      percentage: number | null;
      grade: string | null;
    }[]>();
    scores.forEach((s) => {
      const list = scoreMap.get(s.examId) || [];
      const meta = parseScoreMeta(s.score, null);
      list.push({
        name: s.name,
        score: s.score,
        scope: s.scope ?? null,
        examDate: s.examDate ?? null,
        scoreValue: meta.score,
        totalValue: meta.total,
        percentage: meta.percentage,
        grade: meta.grade,
      });
      scoreMap.set(s.examId, list);
    });
    const payload = exams.map((e) => ({
      id: e.id,
      studentId: e.studentId,
      name: e.name,
      examDate: e.examDate,
      examType: e.examType,
      reminderDate: e.reminderDate,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      updatedByName: e.updatedByName,
      subjects: scoreMap.get(e.id) || [],
    }));
    res.json(payload);
  } catch (err) {
    console.error('Error fetching exams:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/students/:studentId/exams', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const name = String(req.body?.name || '').trim();
  const examDate = String(req.body?.examDate || '').trim();
  // Part 6 additions: examType, reminderDate, subjects[].scope. All optional —
  // an exam can be SCHEDULED (no scores yet) and edited later.
  const examTypeRaw = String(req.body?.examType || '').trim().toUpperCase();
  const examType = EXAM_TYPES.includes(examTypeRaw as any) ? examTypeRaw : null;
  const reminderDateRaw = String(req.body?.reminderDate || '').trim();
  const reminderDate = parseDateString(reminderDateRaw);
  const subjects = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  if (!name) return res.status(400).json({ error: 'Missing exam name' });
  if (!examDate) return res.status(400).json({ error: 'Missing exam date' });
  if (!subjects.length) return res.status(400).json({ error: 'Missing subjects' });

  const parsedExam = ExamSchema.safeParse({ studentId, name });
  if (!parsedExam.success) return res.status(400).json({ error: parsedExam.error.flatten() });

  // Score is now optional (scheduled-only exams have empty scores). Subjects
  // need at least a name; scope/score may be empty.
  const normalized = subjects
    .map((s: any) => {
      const subjectDateRaw = String(s.examDate ?? '').trim();
      const subjectDate = parseDateString(subjectDateRaw);
      return {
        name: String(s.name || '').trim(),
        score: String(s.score ?? '').trim(),
        scope: typeof s.scope === 'string' ? s.scope.trim() : '',
        examDate: subjectDateRaw && subjectDate ? subjectDateRaw : null,
      };
    })
    .filter((s: any) => s.name);

  if (!normalized.length) return res.status(400).json({ error: 'Invalid subjects' });
  const examDateParsed = parseDateString(examDate);
  if (!examDateParsed) return res.status(400).json({ error: 'Invalid exam date' });
  const subjectIssues = validateExamSubjects(normalized);
  if (subjectIssues.length) return invalidInput(res, subjectIssues);

  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '新增考试记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/exams', examDate },
      },
      async () => {
        const examRows = await db
          .insert(examsTable)
          .values({
            studentId,
            name,
            examDate,
            examType,
            reminderDate: reminderDateRaw ? reminderDate : null,
            updatedAt: new Date(),
            updatedByName: req.user?.name || null,
          })
          .returning();
        const exam = examRows[0];
        const scoreRows = normalized.map((s: any) => ({
          examId: exam.id,
          name: s.name,
          score: s.score,
          scope: s.scope || null,
          examDate: s.examDate,
        }));
        await db.insert(examScoresTable).values(scoreRows);
        const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
        const student = studentRows[0];
        // Only notify parents when this is a RESULT post (at least one score
        // entered). Pure schedule entries shouldn't ping the parent yet.
        const hasAnyScore = normalized.some((s: any) => s.score);
        if (student && hasAnyScore) {
          await notifyParent({
            studentId,
            parentId: student.parentId ?? null,
            templateId: examTemplateId,
            page: `/pages/grades/index?studentId=${studentId}`,
            data: buildTemplateData(
              examTemplateContentKey,
              '成绩记录已发布',
              examTemplateTimeKey,
              examDate,
            ),
          });
        }
        res.status(201).json({ ...exam, subjects: normalized });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating exam:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/exams/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  const name = String(req.body?.name || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const examDate = String(req.body?.examDate || '').trim();
  const examTypeRaw = String(req.body?.examType || '').trim().toUpperCase();
  const examType = EXAM_TYPES.includes(examTypeRaw as any) ? examTypeRaw : null;
  const reminderDateRaw = String(req.body?.reminderDate || '').trim();
  const reminderDate = parseDateString(reminderDateRaw);
  const subjects = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (!name) return res.status(400).json({ error: 'Missing exam name' });
  if (!examDate) return res.status(400).json({ error: 'Missing exam date' });
  if (!subjects.length) return res.status(400).json({ error: 'Missing subjects' });
  if (!clientUpdatedAt) return res.status(400).json({ error: 'Missing updatedAt' });

  const normalized = subjects
    .map((s: any) => {
      const subjectDateRaw = String(s.examDate ?? '').trim();
      const subjectDate = parseDateString(subjectDateRaw);
      return {
        name: String(s.name || '').trim(),
        score: String(s.score ?? '').trim(),
        scope: typeof s.scope === 'string' ? s.scope.trim() : '',
        examDate: subjectDateRaw && subjectDate ? subjectDateRaw : null,
      };
    })
    .filter((s: any) => s.name);

  if (!normalized.length) return res.status(400).json({ error: 'Invalid subjects' });
  const examDateParsed = parseDateString(examDate);
  if (!examDateParsed) return res.status(400).json({ error: 'Invalid exam date' });
  const subjectIssues = validateExamSubjects(normalized);
  if (subjectIssues.length) return invalidInput(res, subjectIssues);

  try {
    const existing = await db.select().from(examsTable).where(eq(examsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Exam not found' });
    if (!enforceReviewerScope(req, res, existing[0].studentId)) return;
    if (studentId && existing[0].studentId !== studentId) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    await withActionLock(
      {
        lockKey: studentWriteLockKey(existing[0].studentId),
        actionType: '更新考试记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/exams/:id', examId: id },
      },
      async () => {
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        const now = new Date();
        const updatedByName = req.user?.name || null;
        await db.update(examsTable)
          .set({
            name,
            examDate,
            examType,
            reminderDate: reminderDateRaw ? reminderDate : null,
            updatedAt: now,
            updatedByName,
          })
          .where(eq(examsTable.id, id));
        await db.delete(examScoresTable).where(eq(examScoresTable.examId, id));
        const scoreRows = normalized.map((s: any) => ({
          examId: id,
          name: s.name,
          score: s.score,
          scope: s.scope || null,
          examDate: s.examDate,
        }));
        await db.insert(examScoresTable).values(scoreRows);
        res.json({
          ...existing[0],
          name,
          examDate,
          examType,
          reminderDate: reminderDateRaw ? reminderDate : null,
          subjects: normalized,
          updatedAt: now,
          updatedByName,
        });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating exam:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/exams/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    const existing = await db.select().from(examsTable).where(eq(examsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Exam not found' });
    if (!enforceReviewerScope(req, res, existing[0].studentId)) return;
    await withActionLock(
      {
        lockKey: studentWriteLockKey(existing[0].studentId),
        actionType: '删除考试记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/exams/:id', examId: id },
      },
      async () => {
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        await db.delete(examScoresTable).where(eq(examScoresTable.examId, id));
        const result = await db.delete(examsTable).where(eq(examsTable.id, id)).returning();
        if (!result.length) {
          res.status(404).json({ error: 'Exam not found' });
          return;
        }
        res.json({ message: 'Exam deleted successfully' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error deleting exam:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// "即将到来的考试" dashboard card. Returns exams across all students that are
// inside their reminder window (effective reminder ≤ today ≤ examDate).
app.get('/api/exams/upcoming', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) {
    return res.status(403).json({ error: 'Reviewer account cannot access cross-student reminders' });
  }
  try {
    const requested = req.query?.date;
    const today = requested ? parseDateString(requested) : chinaTodayDateString();
    if (!today) return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });

    // We expand per-subject. Pull all exams whose parent date is today-or-future
    // OR which have at least one subject with a today-or-future date — keep it
    // simple by pulling all and filtering in code by per-subject effective date.
    const allExams = await db
      .select({
        id: examsTable.id,
        studentId: examsTable.studentId,
        name: examsTable.name,
        examDate: examsTable.examDate,
        examType: examsTable.examType,
        reminderDate: examsTable.reminderDate,
      })
      .from(examsTable)
      .orderBy(examsTable.examDate);

    if (!allExams.length) return res.json({ date: today, upcoming: [] });

    const examIds = allExams.map((r) => r.id);
    const studentIds = [...new Set(allExams.map((r) => r.studentId))];
    const [scores, students] = await Promise.all([
      db.select().from(examScoresTable).where(inArray(examScoresTable.examId, examIds)),
      db.select({
        id: studentsTable.id,
        name: studentsTable.name,
        grade: studentsTable.grade,
      }).from(studentsTable).where(inArray(studentsTable.id, studentIds)),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const examMap = new Map(allExams.map((e) => [e.id, e]));

    type Row = {
      id: string;
      name: string;
      examType: string | null;
      examDate: string | Date;
      reminderDate: string | Date | null;
      effectiveReminderDate: string | null;
      daysUntil: number;
      student: { id: string; name: string; grade: string };
      subject: { name: string; score: string; scope: string | null; examDate: string | Date };
    };

    const upcoming: Row[] = [];
    for (const s of scores) {
      const exam = examMap.get(s.examId);
      if (!exam) continue;
      const subjectDate = s.examDate ?? exam.examDate;
      if (!isExamUpcoming(today, subjectDate, exam.reminderDate)) continue;
      const student = studentMap.get(exam.studentId);
      upcoming.push({
        id: exam.id,
        name: exam.name,
        examType: exam.examType,
        examDate: exam.examDate,
        reminderDate: exam.reminderDate,
        effectiveReminderDate: effectiveReminderDate(subjectDate, exam.reminderDate),
        daysUntil: daysUntilExam(today, subjectDate),
        student: student
          ? { id: student.id, name: student.name, grade: student.grade }
          : { id: exam.studentId, name: '', grade: '' },
        subject: {
          name: s.name,
          score: s.score,
          scope: s.scope,
          examDate: subjectDate,
        },
      });
    }
    upcoming.sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
    res.json({ date: today, upcoming });
  } catch (err) {
    console.error('Error fetching upcoming exams:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== SUMMARY ROUTES ======
app.get('/api/students/:studentId/quarterly-summary', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  const year = parseFiniteInteger(req.query.year || new Date().getFullYear());
  if (year === null) return res.status(400).json({ error: 'Invalid year' });
  const yearIssue = validateYearRange(year, 'year');
  if (yearIssue) return invalidInput(res, [yearIssue]);
  try {
    const rows = await db
      .select()
      .from(quarterlySummaryTable)
      .where(and(eq(quarterlySummaryTable.studentId, studentId), eq(quarterlySummaryTable.year, year)))
      .orderBy(quarterlySummaryTable.quarter);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching quarterly summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:studentId/quarterly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const year = parseFiniteInteger(req.body?.year || new Date().getFullYear());
  const summaries = Array.isArray(req.body?.summaries) ? req.body.summaries : [];
  const singleQuarter = Number(req.body?.quarter);
  const singleSummary = req.body?.summary;
  const startDate = req.body?.startDate ? String(req.body.startDate) : null;
  const endDate = req.body?.endDate ? String(req.body.endDate) : null;
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (year === null) return res.status(400).json({ error: 'Invalid year' });
  const yearIssue = validateYearRange(year, 'year');
  if (yearIssue) return invalidInput(res, [yearIssue]);
  if (startDate || endDate) {
    const rangeIssues = validateDateRange({
      startDate: String(startDate || ''),
      endDate: String(endDate || ''),
      maxDays: INPUT_LIMITS.quarterlyDateRangeMaxDays,
      fieldPrefix: 'quarterlyRange',
    });
    if (rangeIssues.length) return invalidInput(res, rangeIssues);
  }
  if (trimString(singleSummary).length > INPUT_LIMITS.summaryTextMax) {
    return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
  }
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '保存学期总结',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/quarterly-summary', year },
      },
      async () => {
        const updatedByName = req.user?.name || null;
        const insertedQuarters: number[] = [];
        const upsert = async (quarter: number, summary: string, start?: string | null, end?: string | null) => {
          if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) return;
          const parsed = QuarterlySummarySchema.safeParse({ studentId, year, quarter, summary, startDate: start || undefined, endDate: end || undefined });
          if (!parsed.success) return;
          const existing = await db
            .select()
            .from(quarterlySummaryTable)
            .where(and(
              eq(quarterlySummaryTable.studentId, studentId),
              eq(quarterlySummaryTable.year, year),
              eq(quarterlySummaryTable.quarter, quarter)
            ))
            .limit(1);
          if (existing.length) {
            if (!clientUpdatedAt) {
              throw Object.assign(new Error('CONFLICT'), {
                code: 'CONFLICT',
                updatedAt: existing[0].updatedAt,
                updatedByName: existing[0].updatedByName,
              });
            }
            if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
              throw Object.assign(new Error('CONFLICT'), {
                code: 'CONFLICT',
                updatedAt: existing[0].updatedAt,
                updatedByName: existing[0].updatedByName,
              });
            }
            await db.update(quarterlySummaryTable)
              .set({
                summary,
                startDate: start || existing[0].startDate,
                endDate: end || existing[0].endDate,
                updatedAt: new Date(),
                updatedByName,
              })
              .where(eq(quarterlySummaryTable.id, existing[0].id));
          } else {
            await db.insert(quarterlySummaryTable).values({
              studentId,
              year,
              quarter,
              summary,
              startDate: start,
              endDate: end,
              updatedAt: new Date(),
              updatedByName,
            });
            insertedQuarters.push(quarter);
          }
        };

        if (Number.isFinite(singleQuarter) && typeof singleSummary !== 'undefined') {
          await upsert(singleQuarter, String(singleSummary || ""), startDate, endDate);
        } else {
          for (const item of summaries) {
            const quarter = Number(item.quarter);
            const summary = String(item.summary || "");
            await upsert(quarter, summary, item.startDate || null, item.endDate || null);
          }
        }
        if (insertedQuarters.length) {
          const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
          const student = studentRows[0];
          if (student) {
            const label = `第 ${insertedQuarters[0]} 学期`;
            const timeValue = startDate || format(new Date(), 'yyyy-MM-dd');
            await notifyParent({
              studentId,
              parentId: student.parentId ?? null,
              templateId: semesterTemplateId,
              page: `/pages/quarterly-summary/index?studentId=${studentId}`,
              data: buildTemplateData(
                semesterTemplateContentKey,
                `学期总结已发布 ${label}`,
                semesterTemplateTimeKey,
                timeValue,
              ),
            });
          }
        }
        res.json({ message: 'Quarterly summaries saved' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    if ((err as any)?.code === 'CONFLICT') {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: (err as any).updatedAt,
        updatedByName: (err as any).updatedByName,
      });
    }
    console.error('Error saving quarterly summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:studentId/yearly-summary', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  const year = parseFiniteInteger(req.query.year || new Date().getFullYear());
  if (year === null) return res.status(400).json({ error: 'Invalid year' });
  const yearIssue = validateYearRange(year, 'year');
  if (yearIssue) return invalidInput(res, [yearIssue]);
  try {
    const rows = await db
      .select()
      .from(yearlySummaryTable)
      .where(and(eq(yearlySummaryTable.studentId, studentId), eq(yearlySummaryTable.year, year)))
      .limit(1);
    res.json(rows[0] || {});
  } catch (err) {
    console.error('Error fetching yearly summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:studentId/yearly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const year = parseFiniteInteger(req.body?.year || new Date().getFullYear());
  const summary = String(req.body?.summary || "");
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (year === null) return res.status(400).json({ error: 'Invalid year' });
  const yearIssue = validateYearRange(year, 'year');
  if (yearIssue) return invalidInput(res, [yearIssue]);
  if (trimString(summary).length > INPUT_LIMITS.summaryTextMax) {
    return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
  }
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '保存年度总结',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/yearly-summary', year },
      },
      async () => {
        const parsed = YearlySummarySchema.safeParse({ studentId, year, summary });
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.flatten() });
          return;
        }
        const existing = await db
          .select()
          .from(yearlySummaryTable)
          .where(and(eq(yearlySummaryTable.studentId, studentId), eq(yearlySummaryTable.year, year)))
          .limit(1);
        if (existing.length) {
          if (!clientUpdatedAt) {
            res.status(409).json({
              error: 'CONFLICT',
              updatedAt: existing[0].updatedAt,
              updatedByName: existing[0].updatedByName,
            });
            return;
          }
          if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
            res.status(409).json({
              error: 'CONFLICT',
              updatedAt: existing[0].updatedAt,
              updatedByName: existing[0].updatedByName,
            });
            return;
          }
          await db.update(yearlySummaryTable)
            .set({ summary, updatedAt: new Date(), updatedByName: req.user?.name || null })
            .where(eq(yearlySummaryTable.id, existing[0].id));
          res.json({ message: 'Yearly summary updated' });
        } else {
          const result = await db
            .insert(yearlySummaryTable)
            .values({
              studentId,
              year,
              summary,
              updatedAt: new Date(),
              updatedByName: req.user?.name || null,
            })
            .returning();
          const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
          const student = studentRows[0];
          if (student) {
            await notifyParent({
              studentId,
              parentId: student.parentId ?? null,
              templateId: yearlyTemplateId,
              page: `/pages/yearly-summary/index?studentId=${studentId}`,
              data: buildTemplateData(
                yearlyTemplateContentKey,
                '年度总结已发布',
                yearlyTemplateTimeKey,
                `${year}-12-31`,
              ),
            });
          }
          res.status(201).json(result[0]);
        }
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error saving yearly summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== STUDENT REPORTS ROUTES ======
app.post('/api/reports', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const reportType = normalizeReportType(req.body?.reportType);
  if (!reportType) return res.status(400).json({ error: 'Invalid reportType' });

  const studentId = String(req.body?.studentId || '');
  const startDate = String(req.body?.startDate || '');
  const endDate = String(req.body?.endDate || '');
  const summary = String(req.body?.summary || '');
  const title = req.body?.title != null ? String(req.body.title) : null;
  const year = req.body?.year == null || req.body?.year === '' ? null : Number(req.body.year);
  if (!studentId || !startDate || !endDate) return res.status(400).json({ error: 'Missing required fields' });
  if (year != null && !Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
  if (!enforceReviewerScope(req, res, studentId)) return;
  const rangeIssues = validateDateRange({
    startDate,
    endDate,
    maxDays: INPUT_LIMITS.exportDateRangeMaxDays,
    fieldPrefix: 'reportRange',
  });
  if (rangeIssues.length) return invalidInput(res, rangeIssues);
  if (year != null) {
    const yearIssue = validateYearRange(year, 'year');
    if (yearIssue) return invalidInput(res, [yearIssue]);
  }
  const reportIssues = validateReportInput({
    title,
    summary,
    finalReport: req.body?.finalReport ?? req.body?.structuredReport,
    structuredReport: req.body?.structuredReport,
  });
  if (reportIssues.length) return invalidInput(res, reportIssues);

  const parsed = StudentReportSchema.safeParse({
    studentId,
    reportType,
    title,
    startDate,
    endDate,
    year,
    summaryText: summary,
    analyticsJson: req.body?.analytics,
    structuredReportJson: req.body?.structuredReport,
    finalReportJson: req.body?.finalReport ?? req.body?.structuredReport,
    rawAiResponse: req.body?.rawAiResponse ?? null,
    parseError: req.body?.parseError ?? null,
    status: normalizeReportStatus(req.body?.status),
    visibleToParent: parseBooleanLike(req.body?.visibleToParent) ?? false,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const student = await getStudentById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '保存学习报告',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/reports', reportType },
      },
      async () => {
        const normalizedPayload = normalizeReportPayload({
          reportType,
          structuredReport: parsed.data.structuredReportJson,
          finalReport: parsed.data.finalReportJson,
          analytics: parsed.data.analyticsJson,
        });

        const created = await db
          .insert(studentReportsTable)
          .values({
            studentId,
            reportType,
            title: parsed.data.title || null,
            startDate,
            endDate,
            year: year == null ? null : Math.trunc(year),
            summaryText: parsed.data.summaryText,
            analyticsJson: serializeReportJson(parsed.data.analyticsJson),
            structuredReportJson: normalizedPayload.structuredReportJson,
            finalReportJson: normalizedPayload.finalReportJson,
            rawAiResponse: parsed.data.rawAiResponse || null,
            parseError: parsed.data.parseError || null,
            status: parsed.data.status,
            visibleToParent: parsed.data.visibleToParent,
            createdBy: req.user?.id || null,
            updatedBy: req.user?.id || null,
            updatedAt: new Date(),
            updatedByName: req.user?.name || null,
          })
          .returning();

        res
          .status(201)
          .json(hydrateStudentReport(created[0], req.user?.role || 'teacher', { includeHeavyFields: true }));
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error saving report:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:studentId/reports', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const student = await getStudentById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!canUserListStudentReports({ user, studentParentId: student.parentId ?? null })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const whereExpr = [eq(studentReportsTable.studentId, studentId)];
    const reportType = normalizeReportType(req.query?.reportType);
    if (reportType) whereExpr.push(eq(studentReportsTable.reportType, reportType));
    if (req.query?.year != null && req.query?.year !== '') {
      const year = Number(req.query.year);
      if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
      whereExpr.push(eq(studentReportsTable.year, Math.trunc(year)));
    }

    const visibleQuery = parseBooleanLike(req.query?.visibleToParent);
    if (isManagerRole(user.role)) {
      if (visibleQuery != null) whereExpr.push(eq(studentReportsTable.visibleToParent, visibleQuery));
    } else {
      whereExpr.push(eq(studentReportsTable.visibleToParent, true));
    }

    const whereClause = whereExpr.length > 1 ? and(...whereExpr) : whereExpr[0];
    const rows = await db
      .select({
        id: studentReportsTable.id,
        studentId: studentReportsTable.studentId,
        reportType: studentReportsTable.reportType,
        title: studentReportsTable.title,
        startDate: studentReportsTable.startDate,
        endDate: studentReportsTable.endDate,
        year: studentReportsTable.year,
        summaryText: studentReportsTable.summaryText,
        analyticsJson: studentReportsTable.analyticsJson,
        structuredReportJson: studentReportsTable.structuredReportJson,
        finalReportJson: studentReportsTable.finalReportJson,
        rawAiResponse: studentReportsTable.rawAiResponse,
        parseError: studentReportsTable.parseError,
        status: studentReportsTable.status,
        visibleToParent: studentReportsTable.visibleToParent,
        createdBy: studentReportsTable.createdBy,
        updatedBy: studentReportsTable.updatedBy,
        createdAt: studentReportsTable.createdAt,
        updatedAt: studentReportsTable.updatedAt,
        updatedByName: studentReportsTable.updatedByName,
      })
      .from(studentReportsTable)
      .where(whereClause)
      .orderBy(desc(studentReportsTable.updatedAt), desc(studentReportsTable.createdAt));

    return res.json(rows.map((row) => hydrateStudentReport(row, user.role, { includeHeavyFields: false })));
  } catch (err) {
    console.error('Error listing reports:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/reports/:reportId', authenticate, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  try {
    const report = await getReportWithStudent(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const allowed = canUserAccessReport({
      user,
      studentParentId: report.studentParentId ?? null,
      reportVisibleToParent: report.visibleToParent,
      studentId: report.studentId,
    });
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

    return res.json(hydrateStudentReport(report, user.role, { includeHeavyFields: true }));
  } catch (err) {
    console.error('Error fetching report:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/reports/:reportId', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  try {
    const report = await getReportWithStudent(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!enforceReviewerScope(req, res, report.studentId)) return;

    await withActionLock(
      {
        lockKey: studentWriteLockKey(report.studentId),
        actionType: '更新学习报告',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/reports/${req.params.reportId}` },
      },
      async () => {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
          updatedBy: user.id,
          updatedByName: user.name || null,
        };

        if (req.body?.title !== undefined) updates.title = req.body?.title == null ? null : String(req.body.title);
        if (req.body?.summary !== undefined) updates.summaryText = String(req.body.summary || '');
        if (req.body?.status !== undefined) updates.status = normalizeReportStatus(req.body.status);
        const visible = parseBooleanLike(req.body?.visibleToParent);
        if (visible != null) updates.visibleToParent = visible;

        const reportType = normalizeReportType(report.reportType);
        if (reportType && req.body?.finalReport !== undefined) {
          const normalizedPayload = normalizeReportPayload({
            reportType,
            structuredReport: report.structuredReportJson,
            finalReport: req.body?.finalReport,
            analytics: report.analyticsJson,
          });
          updates.finalReportJson = normalizedPayload.finalReportJson;
        }
        const reportIssues = validateReportInput({
          title: req.body?.title,
          summary: req.body?.summary,
          finalReport: req.body?.finalReport,
        });
        if (reportIssues.length) {
          res.status(400).json({ error: 'INVALID_INPUT', details: reportIssues });
          return;
        }

        if (Object.keys(updates).length <= 3) {
          res.status(400).json({ error: 'No valid fields to update' });
          return;
        }

        const saved = await db
          .update(studentReportsTable)
          .set(updates)
          .where(eq(studentReportsTable.id, req.params.reportId))
          .returning();
        if (!saved.length) {
          res.status(404).json({ error: 'Report not found' });
          return;
        }
        if (visible === true && !report.visibleToParent) {
          await notifyParentStudentReportPublished({
            id: report.id,
            studentId: report.studentId,
            studentParentId: report.studentParentId,
            reportType: report.reportType,
            endDate: report.endDate,
          });
        }
        res.json(hydrateStudentReport(saved[0], user.role, { includeHeavyFields: true }));
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating report:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/reports/:reportId/visibility', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  const visible = parseBooleanLike(req.body?.visibleToParent);
  if (visible == null) return res.status(400).json({ error: 'visibleToParent must be boolean' });

  try {
    const existing = await getReportWithStudent(req.params.reportId);
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    if (!enforceReviewerScope(req, res, existing.studentId)) return;

    await withActionLock(
      {
        lockKey: studentWriteLockKey(existing.studentId),
        actionType: '发布学习报告',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/reports/${req.params.reportId}/visibility`, visibleToParent: visible },
      },
      async () => {
        const saved = await db
          .update(studentReportsTable)
          .set({
            visibleToParent: visible,
            updatedAt: new Date(),
            updatedBy: user.id,
            updatedByName: user.name || null,
          })
          .where(eq(studentReportsTable.id, req.params.reportId))
          .returning();
        if (visible && !existing.visibleToParent) {
          await notifyParentStudentReportPublished({
            id: existing.id,
            studentId: existing.studentId,
            studentParentId: existing.studentParentId,
            reportType: existing.reportType,
            endDate: existing.endDate,
          });
        }
        res.json(hydrateStudentReport(saved[0], user.role, { includeHeavyFields: false }));
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating report visibility:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/reports/:reportId', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  try {
    const report = await getReportWithStudent(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!enforceReviewerScope(req, res, report.studentId)) return;

    const allowed = canUserManageReport({
      user,
      studentParentId: report.studentParentId ?? null,
      studentId: report.studentId,
    });
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

    await withActionLock(
      {
        lockKey: studentWriteLockKey(report.studentId),
        actionType: '删除学习报告',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/reports/${req.params.reportId}` },
      },
      async () => {
        const deleted = await db
          .delete(studentReportsTable)
          .where(eq(studentReportsTable.id, req.params.reportId))
          .returning({ id: studentReportsTable.id });
        if (!deleted.length) {
          res.status(404).json({ error: 'Report not found' });
          return;
        }
        res.json({ success: true });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error deleting report:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ====== ACADEMIC TERMS (Part 8) ======
//
// Configurable per-year term windows (WA1 / WA2 / WA3 / FINALS). Used by the
// Part 7 term analytics endpoint to default the date window when caller
// omits startDate/endDate.

app.get('/api/academic-terms', authenticate, requireTeacher, async (_, res) => {
  try {
    const rows = await db
      .select()
      .from(academicTermsTable)
      .orderBy(desc(academicTermsTable.year), academicTermsTable.startDate);
    res.json(rows);
  } catch (err) {
    console.error('Error listing academic terms:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/academic-terms', authenticate, requireTeacher, async (req, res) => {
  const parsed = AcademicTermSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { year, termType, startDate, endDate, notes } = parsed.data;
  if (startDate > endDate) return res.status(400).json({ error: 'startDate must be <= endDate' });
  try {
    const [row] = await db
      .insert(academicTermsTable)
      .values({
        year,
        termType,
        startDate,
        endDate,
        notes: notes ?? null,
        updatedAt: new Date(),
        updatedByName: req.user?.name || null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    // Duplicate (year, termType) hits the unique index — surface a clean 409.
    if (String((err as { message?: string })?.message || '').includes('uq_academic_terms_year_term')) {
      return res.status(409).json({ error: 'Term already exists for this (year, termType)' });
    }
    console.error('Error creating academic term:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/academic-terms/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  const parsed = AcademicTermSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (!clientUpdatedAt) return res.status(400).json({ error: 'Missing updatedAt' });
  const { year, termType, startDate, endDate, notes } = parsed.data;
  if (startDate > endDate) return res.status(400).json({ error: 'startDate must be <= endDate' });
  try {
    const existing = await db.select().from(academicTermsTable).where(eq(academicTermsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Term not found' });
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    const [row] = await db
      .update(academicTermsTable)
      .set({
        year,
        termType,
        startDate,
        endDate,
        notes: notes ?? null,
        updatedAt: new Date(),
        updatedByName: req.user?.name || null,
      })
      .where(eq(academicTermsTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    console.error('Error updating academic term:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/academic-terms/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) return res.status(400).json({ error: 'Missing updatedAt' });
    const existing = await db.select().from(academicTermsTable).where(eq(academicTermsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Term not found' });
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    await db.delete(academicTermsTable).where(eq(academicTermsTable.id, id));
    res.json({ message: 'Term deleted' });
  } catch (err) {
    console.error('Error deleting academic term:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/academic-terms/current', authenticate, requireTeacher, async (req, res) => {
  try {
    const requested = req.query?.date;
    const date = requested ? parseDateString(requested) : chinaTodayDateString();
    if (!date) return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });
    const rows = await db.select().from(academicTermsTable);
    const term = pickCurrentTerm(rows, date);
    res.json({ date, term });
  } catch (err) {
    console.error('Error resolving current term:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== STUDENT ANALYTICS (Part 7) ======
//
// Three reporting windows: term / half-year / year. Each returns
// { current, previous, subjectProgress }.
//   - current/previous metrics: attendance + presentRate, English stats,
//     English task completion (per-task ratios + cycles fully completed),
//     loss-point histogram, exam score trend.
//   - subjectProgress: snapshot at "now" (topic-progress isn't time-versioned),
//     so it's the same in current and previous; we return it once at the
//     top level.
// All endpoints require studentId via query string and respect the parent
// access middleware.

// Shared handler factory keeps the three endpoints DRY.
const buildAnalyticsHandler = (
  resolvePeriod: (req: import('express').Request) => { startDate: string; endDate: string } | { error: string },
) => async (req: import('express').Request, res: import('express').Response) => {
  const studentIdParam = String(req.query?.studentId || '');
  if (!studentIdParam) return res.status(400).json({ error: 'Missing studentId' });
  const period = resolvePeriod(req);
  if ('error' in period) return res.status(400).json({ error: period.error });
  try {
    const lossPointLookup = await loadLossPointLookup();
    const helpers = { lossPointLookup, normalizeActivities };
    const [current, previous, subjectProgress] = await Promise.all([
      computeAnalyticsForPeriod(db, studentIdParam, period.startDate, period.endDate, helpers),
      (async () => {
        const prev = previousPeriod(period);
        return computeAnalyticsForPeriod(db, studentIdParam, prev.startDate, prev.endDate, helpers);
      })(),
      getSubjectProgressSummary(studentIdParam),
    ]);
    res.json({ current, previous, subjectProgress });
  } catch (err) {
    console.error('Error computing analytics:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// Year: defaults to the current calendar year (CST). Override via ?startDate=&endDate=.
app.get(
  '/api/analytics/student/year',
  authenticate,
  verifyParentStudentAccess,
  buildAnalyticsHandler((req) => {
    const startQ = req.query?.startDate ? parseDateString(req.query.startDate) : null;
    const endQ = req.query?.endDate ? parseDateString(req.query.endDate) : null;
    if ((startQ && !endQ) || (!startQ && endQ)) return { error: 'Provide both startDate and endDate or neither' };
    if (startQ && endQ) {
      if (startQ > endQ) return { error: 'startDate must be <= endDate' };
      return { startDate: startQ, endDate: endQ };
    }
    return defaultYearPeriod();
  }),
);

// Half-year: defaults to current half (H1 / H2 in CST). Override via ?startDate=&endDate=.
app.get(
  '/api/analytics/student/half-year',
  authenticate,
  verifyParentStudentAccess,
  buildAnalyticsHandler((req) => {
    const startQ = req.query?.startDate ? parseDateString(req.query.startDate) : null;
    const endQ = req.query?.endDate ? parseDateString(req.query.endDate) : null;
    if ((startQ && !endQ) || (!startQ && endQ)) return { error: 'Provide both startDate and endDate or neither' };
    if (startQ && endQ) {
      if (startQ > endQ) return { error: 'startDate must be <= endDate' };
      return { startDate: startQ, endDate: endQ };
    }
    const half = defaultHalfYearPeriod();
    return { startDate: half.startDate, endDate: half.endDate };
  }),
);

// Term: defaults to the academic_term covering today CST when no dates are
// provided. If no term covers today, callers MUST supply startDate+endDate.
app.get(
  '/api/analytics/student/term',
  authenticate,
  verifyParentStudentAccess,
  async (req, res) => {
    const studentIdParam = String(req.query?.studentId || '');
    if (!studentIdParam) return res.status(400).json({ error: 'Missing studentId' });
    const startQ = req.query?.startDate ? parseDateString(req.query.startDate) : null;
    const endQ = req.query?.endDate ? parseDateString(req.query.endDate) : null;
    if ((startQ && !endQ) || (!startQ && endQ)) {
      return res.status(400).json({ error: 'Provide both startDate and endDate or neither' });
    }
    let period: { startDate: string; endDate: string };
    let resolvedTerm: ReturnType<typeof pickCurrentTerm> = null;
    if (startQ && endQ) {
      if (startQ > endQ) return res.status(400).json({ error: 'startDate must be <= endDate' });
      period = { startDate: startQ, endDate: endQ };
    } else {
      // Default to the academic_term covering today.
      const today = chinaTodayDateString();
      const termRows = await db.select().from(academicTermsTable);
      resolvedTerm = pickCurrentTerm(termRows, today);
      if (!resolvedTerm) {
        return res.status(400).json({
          error: 'No academic term covers today; pass startDate and endDate explicitly or configure a term via POST /api/academic-terms',
        });
      }
      period = { startDate: resolvedTerm.startDate, endDate: resolvedTerm.endDate };
    }
    try {
      const lossPointLookup = await loadLossPointLookup();
      const helpers = { lossPointLookup, normalizeActivities };
      const [current, previous, subjectProgress] = await Promise.all([
        computeAnalyticsForPeriod(db, studentIdParam, period.startDate, period.endDate, helpers),
        (async () => {
          const prev = previousPeriod(period);
          return computeAnalyticsForPeriod(db, studentIdParam, prev.startDate, prev.endDate, helpers);
        })(),
        getSubjectProgressSummary(studentIdParam),
      ]);
      res.json({ current, previous, subjectProgress, term: resolvedTerm });
    } catch (err) {
      console.error('Error computing term analytics:', err);
      res.status(500).json({ error: 'Database error' });
    }
  },
);

// ====== REPORT EXPORT ======
// Generate a student summary report within a custom date range.
// Currently supports markdown export for Mini Program preview/copy/share flows.
app.get('/api/students/:studentId/report-export', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  const startDate = parseDateString(req.query?.startDate);
  const endDate = parseDateString(req.query?.endDate);
  const formatType = String(req.query?.format || 'markdown').toLowerCase();

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'startDate must be <= endDate' });
  }
  const exportRangeIssues = validateDateRange({
    startDate,
    endDate,
    maxDays: INPUT_LIMITS.exportDateRangeMaxDays,
    fieldPrefix: 'exportRange',
  });
  if (exportRangeIssues.length) return invalidInput(res, exportRangeIssues);
  if (formatType !== 'markdown') {
    return res.status(400).json({ error: 'Only markdown export is currently supported' });
  }

  try {
    const studentRows = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId))
      .limit(1);
    if (!studentRows.length) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = studentRows[0];

    const [subjectProgress, dailyRows, weeklyRows, paperRows, examRows] = await Promise.all([
      getSubjectProgressSummary(studentId),
      db
        .select()
        .from(dailyProgress)
        .where(
          and(
            eq(dailyProgress.studentId, studentId),
            gte(dailyProgress.date, startDate),
            lte(dailyProgress.date, endDate),
          )
        )
        .orderBy(dailyProgress.date),
      db
        .select()
        .from(weeklyFeedback)
        .where(
          and(
            eq(weeklyFeedback.studentId, studentId),
            gte(weeklyFeedback.weekStarting, startDate),
            lte(weeklyFeedback.weekStarting, endDate),
          )
        )
        .orderBy(weeklyFeedback.weekStarting),
      db
        .select({
          id: studentPapersTable.id,
          date: studentPapersTable.date,
          subjectName: studentPapersTable.subjectName,
          typeName: paperTypesTable.name,
          schoolName: paperSchoolsTable.name,
          description: studentPapersTable.description,
          score: studentPapersTable.score,
          total: studentPapersTable.total,
          strengths: studentPapersTable.strengths,
          improvements: studentPapersTable.improvements,
        })
        .from(studentPapersTable)
        .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
        .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
        .where(
          and(
            eq(studentPapersTable.studentId, studentId),
            gte(studentPapersTable.date, startDate),
            lte(studentPapersTable.date, endDate),
          )
        )
        .orderBy(studentPapersTable.date),
      db
        .select()
        .from(examsTable)
        .where(
          and(
            eq(examsTable.studentId, studentId),
            gte(examsTable.examDate, startDate),
            lte(examsTable.examDate, endDate),
          )
        )
        .orderBy(examsTable.examDate),
    ]);

    const examIds = examRows.map((e) => e.id);
    const scoreRows = examIds.length
      ? await db.select().from(examScoresTable).where(inArray(examScoresTable.examId, examIds))
      : [];
    const scoreMap = new Map<string, Array<{ name: string; score: string; scope: string | null }>>();
    scoreRows.forEach((row) => {
      const list = scoreMap.get(row.examId) || [];
      list.push({ name: row.name, score: row.score, scope: row.scope ?? null });
      scoreMap.set(row.examId, list);
    });
    const exams = examRows.map((exam) => ({
      ...exam,
      subjects: scoreMap.get(exam.id) || [],
    }));

    const normalizedDaily = dailyRows.map(withV2Activities);
    const hasData =
      normalizedDaily.length > 0 ||
      weeklyRows.length > 0 ||
      paperRows.length > 0 ||
      exams.length > 0;

    if (!hasData) {
      return res.json({
        format: 'markdown',
        hasData: false,
        message: '所选日期范围内暂无可导出的学习数据',
      });
    }

    const content = buildMarkdownReport({
      studentName: student.name,
      grade: student.grade,
      startDate,
      endDate,
      subjectProgress,
      daily: normalizedDaily,
      weekly: weeklyRows,
      papers: paperRows,
      exams,
    });

    const safeStudentName = String(student.name || 'student').replace(/[\\/:*?"<>|\s]+/g, '_');
    const fileName = `${safeStudentName}_${startDate}_${endDate}_summary.md`;

    res.json({
      format: 'markdown',
      hasData: true,
      fileName,
      content,
      stats: {
        dailyCount: normalizedDaily.length,
        weeklyCount: weeklyRows.length,
        paperCount: paperRows.length,
        examCount: exams.length,
      },
    });
  } catch (err) {
    console.error('Error exporting report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== SUBJECT & TOPIC ROUTES ======
// List all subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const defaultLevel = await ensureDefaultSubjectLevel();
    const includeInactive = parseBooleanLike(req.query?.includeInactive) === true;
    const subjects = await db
      .select({
        id: subjectsTable.id,
        code: subjectsTable.code,
        name: subjectsTable.name,
        chineseName: subjectsTable.chineseName,
        englishName: subjectsTable.englishName,
        level: subjectsTable.level,
        sortOrder: subjectsTable.sortOrder,
        isRequired: subjectsTable.isRequired,
        levelId: subjectsTable.levelId,
        isActive: subjectsTable.isActive,
        createdAt: subjectsTable.createdAt,
        levelName: subjectLevelsTable.name,
      })
      .from(subjectsTable)
      .leftJoin(subjectLevelsTable, eq(subjectsTable.levelId, subjectLevelsTable.id))
      .where(includeInactive ? undefined : eq(subjectsTable.isActive, true))
      .orderBy(subjectsTable.name);
    res.json(
      subjects.map((s) => ({
        ...s,
        levelId: s.levelId || defaultLevel.id,
        levelName: s.levelName || DEFAULT_SUBJECT_LEVEL_NAME,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/subject-levels', authenticate, requireRole('teacher', 'admin'), async (_, res) => {
  try {
    const defaultLevel = await ensureDefaultSubjectLevel();
    const levels = await db
      .select()
      .from(subjectLevelsTable)
      .where(eq(subjectLevelsTable.isActive, true))
      .orderBy(subjectLevelsTable.sortOrder, subjectLevelsTable.name);
    const hasDefault = levels.some((l) => l.id === defaultLevel.id);
    const out = hasDefault ? levels : [defaultLevel, ...levels];
    res.json(out);
  } catch (err) {
    console.error('Error listing subject levels:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/subject-levels', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subject levels' });
  const name = sanitizeLevelName(req.body?.name);
  const description = sanitizeLevelDescription(req.body?.description);
  const sortOrder = sanitizeSortOrder(req.body?.sortOrder, 0);
  if (!name) {
    return invalidInput(res, [{ field: 'name', message: '层级名称不能为空' }]);
  }
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '新增科目层级',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subject-levels' },
      },
      async () => {
        const existed = await db
          .select({ id: subjectLevelsTable.id })
          .from(subjectLevelsTable)
          .where(eq(subjectLevelsTable.name, name))
          .limit(1);
        if (existed.length) {
          res.status(409).json({ error: 'Level name already exists' });
          return;
        }
        const now = new Date();
        const created = await db
          .insert(subjectLevelsTable)
          .values({
            name,
            description,
            sortOrder,
            isDefault: false,
            isActive: true,
            createdBy: req.user?.id || null,
            updatedBy: req.user?.id || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating subject level:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/subject-levels/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subject levels' });
  const id = req.params.id;
  const name = sanitizeLevelName(req.body?.name);
  const description = sanitizeLevelDescription(req.body?.description);
  const sortOrder = sanitizeSortOrder(req.body?.sortOrder, 0);
  const isActive = parseBooleanInput(req.body?.isActive, true);
  if (!name) {
    return invalidInput(res, [{ field: 'name', message: '层级名称不能为空' }]);
  }
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '更新科目层级',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subject-levels/:id', id },
      },
      async () => {
        const existing = await db
          .select()
          .from(subjectLevelsTable)
          .where(eq(subjectLevelsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Level not found' });
          return;
        }
        if (existing[0].isDefault && !isActive) {
          res.status(400).json({ error: 'Default level cannot be disabled' });
          return;
        }
        const duplicate = await db
          .select({ id: subjectLevelsTable.id })
          .from(subjectLevelsTable)
          .where(eq(subjectLevelsTable.name, name))
          .limit(1);
        if (duplicate.length && duplicate[0].id !== id) {
          res.status(409).json({ error: 'Level name already exists' });
          return;
        }
        const updated = await db
          .update(subjectLevelsTable)
          .set({
            name,
            description,
            sortOrder,
            isActive,
            updatedBy: req.user?.id || null,
            updatedAt: new Date(),
          })
          .where(eq(subjectLevelsTable.id, id))
          .returning();
        res.json(updated[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating subject level:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/subject-levels/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subject levels' });
  const id = req.params.id;
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '删除科目层级',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subject-levels/:id', id },
      },
      async () => {
        const existing = await db
          .select()
          .from(subjectLevelsTable)
          .where(eq(subjectLevelsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Level not found' });
          return;
        }
        if (existing[0].isDefault) {
          res.status(400).json({ error: 'Default level cannot be deleted' });
          return;
        }
        const usedSubjects = await db
          .select({ id: subjectsTable.id })
          .from(subjectsTable)
          .where(eq(subjectsTable.levelId, id));
        if (usedSubjects.length) {
          res.status(400).json({ error: 'Level has subjects and cannot be deleted' });
          return;
        }
        await db.delete(subjectLevelsTable).where(eq(subjectLevelsTable.id, id));
        res.json({ success: true });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error deleting subject level:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/subjects/hierarchy', authenticate, requireRole('teacher', 'admin'), async (_, res) => {
  try {
    const defaultLevel = await ensureDefaultSubjectLevel();
    const levels = await db
      .select()
      .from(subjectLevelsTable)
      .where(eq(subjectLevelsTable.isActive, true))
      .orderBy(subjectLevelsTable.sortOrder, subjectLevelsTable.name);
    const subjectRows = await db
      .select({
        id: subjectsTable.id,
        code: subjectsTable.code,
        name: subjectsTable.name,
        chineseName: subjectsTable.chineseName,
        englishName: subjectsTable.englishName,
        level: subjectsTable.level,
        levelId: subjectsTable.levelId,
        isRequired: subjectsTable.isRequired,
        sortOrder: subjectsTable.sortOrder,
        isActive: subjectsTable.isActive,
      })
      .from(subjectsTable)
      .where(eq(subjectsTable.isActive, true))
      .orderBy(subjectsTable.sortOrder, subjectsTable.name);
    const topicRows = await db
      .select({
        id: topicsTable.id,
        subjectId: topicsTable.subjectId,
        code: topicsTable.code,
        title: topicsTable.title,
        parentTopicId: topicsTable.parentTopicId,
        orderIndex: topicsTable.orderIndex,
      })
      .from(topicsTable)
      .orderBy(topicsTable.orderIndex, topicsTable.code);

    const levelMap = new Map<string, any>();
    [...levels, defaultLevel].forEach((level) => {
      levelMap.set(level.id, {
        ...level,
        subjects: [],
      });
    });
    const subjectMap = new Map<string, any>();
    for (const subject of subjectRows) {
      const resolvedLevelId = subject.levelId || defaultLevel.id;
      const level = levelMap.get(resolvedLevelId) || levelMap.get(defaultLevel.id);
      const subjectNode = { ...subject, levelId: resolvedLevelId, topics: [] as any[] };
      subjectMap.set(subject.id, subjectNode);
      if (level) level.subjects.push(subjectNode);
    }
    const topicById = new Map<string, any>();
    for (const topic of topicRows) {
      const node = { ...topic, children: [] as any[] };
      topicById.set(topic.id, node);
    }
    for (const topic of topicById.values()) {
      if (topic.parentTopicId && topicById.has(topic.parentTopicId)) {
        topicById.get(topic.parentTopicId).children.push(topic);
      } else if (subjectMap.has(topic.subjectId)) {
        subjectMap.get(topic.subjectId).topics.push(topic);
      }
    }
    const normalizedLevels = Array.from(levelMap.values())
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)))
      .map((level) => ({
        ...level,
        subjects: (level.subjects || []).sort(
          (a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)),
        ),
      }));
    res.json({ levels: normalizedLevels, defaultLevelId: defaultLevel.id });
  } catch (err) {
    console.error('Error fetching subject hierarchy:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/subjects', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subjects' });
  const code = trimString(req.body?.code).toUpperCase().slice(0, 64);
  const chineseName = trimString(req.body?.chineseName).slice(0, 120);
  const englishName = trimString(req.body?.englishName).slice(0, 120);
  const fallbackName = trimString(req.body?.name).slice(0, 200);
  const name = fallbackName || chineseName || englishName;
  const levelNameFallback = trimString(req.body?.level).slice(0, 64) || DEFAULT_SUBJECT_LEVEL_NAME;
  const sortOrder = sanitizeSortOrder(req.body?.sortOrder, 0);
  const isRequired = parseBooleanInput(req.body?.isRequired, false);
  const isActive = parseBooleanInput(req.body?.isActive, true);
  if (!code) return invalidInput(res, [{ field: 'code', message: '科目 code 不能为空' }]);
  if (!name) return invalidInput(res, [{ field: 'name', message: '科目名称不能为空' }]);
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '新增科目',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subjects', code },
      },
      async () => {
        const defaultLevel = await ensureDefaultSubjectLevel();
        const levelIdInput = trimString(req.body?.levelId);
        const levelId = levelIdInput || defaultLevel.id;
        let resolvedLevelName = levelNameFallback;
        if (levelIdInput) {
          const level = await db
            .select({ id: subjectLevelsTable.id, name: subjectLevelsTable.name })
            .from(subjectLevelsTable)
            .where(eq(subjectLevelsTable.id, levelIdInput))
            .limit(1);
          if (!level.length) {
            res.status(400).json({ error: 'Invalid levelId' });
            return;
          }
          resolvedLevelName = trimString(level[0].name).slice(0, 64) || levelNameFallback;
        } else {
          resolvedLevelName = trimString(defaultLevel.name).slice(0, 64) || levelNameFallback;
        }
        const parsed = SubjectSchema.safeParse({
          code,
          name,
          level: resolvedLevelName,
          chineseName: chineseName || null,
          englishName: englishName || null,
          sortOrder,
          isRequired,
          levelId,
          isActive,
        });
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.flatten() });
          return;
        }
        const exists = await db
          .select({ id: subjectsTable.id, isActive: subjectsTable.isActive })
          .from(subjectsTable)
          .where(eq(subjectsTable.code, code))
          .limit(1);
        if (exists.length) {
          const existing = exists[0];
          if (existing.isActive !== false) {
            res.status(409).json({ error: 'Subject code already exists' });
            return;
          }
          // Reuse inactive subject row for the same code instead of forcing
          // a brand-new code. This keeps historical references stable.
          const reactivated = await db
            .update(subjectsTable)
            .set({
              name,
              chineseName: chineseName || null,
              englishName: englishName || null,
              level: resolvedLevelName,
              sortOrder,
              isRequired,
              levelId,
              isActive: true,
              updatedBy: req.user?.id || null,
              updatedAt: new Date(),
            })
            .where(eq(subjectsTable.id, existing.id))
            .returning();
          res.status(200).json({ ...reactivated[0], reactivated: true });
          return;
        }
        const created = await db
          .insert(subjectsTable)
          .values({
            code,
            name,
            chineseName: chineseName || null,
            englishName: englishName || null,
            level: resolvedLevelName,
            sortOrder,
            isRequired,
            levelId,
            isActive,
            createdAt: new Date(),
          })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating subject:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/subjects/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subjects' });
  const id = req.params.id;
  const code = trimString(req.body?.code).toUpperCase().slice(0, 64);
  const chineseName = trimString(req.body?.chineseName).slice(0, 120);
  const englishName = trimString(req.body?.englishName).slice(0, 120);
  const fallbackName = trimString(req.body?.name).slice(0, 200);
  const name = fallbackName || chineseName || englishName;
  const levelNameFallback = trimString(req.body?.level).slice(0, 64) || DEFAULT_SUBJECT_LEVEL_NAME;
  const sortOrder = sanitizeSortOrder(req.body?.sortOrder, 0);
  const isRequired = parseBooleanInput(req.body?.isRequired, false);
  const isActive = parseBooleanInput(req.body?.isActive, true);
  if (!code) return invalidInput(res, [{ field: 'code', message: '科目 code 不能为空' }]);
  if (!name) return invalidInput(res, [{ field: 'name', message: '科目名称不能为空' }]);
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '更新科目',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subjects/:id', id },
      },
      async () => {
        const existing = await db
          .select()
          .from(subjectsTable)
          .where(eq(subjectsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Subject not found' });
          return;
        }
        const defaultLevel = await ensureDefaultSubjectLevel();
        const levelIdInput = trimString(req.body?.levelId);
        const levelId = levelIdInput || existing[0].levelId || defaultLevel.id;
        let resolvedLevelName = levelNameFallback || existing[0].level || DEFAULT_SUBJECT_LEVEL_NAME;
        if (levelIdInput) {
          const level = await db
            .select({ id: subjectLevelsTable.id, name: subjectLevelsTable.name })
            .from(subjectLevelsTable)
            .where(eq(subjectLevelsTable.id, levelIdInput))
            .limit(1);
          if (!level.length) {
            res.status(400).json({ error: 'Invalid levelId' });
            return;
          }
          resolvedLevelName = trimString(level[0].name).slice(0, 64) || resolvedLevelName;
        } else if (levelId === defaultLevel.id) {
          resolvedLevelName = trimString(defaultLevel.name).slice(0, 64) || resolvedLevelName;
        }
        const duplicate = await db
          .select({ id: subjectsTable.id })
          .from(subjectsTable)
          .where(eq(subjectsTable.code, code))
          .limit(1);
        if (duplicate.length && duplicate[0].id !== id) {
          res.status(409).json({ error: 'Subject code already exists' });
          return;
        }
        const parsed = SubjectSchema.safeParse({
          code,
          name,
          level: resolvedLevelName,
          chineseName: chineseName || null,
          englishName: englishName || null,
          sortOrder,
          isRequired,
          levelId,
          isActive,
        });
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.flatten() });
          return;
        }
        const updated = await db
          .update(subjectsTable)
          .set({
            code,
            name,
            chineseName: chineseName || null,
            englishName: englishName || null,
            level: resolvedLevelName,
            sortOrder,
            isRequired,
            levelId,
            isActive,
          })
          .where(eq(subjectsTable.id, id))
          .returning();
        res.json(updated[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating subject:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/subjects/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage subjects' });
  const id = req.params.id;
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '删除科目',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subjects/:id', id },
      },
      async () => {
        const existing = await db
          .select({ id: subjectsTable.id, code: subjectsTable.code, isRequired: subjectsTable.isRequired })
          .from(subjectsTable)
          .where(eq(subjectsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Subject not found' });
          return;
        }
        if (existing[0].isRequired || String(existing[0].code || '').toUpperCase() === 'ENGLISH') {
          res.status(400).json({ error: 'Core required subject cannot be deleted' });
          return;
        }
        const topicRows = await db
          .select({ id: topicsTable.id })
          .from(topicsTable)
          .where(eq(topicsTable.subjectId, id));
        const topicIds = topicRows.map((row) => row.id);

        if (topicIds.length) {
          await db
            .delete(studentTopicProgressTable)
            .where(inArray(studentTopicProgressTable.topicId, topicIds));
          await db.delete(topicsTable).where(eq(topicsTable.subjectId, id));
        }

        await db.delete(studentSubjectsTable).where(eq(studentSubjectsTable.subjectId, id));
        await db.delete(studentPapersTable).where(eq(studentPapersTable.subjectId, id));
        await db.delete(subjectsTable).where(eq(subjectsTable.id, id));
        res.json({ success: true });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error deleting subject:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/subjects/:subjectId/topics', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage topics' });
  const { subjectId } = req.params;
  const code = trimString(req.body?.code).slice(0, 64);
  const title = trimString(req.body?.title).slice(0, 256);
  const orderIndex = trimString(req.body?.orderIndex).slice(0, 32);
  const parentTopicId = trimString(req.body?.parentTopicId) || null;
  if (!code) return invalidInput(res, [{ field: 'code', message: '章节 code 不能为空' }]);
  if (!title) return invalidInput(res, [{ field: 'title', message: '章节名称不能为空' }]);
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '新增章节',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/subjects/:subjectId/topics', subjectId },
      },
      async () => {
        const subject = await db
          .select({ id: subjectsTable.id })
          .from(subjectsTable)
          .where(eq(subjectsTable.id, subjectId))
          .limit(1);
        if (!subject.length) {
          res.status(404).json({ error: 'Subject not found' });
          return;
        }
        const parsed = TopicSchema.safeParse({
          subjectId,
          code,
          title,
          parentTopicId,
          orderIndex: orderIndex || code,
        });
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.flatten() });
          return;
        }
        const created = await db
          .insert(topicsTable)
          .values({
            subjectId,
            code,
            title,
            parentTopicId,
            orderIndex: orderIndex || code,
            createdAt: new Date(),
          })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating topic:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/topics/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage topics' });
  const id = req.params.id;
  const code = trimString(req.body?.code).slice(0, 64);
  const title = trimString(req.body?.title).slice(0, 256);
  const orderIndex = trimString(req.body?.orderIndex).slice(0, 32);
  const parentTopicId = trimString(req.body?.parentTopicId) || null;
  if (!code) return invalidInput(res, [{ field: 'code', message: '章节 code 不能为空' }]);
  if (!title) return invalidInput(res, [{ field: 'title', message: '章节名称不能为空' }]);
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '更新章节',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/topics/:id', id },
      },
      async () => {
        const existing = await db
          .select()
          .from(topicsTable)
          .where(eq(topicsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Topic not found' });
          return;
        }
        const parsed = TopicSchema.safeParse({
          subjectId: existing[0].subjectId,
          code,
          title,
          parentTopicId,
          orderIndex: orderIndex || existing[0].orderIndex || code,
        });
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.flatten() });
          return;
        }
        const updated = await db
          .update(topicsTable)
          .set({
            code,
            title,
            parentTopicId,
            orderIndex: orderIndex || existing[0].orderIndex || code,
          })
          .where(eq(topicsTable.id, id))
          .returning();
        res.json(updated[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating topic:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/topics/:id', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot manage topics' });
  const id = req.params.id;
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '删除章节',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/topics/:id', id },
      },
      async () => {
        const existing = await db
          .select()
          .from(topicsTable)
          .where(eq(topicsTable.id, id))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Topic not found' });
          return;
        }
        const children = await db
          .select({ id: topicsTable.id })
          .from(topicsTable)
          .where(eq(topicsTable.parentTopicId, id))
          .limit(1);
        if (children.length) {
          res.status(400).json({ error: 'Topic has child topics and cannot be deleted directly' });
          return;
        }
        const progress = await db
          .select({
            id: studentTopicProgressTable.id,
            status: studentTopicProgressTable.status,
            definitionRecited: studentTopicProgressTable.definitionRecited,
            chapterExerciseCompleted: studentTopicProgressTable.chapterExerciseCompleted,
          })
          .from(studentTopicProgressTable)
          .where(eq(studentTopicProgressTable.topicId, id));
        if (progress.length) {
          const hasStartedProgress = progress.some((row) => {
            const status = String(row.status || '').toLowerCase();
            return (
              row.definitionRecited === true ||
              row.chapterExerciseCompleted === true ||
              status !== 'not_started'
            );
          });
          if (hasStartedProgress) {
            res.status(400).json({ error: 'Topic has started student progress and cannot be deleted directly' });
            return;
          }
          // Backward-compatible relaxation: allow deleting topics whose linked
          // progress records are all still "not_started".
          await db
            .delete(studentTopicProgressTable)
            .where(eq(studentTopicProgressTable.topicId, id));
        }
        await db.delete(topicsTable).where(eq(topicsTable.id, id));
        res.json({ success: true });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error deleting topic:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get list of subject IDs a student is enrolled in
app.get('/api/students/:studentId/subjects', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  try {
    const records = await db
      .select({ subjectId: studentSubjectsTable.subjectId })
      .from(studentSubjectsTable)
      .innerJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
      .where(and(eq(studentSubjectsTable.studentId, studentId), eq(subjectsTable.isActive, true)));
    res.json(records.map(r => r.subjectId));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign subjects to a student (replaces existing assignments)
app.put('/api/students/:studentId/subjects', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot change subject assignments' });
  const { subjectIds, resetProgress } = req.body as {
    subjectIds: string[];
    /** optional: 'removed' | 'all' | 'keep' */
    resetProgress?: 'removed' | 'all' | 'keep';
  };

  if (!Array.isArray(subjectIds)) {
    return res.status(400).json({ error: 'subjectIds must be an array of subject IDs' });
  }

  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新学生科目',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/subjects' },
      },
      async () => {
        const englishRows = await db
          .select({ id: subjectsTable.id })
          .from(subjectsTable)
          .where(eq(subjectsTable.code, 'ENGLISH'))
          .limit(1);
        if (!englishRows.length) {
          res.status(500).json({ error: 'English subject not found' });
          return;
        }
        const englishId = englishRows[0].id;
        const nextIds = Array.from(new Set([englishId, ...subjectIds.filter(Boolean)]));

        // 1) Read current assignments to compute removed set
        const current = await db
          .select({ subjectId: studentSubjectsTable.subjectId })
          .from(studentSubjectsTable)
          .where(eq(studentSubjectsTable.studentId, studentId));

        const currentIds = current.map(r => r.subjectId);
        const nextSet = new Set(nextIds);
        const removedIds = currentIds.filter(id => !nextSet.has(id));

        // 2) Reset progress (default: for removed subjects; or all; or keep)
        const mode: 'removed' | 'all' | 'keep' =
          resetProgress === 'all' ? 'all'
          : resetProgress === 'keep' ? 'keep'
          : 'removed';

        if (mode === 'all' || nextIds.length === 0) {
          // wipe ALL progress for this student
          await db
            .delete(studentTopicProgressTable)
            .where(eq(studentTopicProgressTable.studentId, studentId));
        } else if (mode === 'removed' && removedIds.length > 0) {
          // delete progress only for topics under REMOVED subjects
          const removedTopicRows = await db
            .select({ id: topicsTable.id })
            .from(topicsTable)
            .where(inArray(topicsTable.subjectId, removedIds));

          const removedTopicIds = removedTopicRows.map(r => r.id);
          if (removedTopicIds.length > 0) {
            await db
              .delete(studentTopicProgressTable)
              .where(
                and(
                  eq(studentTopicProgressTable.studentId, studentId),
                  inArray(studentTopicProgressTable.topicId, removedTopicIds),
                )
              );
          }
        }

        // 3) Replace subject assignments
        await db
          .delete(studentSubjectsTable)
          .where(eq(studentSubjectsTable.studentId, studentId));

        if (nextIds.length > 0) {
          const rows = nextIds.map((sid: string) => ({ studentId, subjectId: sid }));
          await db.insert(studentSubjectsTable).values(rows);
        }

        res.json({ message: 'Subjects updated', resetApplied: mode });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Sync topics from subjectCatalogs.json for a student's assigned subjects
app.post('/api/students/:studentId/subjects/sync-catalog', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId } = req.params;
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot sync catalog' });
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '同步科目主题目录',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/subjects/sync-catalog', studentId },
      },
      async () => {
        const subjects = await db
          .select({
            id: subjectsTable.id,
            code: subjectsTable.code,
          })
          .from(studentSubjectsTable)
          .innerJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
          .where(and(eq(studentSubjectsTable.studentId, studentId), eq(subjectsTable.isActive, true)));

        const summary = await syncCatalogForStudentSubjects(subjects);
        res.json(summary);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error syncing catalog topics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// Get full subject with topics and current progress status for a student
app.get('/api/students/:studentId/subjects/full', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  try {
    const defaultLevel = await ensureDefaultSubjectLevel();
    const rows = await db
      .select({
        subjectId: subjectsTable.id,
        subjectCode: subjectsTable.code,
        subjectName: subjectsTable.name,
        subjectChineseName: subjectsTable.chineseName,
        subjectEnglishName: subjectsTable.englishName,
        subjectLevel: subjectsTable.level,
        subjectLevelId: subjectsTable.levelId,
        subjectSortOrder: subjectsTable.sortOrder,
        subjectIsRequired: subjectsTable.isRequired,
        subjectIsActive: subjectsTable.isActive,
        subjectLevelName: subjectLevelsTable.name,
        topicId: topicsTable.id,
        topicCode: topicsTable.code,
        topicTitle: topicsTable.title,
        parentTopicId: topicsTable.parentTopicId,
        orderIndex: topicsTable.orderIndex,
        status: studentTopicProgressTable.status,
        definitionRecited: studentTopicProgressTable.definitionRecited,
        chapterExerciseCompleted: studentTopicProgressTable.chapterExerciseCompleted,
      })
      .from(studentSubjectsTable)
      .where(and(eq(studentSubjectsTable.studentId, studentId), eq(subjectsTable.isActive, true)))
      .leftJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
      .leftJoin(subjectLevelsTable, eq(subjectsTable.levelId, subjectLevelsTable.id))
      .leftJoin(topicsTable, eq(topicsTable.subjectId, subjectsTable.id))
      .leftJoin(
        studentTopicProgressTable,
        and(
          eq(studentTopicProgressTable.studentId, studentId),
          eq(studentTopicProgressTable.topicId, topicsTable.id)
        )
      )
      .orderBy(subjectsTable.sortOrder, subjectsTable.name, topicsTable.orderIndex);
    // Organise results into subject -> topics tree
    type SubjectWithTopicsRow = typeof rows[number];
    type TopicNode = {
      id: string;
      code: string | null;
      title: string | null;
      status: TopicStatusValue | 'not_started';
      definitionRecited: boolean;
      chapterExerciseCompleted: boolean;
      parentTopicId: string | null;
      children: TopicNode[];
    };
    type SubjectEntry = {
        subject: {
          id: string;
          code: string | null;
          name: string | null;
          chineseName: string | null;
          englishName: string | null;
          level: string | null;
          levelId: string | null;
          levelName: string | null;
          sortOrder: number | null;
          isRequired: boolean;
          isActive: boolean;
        };
        topics: TopicNode[];
      };

    const subjectMap: Record<string, SubjectEntry> = {};
    const topicMap: Record<string, TopicNode> = {};
    for (const r of rows) {
      const sid = r.subjectId;
      if (!sid) continue;
      if (!subjectMap[sid]) {
        subjectMap[sid] = {
          subject: {
            id: sid,
            code: r.subjectCode,
            name: r.subjectName,
            chineseName: r.subjectChineseName,
            englishName: r.subjectEnglishName,
            level: r.subjectLevel,
            levelId: r.subjectLevelId || defaultLevel.id,
            levelName: r.subjectLevelName || DEFAULT_SUBJECT_LEVEL_NAME,
            sortOrder: r.subjectSortOrder,
            isRequired: r.subjectIsRequired ?? false,
            isActive: r.subjectIsActive ?? true,
          },
          topics: []
        };
      }
      if (r.topicId) {
        topicMap[r.topicId] = {
          id: r.topicId,
          code: r.topicCode,
          title: r.topicTitle,
          definitionRecited: r.definitionRecited ?? false,
          chapterExerciseCompleted: r.chapterExerciseCompleted ?? false,
          status: deriveTopicStatus(
            r.definitionRecited ?? false,
            r.chapterExerciseCompleted ?? false
          ),
          parentTopicId: r.parentTopicId,
          children: []
        };
      }
    }
    // Build topic hierarchy and attach to subjects
    Object.values(topicMap).forEach((node) => {
      if (node.parentTopicId) {
        const parent = topicMap[node.parentTopicId];
        if (parent) {
          parent.children.push(node);
        }
      } else {
        // no parent => top-level topic
        const sid = rows.find((row: SubjectWithTopicsRow) => row.topicId === node.id)?.subjectId;
        if (sid && subjectMap[sid]) {
          subjectMap[sid].topics.push(node);
        }
      }
    });
    const result = Object.values(subjectMap);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update or insert progress status for a student's topic
app.put('/api/students/:studentId/topics/:topicId/progress', authenticate, requireTeacher, async (req, res) => {
  const { studentId, topicId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const { status, definitionRecited, chapterExerciseCompleted } = req.body as {
    status?: TopicStatusValue;
    definitionRecited?: boolean;
    chapterExerciseCompleted?: boolean;
  };
  const hasConditions =
    typeof definitionRecited === 'boolean' || typeof chapterExerciseCompleted === 'boolean';
  const hasStatus = typeof status === 'string' && isTopicStatus(status);
  if (!hasConditions && !hasStatus) {
    return res.status(400).json({ error: 'Invalid progress payload' });
  }
  try {
    await withActionLock(
      {
        lockKey: studentSubjectProgressLockKey(studentId),
        actionType: '更新主题学习进度',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/topics/:topicId/progress', topicId },
      },
      async () => {
        // Check if record exists
        const existing = await db
          .select()
          .from(studentTopicProgressTable)
          .where(
            and(
              eq(studentTopicProgressTable.studentId, studentId),
              eq(studentTopicProgressTable.topicId, topicId)
            )
          );
        const current = existing[0];
        let nextDefinitionRecited =
          typeof definitionRecited === 'boolean' ? definitionRecited : current?.definitionRecited ?? false;
        let nextChapterExerciseCompleted =
          typeof chapterExerciseCompleted === 'boolean'
            ? chapterExerciseCompleted
            : current?.chapterExerciseCompleted ?? false;

        if (!hasConditions && hasStatus) {
          if (status === 'completed') {
            nextDefinitionRecited = true;
            nextChapterExerciseCompleted = true;
          } else if (status === 'in_progress') {
            nextDefinitionRecited = true;
            nextChapterExerciseCompleted = false;
          } else {
            nextDefinitionRecited = false;
            nextChapterExerciseCompleted = false;
          }
        }

        const nextStatus = deriveTopicStatus(nextDefinitionRecited, nextChapterExerciseCompleted);

        if (existing.length > 0) {
          await db
            .update(studentTopicProgressTable)
            .set({
              status: nextStatus,
              definitionRecited: nextDefinitionRecited,
              chapterExerciseCompleted: nextChapterExerciseCompleted,
            })
            .where(
              and(
                eq(studentTopicProgressTable.studentId, studentId),
                eq(studentTopicProgressTable.topicId, topicId)
              )
            );
        } else {
          await db
            .insert(studentTopicProgressTable)
            .values({
              studentId,
              topicId,
              status: nextStatus,
              definitionRecited: nextDefinitionRecited,
              chapterExerciseCompleted: nextChapterExerciseCompleted,
            });
        }

        // If a parent topic is completed, mark all descendants completed too
        if (nextStatus === 'completed') {
          const descendantIds: string[] = [];
          let frontier = [topicId];
          while (frontier.length > 0) {
            const rows = await db
              .select({ id: topicsTable.id })
              .from(topicsTable)
              .where(inArray(topicsTable.parentTopicId, frontier));
            const nextIds = rows.map((r) => r.id);
            if (nextIds.length === 0) break;
            descendantIds.push(...nextIds);
            frontier = nextIds;
          }

          if (descendantIds.length > 0) {
            await db
              .insert(studentTopicProgressTable)
              .values(
                descendantIds.map((id) => ({
                  studentId,
                  topicId: id,
                  status: 'completed' as const,
                  definitionRecited: true,
                  chapterExerciseCompleted: true,
                }))
              )
              .onConflictDoUpdate({
                target: [studentTopicProgressTable.studentId, studentTopicProgressTable.topicId],
                set: {
                  status: 'completed' as const,
                  definitionRecited: true,
                  chapterExerciseCompleted: true,
                },
              });
          }
        }
        res.json({ message: 'Progress updated' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== PAPER ROUTES ======
// Paper types (global)
app.get('/api/paper-types', authenticate, async (_, res) => {
  try {
    const rows = await db.select().from(paperTypesTable).orderBy(paperTypesTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/paper-types', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot edit paper catalog' });
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '新增试卷类型',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/paper-types' },
      },
      async () => {
        const existing = await db
          .select()
          .from(paperTypesTable)
          .where(eq(paperTypesTable.name, String(name).trim()))
          .limit(1);
        if (existing.length) {
          res.status(409).json({ error: 'Type already exists', data: existing[0] });
          return;
        }
        const created = await db
          .insert(paperTypesTable)
          .values({ name: String(name).trim() })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/paper-types/:id', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot edit paper catalog' });
  const { id } = req.params;
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '删除试卷类型',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/paper-types/:id', paperTypeId: id },
      },
      async () => {
        const used = await db
          .select()
          .from(studentPapersTable)
          .where(eq(studentPapersTable.typeId, id))
          .limit(1);
        if (used.length) {
          res.status(409).json({ error: 'Type is in use' });
          return;
        }
        await db.delete(paperTypesTable).where(eq(paperTypesTable.id, id));
        res.json({ message: 'Deleted' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Paper schools (global)
app.get('/api/paper-schools', authenticate, async (_, res) => {
  try {
    const rows = await db.select().from(paperSchoolsTable).orderBy(paperSchoolsTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/paper-schools', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot edit paper catalog' });
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '新增试卷学校',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/paper-schools' },
      },
      async () => {
        const existing = await db
          .select()
          .from(paperSchoolsTable)
          .where(eq(paperSchoolsTable.name, String(name).trim()))
          .limit(1);
        if (existing.length) {
          res.status(409).json({ error: 'School already exists', data: existing[0] });
          return;
        }
        const created = await db
          .insert(paperSchoolsTable)
          .values({ name: String(name).trim() })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/paper-schools/:id', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) return res.status(403).json({ error: 'Reviewer account cannot edit paper catalog' });
  const { id } = req.params;
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '删除试卷学校',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/paper-schools/:id', paperSchoolId: id },
      },
      async () => {
        const used = await db
          .select()
          .from(studentPapersTable)
          .where(eq(studentPapersTable.schoolId, id))
          .limit(1);
        if (used.length) {
          res.status(409).json({ error: 'School is in use' });
          return;
        }
        await db.delete(paperSchoolsTable).where(eq(paperSchoolsTable.id, id));
        res.json({ message: 'Deleted' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Student papers list (optionally by date)
app.get('/api/students/:studentId/papers', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  const { date } = req.query as { date?: string };
  try {
    const conditions = [eq(studentPapersTable.studentId, studentId)];
    if (date) {
      conditions.push(eq(studentPapersTable.date, date));
    }
    const rows = await db
      .select({
        id: studentPapersTable.id,
        studentId: studentPapersTable.studentId,
        subjectId: studentPapersTable.subjectId,
        subjectName: studentPapersTable.subjectName,
        typeId: studentPapersTable.typeId,
        typeName: paperTypesTable.name,
        schoolId: studentPapersTable.schoolId,
        schoolName: paperSchoolsTable.name,
        description: studentPapersTable.description,
        strengths: studentPapersTable.strengths,
        improvements: studentPapersTable.improvements,
        updatedAt: studentPapersTable.updatedAt,
        updatedByName: studentPapersTable.updatedByName,
        date: studentPapersTable.date,
        score: studentPapersTable.score,
        total: studentPapersTable.total,
      })
      .from(studentPapersTable)
      .leftJoin(subjectsTable, eq(studentPapersTable.subjectId, subjectsTable.id))
      .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
      .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
      .where(and(...conditions))
      .orderBy(desc(studentPapersTable.date));

    const result = rows.map((r) => ({
      ...r,
      ...parseScoreMeta(r.score, r.total),
      subjectName: r.subjectName || undefined,
      typeName: r.typeName || undefined,
      schoolName: r.schoolName || undefined,
      description: r.description || undefined,
      strengths: r.strengths || undefined,
      improvements: r.improvements || undefined,
      updatedAt: r.updatedAt || undefined,
      updatedByName: r.updatedByName || undefined,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Replace all papers for a student on a specific date
app.put('/api/students/:studentId/papers/batch', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const { date, papers, expectedUpdatedAt } = req.body || {};
  if (!date || !Array.isArray(papers)) {
    return res.status(400).json({ error: 'Missing date or papers' });
  }
  const dateParsed = parseDateString(date);
  if (!dateParsed) return res.status(400).json({ error: 'Invalid paper date' });
  if (papers.length > INPUT_LIMITS.papersBatchMax) {
    return res.status(400).json({ error: `Too many papers in one batch (max ${INPUT_LIMITS.papersBatchMax})` });
  }
  const missingRequired = papers.some((p: any) => !p?.typeId || !p?.schoolId);
  if (missingRequired) {
    return res.status(400).json({ error: 'Missing required paper fields' });
  }
  const batchIssues = papers.flatMap((paper: unknown, index: number) =>
    validatePaperPayload(paper, `papers[${index}]`),
  );
  if (batchIssues.length) return invalidInput(res, batchIssues);
  const paperEvaluationValidation = requirePaperEvaluations(papers);
  if (!paperEvaluationValidation.ok) {
    return res.status(400).json({
      error: 'PAPER_EVALUATION_REQUIRED',
      details: paperEvaluationValidation.details,
    });
  }
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '批量保存试卷记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/papers/batch', date },
      },
      async () => {
        const clientUpdatedAt = parseTimestamp(expectedUpdatedAt);
        const latest = await db
          .select({
            updatedAt: studentPapersTable.updatedAt,
            updatedByName: studentPapersTable.updatedByName,
          })
          .from(studentPapersTable)
          .where(and(eq(studentPapersTable.studentId, studentId), eq(studentPapersTable.date, date)))
          .orderBy(desc(studentPapersTable.updatedAt))
          .limit(1);
        if (latest.length) {
          if (!clientUpdatedAt || !isSameTimestamp(latest[0].updatedAt, clientUpdatedAt)) {
            res.status(409).json({
              error: 'CONFLICT',
              updatedAt: latest[0].updatedAt,
              updatedByName: latest[0].updatedByName,
            });
            return;
          }
        }
        await db
          .delete(studentPapersTable)
          .where(and(eq(studentPapersTable.studentId, studentId), eq(studentPapersTable.date, date)));

        if (papers.length === 0) {
          res.json({ message: 'No papers to save' });
          return;
        }

        const now = new Date();
        const values = papers.map((p: any) => ({
          studentId,
          subjectId: p.subjectId || null,
          subjectName: p.subjectName || null,
          typeId: p.typeId,
          schoolId: p.schoolId,
          description: p.description || null,
          strengths: String(p.strengths || '').trim(),
          improvements: String(p.improvements || '').trim(),
          date,
          score: parseOptionalInt(p.score),
          total: parseOptionalInt(p.total),
          updatedAt: now,
          updatedByName: req.user?.name || null,
        }));
        const inserted = await db.insert(studentPapersTable).values(values).returning();
        res.json({ message: 'Saved', count: inserted.length });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Create single paper
app.post('/api/students/:studentId/papers', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const { subjectId, subjectName, typeId, schoolId, description, strengths, improvements, date, score, total } = req.body || {};
  if (!typeId || !schoolId || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!parseDateString(date)) return res.status(400).json({ error: 'Invalid paper date' });
  const createIssues = validatePaperPayload(
    { subjectId, subjectName, typeId, schoolId, description, strengths, improvements, date, score, total },
    'paper',
  );
  if (createIssues.length) return invalidInput(res, createIssues);
  if (!String(strengths || '').trim() || !String(improvements || '').trim()) {
    return res.status(400).json({ error: 'PAPER_EVALUATION_REQUIRED' });
  }
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '新增试卷记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/papers', date },
      },
      async () => {
        const created = await db
          .insert(studentPapersTable)
          .values({
            studentId,
            subjectId: subjectId || null,
            subjectName: subjectName || null,
            typeId,
            schoolId,
            description: description || null,
            strengths: String(strengths || '').trim(),
            improvements: String(improvements || '').trim(),
            date,
            score: parseOptionalInt(score),
            total: parseOptionalInt(total),
            updatedAt: new Date(),
            updatedByName: req.user?.name || null,
          })
          .returning();
        res.status(201).json(created[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Update single paper
app.put('/api/students/:studentId/papers/:paperId', authenticate, requireTeacher, async (req, res) => {
  const { studentId, paperId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const { subjectId, subjectName, typeId, schoolId, description, strengths, improvements, date, score, total, updatedAt } = req.body || {};
  if (!typeId || !schoolId || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!parseDateString(date)) return res.status(400).json({ error: 'Invalid paper date' });
  const updateIssues = validatePaperPayload(
    { subjectId, subjectName, typeId, schoolId, description, strengths, improvements, date, score, total },
    'paper',
  );
  if (updateIssues.length) return invalidInput(res, updateIssues);
  if (!String(strengths || '').trim() || !String(improvements || '').trim()) {
    return res.status(400).json({ error: 'PAPER_EVALUATION_REQUIRED' });
  }
  const clientUpdatedAt = parseTimestamp(updatedAt);
  if (!clientUpdatedAt) {
    return res.status(400).json({ error: 'Missing updatedAt' });
  }
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新试卷记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/papers/:paperId', paperId },
      },
      async () => {
        const existing = await db
          .select()
          .from(studentPapersTable)
          .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        const updated = await db
          .update(studentPapersTable)
          .set({
            subjectId: subjectId || null,
            subjectName: subjectName || null,
            typeId,
            schoolId,
            description: description || null,
            strengths: String(strengths || '').trim(),
            improvements: String(improvements || '').trim(),
            date,
            score: parseOptionalInt(score),
            total: parseOptionalInt(total),
            updatedAt: new Date(),
            updatedByName: req.user?.name || null,
          })
          .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
          .returning();
        if (!updated.length) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(updated[0]);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete single paper
app.delete('/api/students/:studentId/papers/:paperId', authenticate, requireTeacher, async (req, res) => {
  const { studentId, paperId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '删除试卷记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/papers/:paperId', paperId },
      },
      async () => {
        const existing = await db
          .select()
          .from(studentPapersTable)
          .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
          .limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        await db
          .delete(studentPapersTable)
          .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)));
        res.json({ message: 'Deleted' });
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== ADMIN ROUTES ==========
app.post('/api/admin/login', async (req, res) => {
  res.status(410).json({
    error: 'Email/password admin login is deprecated. Use /api/auth/wechat with role=admin.',
  });
});


app.get('/api/admin/pending', authenticate, requireAdmin, async (req, res) => {
  const parents = await db.select().from(parentsTable).where(eq(parentsTable.status, 'pending'));
  const teachers = await db.select().from(teachersTable).where(eq(teachersTable.status, 'pending'));
  res.json({
    parents: parents.map((item) => toPublicUser(item, 'parent')),
    teachers: teachers.map((item) => toPublicUser(item, 'teacher')),
  });
});

app.post('/api/admin/approve', authenticate, requireAdmin, async (req, res) => {
  const { id, role } = req.body;
  if (role === 'parent') {
    await db.update(parentsTable).set({ status: 'approved', updatedAt: new Date() }).where(eq(parentsTable.id, id));
  } else if (role === 'teacher') {
    await db.update(teachersTable).set({ status: 'approved', updatedAt: new Date() }).where(eq(teachersTable.id, id));
  }
  res.json({ success: true });
});

app.post('/api/admin/reject', authenticate, requireAdmin, async (req, res) => {
  const { id, role } = req.body;
  if (role === 'parent') {
    await db.update(parentsTable).set({ status: 'rejected', updatedAt: new Date() }).where(eq(parentsTable.id, id));
  } else if (role === 'teacher') {
    await db.update(teachersTable).set({ status: 'rejected', updatedAt: new Date() }).where(eq(teachersTable.id, id));
  }
  res.json({ success: true });
});

// ========== DAILY PROGRESS ROUTES ==========
// More specific routes must come before general routes
const handleProgressStudent = async (req: any, res: any) => {
  const { studentId, date } = req.query;
  const studentIdParam = Array.isArray(studentId) ? studentId[0] : studentId;
  const dateParam = Array.isArray(date) ? date[0] : date;

  console.log('Progress student request:', { studentId: studentIdParam, date: dateParam });

  if (!studentIdParam || !dateParam) {
    return res.status(400).json({ error: 'Missing studentId or date query parameter' });
  }

  try {
    // Convert date string to Date object
    if (typeof studentIdParam !== 'string' || typeof dateParam !== 'string') {
      return res.status(400).json({ error: 'Invalid studentId or date type' });
    }

    const targetDate = new Date(dateParam);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formattedDate = format(targetDate, 'yyyy-MM-dd');
    console.log('Formatted date:', formattedDate);

    // Debug: Check if student exists first
    const studentCheck = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentIdParam))
      .limit(1);
    
    console.log('Student check result:', studentCheck);
    console.log('Student ID type:', typeof studentIdParam);
    console.log('Student ID value:', studentIdParam);

    const progress = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentIdParam),
          eq(dailyProgress.date, formattedDate),
        )
      )
      .limit(1);

    console.log('Query result:', progress);

    // Debug: Check if there's any data in daily_progress table
    const allProgress = await db.select().from(dailyProgress).limit(5);
    console.log('All progress records (first 5):', allProgress);

    if (progress.length === 0) {
      return res.status(404).json({ error: 'No progress found for this student on this date' });
    }

    res.json(withV2Activities(progress[0]));
  } catch (err) {
    console.error('Error fetching student progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

app.get('/api/progress/student', authenticate, verifyParentStudentAccess, handleProgressStudent);
// Backwards-compatible alias (some clients still call /progress/students)
app.get('/api/progress/students', authenticate, verifyParentStudentAccess, handleProgressStudent);

// Temporarily disabled - tables don't exist yet
/*
app.get('/api/progress', async (_, res) => {
  try {
    console.log('Fetching daily progress...');
    const result = await db.select().from(dailyProgress).orderBy(desc(dailyProgress.date));
    console.log(`Found ${result.length} progress records`);
    res.json(result);
  } catch (err) {
    console.error('Error fetching daily progress:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      error: 'Database error', 
      details: err.message,
      type: 'progress_fetch_error'
    });
  }
});
*/

// Get all progress for a specific student
app.get('/api/students/:studentId/progress', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;

  try {
    // Check if student exists first
    const studentCheck = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId))
      .limit(1);
    
    if (studentCheck.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get all progress for this student, ordered by date (newest first)
    const progress = await db
      .select()
      .from(dailyProgress)
      .where(eq(dailyProgress.studentId, studentId))
      .orderBy(desc(dailyProgress.date));

    console.log(`Found ${progress.length} progress records for student ${studentId}`);
    res.json(progress.map(withV2Activities));
  } catch (err) {
    console.error('Error fetching student progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Return empty array for now until tables are created
app.get('/api/progress', authenticate, requireTeacher, async (req, res) => {
  try {
    console.log('Fetching all daily progress...');
    if (isReviewerSession(req)) {
      const reviewerStudentId = String(req.user?.reviewerStudentId || '').trim();
      if (!reviewerStudentId) {
        return res.status(403).json({ error: 'Reviewer account is not configured with a demo student' });
      }
      const reviewerRows = await db
        .select()
        .from(dailyProgress)
        .where(eq(dailyProgress.studentId, reviewerStudentId))
        .orderBy(desc(dailyProgress.date));
      return res.json(reviewerRows.map(withV2Activities));
    }
    const result = await db.select().from(dailyProgress).orderBy(desc(dailyProgress.date));
    console.log(`Found ${result.length} progress records`);
    res.json(result.map(withV2Activities));
  } catch (err) {
    console.error('Error fetching daily progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Daily missing-record reminder. At ~20:30 CST teachers need a quick view of
// which students still have no daily_progress row for today, so they can
// finish records before evening study ends at 21:00. ?date= overrides the
// default of "today in Asia/Shanghai".
app.get('/api/daily-progress/missing', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) {
    return res.status(403).json({ error: 'Reviewer account cannot access cross-student reminders' });
  }
  try {
    const requestedDate = req.query?.date;
    const date = requestedDate
      ? parseDateString(requestedDate)
      : chinaTodayDateString();
    if (!date) {
      return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });
    }

    const missing = await db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        grade: studentsTable.grade,
      })
      .from(studentsTable)
      .leftJoin(
        dailyProgress,
        and(
          eq(dailyProgress.studentId, studentsTable.id),
          eq(dailyProgress.date, date),
        ),
      )
      .where(isNull(dailyProgress.id))
      .orderBy(studentsTable.name);

    res.json({ date, missing });
  } catch (err) {
    console.error('Error fetching missing daily-progress records:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Weekly feedback missing-record reminder. Mirrors daily missing behavior but
// checks the active study cycle's weekStarting as the expected weekly feedback
// key, so teachers can quickly see who still lacks a weekly report.
app.get('/api/feedback/missing', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) {
    return res.status(403).json({ error: 'Reviewer account cannot access cross-student reminders' });
  }
  try {
    const requestedWeekStarting = parseDateString(req.query?.weekStarting);
    const requestedDate = req.query?.date;
    const date = requestedDate
      ? parseDateString(requestedDate)
      : chinaTodayDateString();
    if (!date && !requestedWeekStarting) {
      return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });
    }
    let cycle: ResolvedCycle;
    let responseDate = date as string;
    if (requestedWeekStarting) {
      const matched = await db
        .select({
          id: weeklyStudyCyclesTable.id,
          startDate: weeklyStudyCyclesTable.startDate,
          endDate: weeklyStudyCyclesTable.endDate,
          notes: weeklyStudyCyclesTable.notes,
        })
        .from(weeklyStudyCyclesTable)
        .where(eq(weeklyStudyCyclesTable.startDate, requestedWeekStarting))
        .limit(1);
      if (matched.length) {
        cycle = {
          id: matched[0].id,
          startDate: String(matched[0].startDate).slice(0, 10),
          endDate: addDaysToDate(requestedWeekStarting, 6),
          notes: matched[0].notes ?? null,
        };
      } else {
        cycle = {
          id: null,
          startDate: requestedWeekStarting,
          endDate: addDaysToDate(requestedWeekStarting, 6),
          notes: null,
        };
      }
      responseDate = requestedWeekStarting;
    } else {
      cycle = await resolveCycleForDate(date as string);
    }
    const missing = await db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        grade: studentsTable.grade,
      })
      .from(studentsTable)
      .leftJoin(
        weeklyFeedback,
        and(
          eq(weeklyFeedback.studentId, studentsTable.id),
          eq(weeklyFeedback.weekStarting, cycle.startDate),
        ),
      )
      .where(isNull(weeklyFeedback.id))
      .orderBy(studentsTable.name);

    res.json({
      date: responseDate,
      cycle: {
        id: cycle.id || null,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        notes: cycle.notes || null,
      },
      missing,
    });
  } catch (err) {
    console.error('Error fetching missing weekly-feedback records:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== LOSS-POINT CATALOG (Part 4) ==========

// Returns categories with their active loss points nested. Used by the
// miniprogram to populate the multi-select chips on the daily-progress page.
app.get('/api/loss-points', authenticate, requireTeacher, async (_, res) => {
  try {
    const categories = await db
      .select()
      .from(lossPointCategoriesTable)
      .orderBy(lossPointCategoriesTable.orderIndex, lossPointCategoriesTable.name);
    const points = await db
      .select()
      .from(lossPointsTable)
      .where(eq(lossPointsTable.isActive, true))
      .orderBy(lossPointsTable.orderIndex, lossPointsTable.label);
    const byCategory = new Map<string, typeof points>();
    for (const p of points) {
      const list = byCategory.get(p.categoryId) ?? [];
      list.push(p);
      byCategory.set(p.categoryId, list);
    }
    res.json({
      categories: categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        orderIndex: c.orderIndex,
        points: (byCategory.get(c.id) ?? []).map((p) => ({
          id: p.id,
          code: p.code,
          label: p.label,
          description: p.description,
          orderIndex: p.orderIndex,
        })),
      })),
    });
  } catch (err) {
    console.error('Error fetching loss-point catalog:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== WEEKLY STUDY CYCLES (Part 3) ==========

// Resolve the cycle covering `dateStr`. If a stored row exists, use it;
// otherwise return the synthesised Sun→Thu default. Shared by several routes.
const resolveCycleForDate = async (dateStr: string): Promise<ResolvedCycle> => {
  const allCycles = await db
    .select({
      id: weeklyStudyCyclesTable.id,
      startDate: weeklyStudyCyclesTable.startDate,
      endDate: weeklyStudyCyclesTable.endDate,
      notes: weeklyStudyCyclesTable.notes,
    })
    .from(weeklyStudyCyclesTable);
  return pickCoveringCycle(allCycles, dateStr) ?? syntheticCycleFor(dateStr);
};

app.get('/api/weekly-cycles', authenticate, requireTeacher, async (_, res) => {
  try {
    const rows = await db
      .select()
      .from(weeklyStudyCyclesTable)
      .orderBy(desc(weeklyStudyCyclesTable.startDate));
    res.json(rows);
  } catch (err) {
    console.error('Error listing weekly cycles:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/weekly-cycles', authenticate, requireTeacher, async (req, res) => {
  const parsed = WeeklyStudyCycleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { startDate, endDate, notes } = parsed.data;
  if (startDate > endDate) {
    return res.status(400).json({ error: 'startDate must be <= endDate' });
  }
  try {
    await withActionLock(
      {
        lockKey: subjectCatalogWriteLockKey(),
        actionType: '创建周学习周期',
        ttlMs: ACTION_LOCK_TTL.subjectCatalogMs,
        ...withLockActor(req),
        metadata: { route: '/api/weekly-cycles', startDate, endDate },
      },
      async () => {
        const [row] = await db
          .insert(weeklyStudyCyclesTable)
          .values({
            startDate,
            endDate,
            notes: notes ?? null,
            updatedAt: new Date(),
            updatedByName: req.user?.name || null,
          })
          .returning();
        res.status(201).json(row);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating weekly cycle:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/weekly-cycles/current', authenticate, requireTeacher, async (req, res) => {
  try {
    const requested = req.query?.date;
    const date = requested ? parseDateString(requested) : chinaTodayDateString();
    if (!date) return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });
    const cycle = await resolveCycleForDate(date);
    res.json({ date, cycle });
  } catch (err) {
    console.error('Error resolving current weekly cycle:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== STUDENT WEEKLY TASK TARGETS (Part 3) ==========

app.get('/api/students/:studentId/weekly-targets', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const cycleIdParam = req.query?.cycleId;
  try {
    let cycleId: string | null = null;
    if (typeof cycleIdParam === 'string' && cycleIdParam) {
      cycleId = cycleIdParam;
    } else {
      const date = chinaTodayDateString();
      const cycle = await resolveCycleForDate(date);
      cycleId = cycle.id; // null when synthesised
    }

    let stored: typeof studentWeeklyTaskTargetsTable.$inferSelect | null = null;
    if (cycleId) {
      const rows = await db
        .select()
        .from(studentWeeklyTaskTargetsTable)
        .where(
          and(
            eq(studentWeeklyTaskTargetsTable.studentId, studentId),
            eq(studentWeeklyTaskTargetsTable.cycleId, cycleId),
          ),
        )
        .limit(1);
      stored = rows[0] ?? null;
    }
    res.json({
      studentId,
      cycleId,
      stored,
      effective: effectiveTargetsFor(stored),
    });
  } catch (err) {
    console.error('Error fetching weekly targets:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:studentId/weekly-targets', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  if (!enforceReviewerScope(req, res, studentId)) return;
  const parsed = StudentWeeklyTaskTargetsSchema.safeParse({ ...req.body, studentId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  try {
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新学生周任务目标',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/students/:studentId/weekly-targets', cycleId: data.cycleId },
      },
      async () => {
        // Confirm the cycle exists (we never auto-create cycles from the targets
        // endpoint to keep cycle creation an explicit teacher action).
        const cycleRow = await db
          .select({ id: weeklyStudyCyclesTable.id })
          .from(weeklyStudyCyclesTable)
          .where(eq(weeklyStudyCyclesTable.id, data.cycleId))
          .limit(1);
        if (!cycleRow.length) {
          res.status(404).json({ error: 'Cycle not found; create it first via POST /api/weekly-cycles' });
          return;
        }
        // Upsert by (studentId, cycleId)
        const existing = await db
          .select()
          .from(studentWeeklyTaskTargetsTable)
          .where(
            and(
              eq(studentWeeklyTaskTargetsTable.studentId, studentId),
              eq(studentWeeklyTaskTargetsTable.cycleId, data.cycleId),
            ),
          )
          .limit(1);
        const values = {
          studentId,
          cycleId: data.cycleId,
          readingTarget: data.readingTarget,
          editingTarget: data.editingTarget,
          grammarTarget: data.grammarTarget,
          vocabTarget: data.vocabTarget,
          compositionTarget: data.compositionTarget,
          isGrammarRequired: data.isGrammarRequired,
          isEditingRequired: data.isEditingRequired,
          updatedAt: new Date(),
          updatedByName: req.user?.name || null,
        };
        if (existing.length) {
          const [row] = await db
            .update(studentWeeklyTaskTargetsTable)
            .set(values)
            .where(eq(studentWeeklyTaskTargetsTable.id, existing[0].id))
            .returning();
          res.json(row);
          return;
        }
        const [row] = await db
          .insert(studentWeeklyTaskTargetsTable)
          .values(values)
          .returning();
        res.status(201).json(row);
      },
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error upserting weekly targets:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Friday "本周英文任务未完成学生" card. Computes per-student English completion
// across the cycle covering `date` (default: today CST) and returns any whose
// required tasks aren't all met. Heavy: O(students) progress reads — fine for
// classroom-sized rosters; revisit if rosters grow into the thousands.
app.get('/api/weekly-tasks/incomplete', authenticate, requireTeacher, async (req, res) => {
  if (isReviewerSession(req)) {
    return res.status(403).json({ error: 'Reviewer account cannot access cross-student reminders' });
  }
  try {
    const requested = req.query?.date;
    const date = requested ? parseDateString(requested) : chinaTodayDateString();
    if (!date) return res.status(400).json({ error: 'Invalid date; expected YYYY-MM-DD' });
    const cycle = await resolveCycleForDate(date);

    const students = await db
      .select({ id: studentsTable.id, name: studentsTable.name, grade: studentsTable.grade })
      .from(studentsTable)
      .orderBy(studentsTable.name);

    // Per-student stored targets for this cycle (if any).
    let storedTargetsByStudent: Map<string, typeof studentWeeklyTaskTargetsTable.$inferSelect> = new Map();
    if (cycle.id) {
      const targetsRows = await db
        .select()
        .from(studentWeeklyTaskTargetsTable)
        .where(eq(studentWeeklyTaskTargetsTable.cycleId, cycle.id));
      storedTargetsByStudent = new Map(targetsRows.map((r) => [r.studentId, r]));
    }

    // All daily_progress rows in the cycle window — single query, then group.
    const progressRows = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          gte(dailyProgress.date, cycle.startDate),
          lte(dailyProgress.date, cycle.endDate),
        ),
      );
    const progressByStudent = new Map<string, typeof progressRows>();
    for (const r of progressRows) {
      const list = progressByStudent.get(r.studentId) ?? [];
      list.push(r);
      progressByStudent.set(r.studentId, list);
    }

    const incomplete: Array<{
      id: string;
      name: string;
      grade: string;
      completion: ReturnType<typeof evaluateCompletion>;
    }> = [];
    for (const s of students) {
      const targets = effectiveTargetsFor(storedTargetsByStudent.get(s.id) ?? null);
      const stats = (progressByStudent.get(s.id) ?? []).reduce(
        (acc, row) => {
          const dayStats = extractEnglishStats(normalizeActivities(row.activities));
          acc.readingArticleCount += dayStats.readingArticleCount;
          acc.editingExerciseCount += dayStats.editingExerciseCount;
          acc.grammarExerciseCount += dayStats.grammarExerciseCount;
          acc.vocabSentenceCount += dayStats.vocabSentenceCount;
          acc.compositionCompletedCount += dayStats.compositionCompletedCount;
          return acc;
        },
        {
          readingArticleCount: 0,
          editingExerciseCount: 0,
          grammarExerciseCount: 0,
          vocabSentenceCount: 0,
          compositionCompletedCount: 0,
        },
      );
      const completion = evaluateCompletion(targets, stats);
      if (!completion.allRequiredMet) {
        incomplete.push({ id: s.id, name: s.name, grade: s.grade, completion });
      }
    }

    res.json({ date, cycle, incomplete });
  } catch (err) {
    console.error('Error computing incomplete weekly tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== WEEKLY FEEDBACK ROUTES ==========

// Temporarily disabled - tables don't exist yet
/*
app.get('/api/feedback', async (_, res) => {
  try {
    console.log('Fetching weekly feedback...');
    const result = await db.select().from(weeklyFeedback).orderBy(desc(weeklyFeedback.weekEnding));
    console.log(`Found ${result.length} feedback records`);
    res.json(result);
  } catch (err) {
    console.error('Error fetching weekly feedback:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      error: 'Database error', 
      details: err.message,
      type: 'feedback_fetch_error'
    });
  }
});
*/

app.post('/api/progress', authenticate, requireTeacher, async (req, res) => {
  try {
    console.log('Received progress data:', req.body);

    // Part 9: structurally validate the request body via Zod before doing any
    // DB work. Catches missing fields, bad UUIDs, malformed dates/times, and
    // empty activities arrays in one place with field-level error messages.
    const parsed = DailyProgressRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const { studentId, date, attendance, attendanceStart, attendanceEnd, summary, activities } = parsed.data;
    if (!enforceReviewerScope(req, res, studentId)) return;
    const extremeIssues = validateDailyProgressExtremes(activities);
    if (extremeIssues.length) return invalidInput(res, extremeIssues);
    if (trimString(summary).length > INPUT_LIMITS.summaryTextMax) {
      return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
    }

    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新学生学习记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/progress', date },
      },
      async () => {
        const narrativeValidation = validateActivityNarratives(activities);
        if (!narrativeValidation.ok) {
          res.status(400).json({
            error: 'ACTIVITY_NARRATIVE_REQUIRED',
            details: narrativeValidation.errors,
          });
          return;
        }

        // Check if progress already exists for this student and date
        const existingProgress = await db
          .select()
          .from(dailyProgress)
          .where(and(eq(dailyProgress.studentId, studentId), eq(dailyProgress.date, date)))
          .limit(1);
        
        if (existingProgress.length > 0) {
          res.status(409).json({ error: 'Progress already exists for this student and date' });
          return;
        }
        
        // Insert new progress (normalize English V2 on the way in so that even
        // legacy clients posting string-only `english` blocks land in V2 shape).
        // Loss-point validation runs first so we reject unscored entries with
        // missing loss points before we touch the DB.
        const lossPointValidation = validateLossPointsRequired(activities);
        if (!lossPointValidation.ok) {
          res.status(400).json({
            error: 'LOSS_POINTS_REQUIRED',
            details: lossPointValidation.errors,
          });
          return;
        }
        const lossPointLookup = await loadLossPointLookup();
        const enrichedActivities = enrichLossPointLabels(activities, lossPointLookup);
        const normalizedActivities = normalizeActivities(enrichedActivities);
        // Part 9: post-normalize structural sanity check — catches normalize
        // regressions before they hit the DB.
        const englishStructural = validateNormalizedEnglish(normalizedActivities);
        if (!englishStructural.ok) {
          res.status(400).json({
            error: 'INVALID_ENGLISH_STRUCTURE',
            details: englishStructural.errors,
          });
          return;
        }
        const newProgress = await db.insert(dailyProgress).values({
          studentId,
          date: date,
          attendance,
          attendanceStart: attendanceStart || null,
          attendanceEnd: attendanceEnd || null,
          summary: summary || null,
          activities: normalizedActivities as Record<string, unknown>[],
          updatedAt: new Date(),
          updatedByName: req.user?.name || null,
        }).returning();

        // Daily progress is teacher-only; skip parent notifications.

        console.log('Progress saved successfully:', newProgress[0]);
        res.status(201).json(withV2Activities(newProgress[0]));
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error creating progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/progress/:id', authenticate, requireTeacher, async (req, res) => {
  const id = req.params.id;
  try {
    // Part 9: same Zod validation as POST. updatedAt is checked separately
    // below for the optimistic-locking contract.
    const parsed = DailyProgressRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const { studentId, date, attendance, attendanceStart, attendanceEnd, summary, activities } = parsed.data;
    const { updatedAt } = req.body;
    if (!enforceReviewerScope(req, res, studentId)) return;
    const extremeIssues = validateDailyProgressExtremes(activities);
    if (extremeIssues.length) return invalidInput(res, extremeIssues);
    if (trimString(summary).length > INPUT_LIMITS.summaryTextMax) {
      return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
    }

    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '更新学生学习记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/progress/${id}`, date },
      },
      async () => {
        const narrativeValidation = validateActivityNarratives(activities);
        if (!narrativeValidation.ok) {
          res.status(400).json({
            error: 'ACTIVITY_NARRATIVE_REQUIRED',
            details: narrativeValidation.errors,
          });
          return;
        }

        // Prevent duplicates on update
        const dup = await db
          .select()
          .from(dailyProgress)
          .where(and(eq(dailyProgress.studentId, studentId), eq(dailyProgress.date, date)))
          .limit(1);
        if (dup.length > 0 && dup[0].id !== id) {
          res.status(409).json({ error: 'Progress already exists for this student and date' });
          return;
        }

        const existing = await db.select().from(dailyProgress).where(eq(dailyProgress.id, id)).limit(1);
        if (!existing.length) {
          res.status(404).json({ error: 'Progress not found' });
          return;
        }
        const clientUpdatedAt = parseTimestamp(updatedAt);
        if (!clientUpdatedAt) {
          res.status(400).json({ error: 'Missing updatedAt' });
          return;
        }
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }

        // Same loss-point validation + label-snapshot enrichment as POST so an
        // edit that introduces (or removes) a score is held to the same contract.
        const lossPointValidation = validateLossPointsRequired(activities);
        if (!lossPointValidation.ok) {
          res.status(400).json({
            error: 'LOSS_POINTS_REQUIRED',
            details: lossPointValidation.errors,
          });
          return;
        }
        const lossPointLookup = await loadLossPointLookup();
        const enrichedActivities = enrichLossPointLabels(activities, lossPointLookup);
        const normalizedActivitiesPut = normalizeActivities(enrichedActivities);
        // Part 9: post-normalize structural sanity check (same as POST).
        const englishStructuralPut = validateNormalizedEnglish(normalizedActivitiesPut);
        if (!englishStructuralPut.ok) {
          res.status(400).json({
            error: 'INVALID_ENGLISH_STRUCTURE',
            details: englishStructuralPut.errors,
          });
          return;
        }

        const data = {
          studentId,
          date: date,
          attendance,
          attendanceStart: attendanceStart || null,
          attendanceEnd: attendanceEnd || null,
          summary: summary || null,
          activities: normalizedActivitiesPut as Record<string, unknown>[],
          updatedAt: new Date(),
          updatedByName: req.user?.name || null,
        };

        const result = await db.update(dailyProgress).set(data).where(eq(dailyProgress.id, id)).returning();
        res.json(withV2Activities(result[0]));
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/progress/:id', authenticate, requireTeacher, async (req, res) => {
  const id = req.params.id;
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    const existing = await db.select().from(dailyProgress).where(eq(dailyProgress.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Progress not found' });
    const studentId = existing[0].studentId;
    if (!enforceReviewerScope(req, res, studentId)) return;
    await withActionLock(
      {
        lockKey: studentWriteLockKey(studentId),
        actionType: '删除学生学习记录',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/progress/${id}` },
      },
      async () => {
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        await db.delete(dailyProgress).where(eq(dailyProgress.id, id)).returning();
        res.json({ message: 'Progress deleted successfully' });
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/progress/list?studentId=...
app.get('/api/progress/list', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

  try {
    const rows = await db
      .select()
      .from(dailyProgress)
      .where(eq(dailyProgress.studentId, String(studentId)))
      .orderBy(desc(dailyProgress.date));
    res.json(rows.map(withV2Activities));
  } catch (err) {
    console.error('progress/list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// ========== WEEKLY FEEDBACK ROUTES ==========

app.get('/api/feedback', authenticate, requireTeacher, async (req, res) => {
  try {
    if (isReviewerSession(req)) {
      const reviewerStudentId = String(req.user?.reviewerStudentId || '').trim();
      if (!reviewerStudentId) {
        return res.status(403).json({ error: 'Reviewer account is not configured with a demo student' });
      }
      const reviewerRows = await db
        .select()
        .from(weeklyFeedback)
        .where(eq(weeklyFeedback.studentId, reviewerStudentId))
        .orderBy(desc(weeklyFeedback.weekStarting));
      return res.json(reviewerRows);
    }
    const result = await db.select().from(weeklyFeedback).orderBy(desc(weeklyFeedback.weekStarting));
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/feedback', authenticate, requireTeacher, async (req, res) => {
  const body = {...req.body, weekStarting: new Date(req.body.weekStarting), weekEnding: new Date(req.body.weekEnding)}
  const parsed = WeeklyFeedbackSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const parsedData = parsed.data as {
      id?: string;
      studentId: string;
      weekStarting: Date;
      weekEnding: Date;
      summary: string;
      strengths: string[];
      areasToImprove: string[];
      teacherNotes?: string;
      nextWeekFocus?: string;
    };
    if (!enforceReviewerScope(req, res, parsedData.studentId)) return;
    const feedbackRangeIssues = validateDateRange({
      startDate: format(parsedData.weekStarting, 'yyyy-MM-dd'),
      endDate: format(parsedData.weekEnding, 'yyyy-MM-dd'),
      maxDays: INPUT_LIMITS.weeklyDateRangeMaxDays,
      fieldPrefix: 'weeklyRange',
    });
    if (feedbackRangeIssues.length) return invalidInput(res, feedbackRangeIssues);
    if (trimString(parsedData.summary).length > INPUT_LIMITS.summaryTextMax) {
      return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
    }
    const data = {
      id: parsedData.id,
      studentId: parsedData.studentId,
      summary: parsedData.summary,
      strengths: parsedData.strengths,
      areasToImprove: parsedData.areasToImprove,
      teacherNotes: parsedData.teacherNotes,
      nextWeekFocus: parsedData.nextWeekFocus,
      weekStarting: format(parsedData.weekStarting, 'yyyy-MM-dd'),
      weekEnding: format(parsedData.weekEnding, 'yyyy-MM-dd'),
      updatedAt: new Date(),
      updatedByName: req.user?.name || null,
    };
    await withActionLock(
      {
        lockKey: studentWriteLockKey(parsedData.studentId),
        actionType: '保存每周汇报',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: '/api/feedback', weekStarting: data.weekStarting },
      },
      async () => {
        const result = await db.insert(weeklyFeedback).values(data).returning();
        const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, parsedData.studentId));
        const student = studentRows[0];
        if (student) {
          await notifyParent({
            studentId: parsedData.studentId,
            parentId: student.parentId ?? null,
            templateId: weeklyTemplateId,
            page: `/pages/student-detail/index?id=${parsedData.studentId}`,
            data: buildTemplateData(
              weeklyTemplateContentKey,
              '每周反馈已发布',
              weeklyTemplateTimeKey,
              format(parsedData.weekStarting, 'yyyy-MM-dd'),
            ),
          });
        }
        res.status(201).json(result[0]);
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/feedback/:id', authenticate, requireTeacher, async (req, res) => {
  const body = {...req.body, id: req.params.id, weekStarting: new Date(req.body.weekStarting), weekEnding: new Date(req.body.weekEnding)}
  const parsed = WeeklyFeedbackSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const existing = await db.select().from(weeklyFeedback).where(eq(weeklyFeedback.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    const parsedData = parsed.data as {
      id?: string;
      studentId: string;
      weekStarting: Date;
      weekEnding: Date;
      summary: string;
      strengths: string[];
      areasToImprove: string[];
      teacherNotes?: string;
      nextWeekFocus?: string;
    };
    if (!enforceReviewerScope(req, res, parsedData.studentId)) return;
    const feedbackRangeIssues = validateDateRange({
      startDate: format(parsedData.weekStarting, 'yyyy-MM-dd'),
      endDate: format(parsedData.weekEnding, 'yyyy-MM-dd'),
      maxDays: INPUT_LIMITS.weeklyDateRangeMaxDays,
      fieldPrefix: 'weeklyRange',
    });
    if (feedbackRangeIssues.length) return invalidInput(res, feedbackRangeIssues);
    if (trimString(parsedData.summary).length > INPUT_LIMITS.summaryTextMax) {
      return invalidInput(res, [{ field: 'summary', message: `文本过长（最多 ${INPUT_LIMITS.summaryTextMax} 字）` }]);
    }
    const data = {
      id: parsedData.id,
      studentId: parsedData.studentId,
      summary: parsedData.summary,
      strengths: parsedData.strengths,
      areasToImprove: parsedData.areasToImprove,
      teacherNotes: parsedData.teacherNotes,
      nextWeekFocus: parsedData.nextWeekFocus,
      weekStarting: format(parsedData.weekStarting, 'yyyy-MM-dd'),
      weekEnding: format(parsedData.weekEnding, 'yyyy-MM-dd'),
      updatedAt: new Date(),
      updatedByName: req.user?.name || null,
    };
    await withActionLock(
      {
        lockKey: studentWriteLockKey(parsedData.studentId),
        actionType: '更新每周汇报',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/feedback/${req.params.id}`, weekStarting: data.weekStarting },
      },
      async () => {
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        const dup = await db
          .select()
          .from(weeklyFeedback)
          .where(and(eq(weeklyFeedback.studentId, parsedData.studentId), eq(weeklyFeedback.weekStarting, data.weekStarting)))
          .limit(1);
        if (dup.length > 0 && dup[0].id !== req.params.id) {
          res.status(409).json({ error: 'Weekly feedback already exists for this student and week' });
          return;
        }
        const result = await db.update(weeklyFeedback)
          .set(data)
          .where(eq(weeklyFeedback.id, req.params.id))
          .returning();

        if (!result.length) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(result[0]);
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== AI SUMMARY ROUTES ======
app.post('/api/ai/weekly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId, weekStarting, weekEnding } = req.body || {};
  if (!studentId || !weekStarting) {
    return res.status(400).json({ error: 'Missing required fields: studentId, weekStarting' });
  }
  if (!enforceReviewerScope(req, res, studentId)) return;
  const weekStart = parseDateString(weekStarting);
  if (!weekStart) return res.status(400).json({ error: 'Invalid weekStarting date' });
  try {
    const contextWeekEnding = addDaysToDate(String(weekStart), 6);
    const recordWeekEnding = weekEnding || contextWeekEnding;
    const rangeIssues = validateDateRange({
      startDate: String(weekStart),
      endDate: String(contextWeekEnding),
      maxDays: INPUT_LIMITS.weeklyDateRangeMaxDays,
      fieldPrefix: 'weeklyRange',
    });
    if (rangeIssues.length) return invalidInput(res, rangeIssues);
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const progress = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentId),
          gte(dailyProgress.date, weekStart),
          lte(dailyProgress.date, contextWeekEnding)
        )
      )
      .orderBy(dailyProgress.date);
    const papers = await db
      .select({
        id: studentPapersTable.id,
        date: studentPapersTable.date,
        subjectId: studentPapersTable.subjectId,
        subjectName: studentPapersTable.subjectName,
        typeId: studentPapersTable.typeId,
        typeName: paperTypesTable.name,
        schoolId: studentPapersTable.schoolId,
        schoolName: paperSchoolsTable.name,
        description: studentPapersTable.description,
        strengths: studentPapersTable.strengths,
        improvements: studentPapersTable.improvements,
        score: studentPapersTable.score,
        total: studentPapersTable.total,
      })
      .from(studentPapersTable)
      .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
      .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
      .where(
        and(
          eq(studentPapersTable.studentId, studentId),
          gte(studentPapersTable.date, weekStart),
          lte(studentPapersTable.date, contextWeekEnding)
        )
      )
      .orderBy(studentPapersTable.date);
    const exams = await db
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.studentId, studentId),
          gte(examsTable.examDate, weekStart),
          lte(examsTable.examDate, contextWeekEnding)
        )
      )
      .orderBy(examsTable.examDate);
    const examIds = exams.map((exam) => exam.id);
    const examScores = examIds.length
      ? await db.select().from(examScoresTable).where(inArray(examScoresTable.examId, examIds))
      : [];
    const scoreMap = new Map<string, any[]>();
    examScores.forEach((score) => {
      const list = scoreMap.get(score.examId) || [];
      list.push({
        name: score.name,
        score: score.score,
        scope: score.scope,
      });
      scoreMap.set(score.examId, list);
    });
    const examPayload = exams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      examDate: exam.examDate,
      subjects: scoreMap.get(exam.id) || [],
    }));
    const weeklyFeedbackRows = await db
      .select()
      .from(weeklyFeedback)
      .where(
        and(
          eq(weeklyFeedback.studentId, studentId),
          eq(weeklyFeedback.weekStarting, weekStart),
        )
      )
      .orderBy(desc(weeklyFeedback.updatedAt));
    const subjectProgress = await getSubjectProgressSummary(studentId);

    // Part 5: enrich the AI context so the model can reference concrete
    // numbers and loss-points instead of guessing.
    const v2Progress = progress.map(withV2Activities);
    const lossPointLookup = await loadLossPointLookup();
    const englishStats = aggregateEnglishStats(v2Progress);
    const lossPointBreakdown = aggregateLossPoints(v2Progress, lossPointLookup);
    const attendanceRollup = aggregateAttendance(v2Progress);
    const weeklyBreakdown = aggregateWeeklySubjectAndEnglishBreakdown(v2Progress);
    const weeklyPaperBreakdown = aggregateWeeklyPaperBreakdown(papers);
    const weeklyExamBreakdown = aggregateWeeklyExamBreakdown(examPayload);
    const context = buildCompactWeeklySummaryContext({
      student,
      weekStarting: weekStart,
      weekEnding: contextWeekEnding,
      recordWeekEnding,
      attendance: attendanceRollup,
      englishStats,
      subjectBreakdown: weeklyBreakdown.subjectBreakdown,
      englishBreakdown: weeklyBreakdown.englishBreakdown,
      weeklyPaperBreakdown,
      weeklyExamBreakdown,
      lossPoints: lossPointBreakdown,
      dailyProgress: v2Progress,
      papers,
      exams: examPayload,
      weeklyFeedback: weeklyFeedbackRows,
      subjectProgress,
    });
    // Operator-supplied prompt wins; otherwise use the Part 5 enhanced prompt.
    const hasCustomWeeklyPrompt = Boolean(weeklySummaryPrompt && weeklySummaryPrompt.trim());
    const basePrompt = hasCustomWeeklyPrompt ? weeklySummaryPrompt : ENHANCED_WEEKLY_PROMPT;
    const promptToUse = `${String(basePrompt || '').trim()}\n${WEEKLY_PROMPT_HARD_APPEND}`.trim();
    await withActionLock(
      {
        lockKey: studentAiLockKey(studentId),
        actionType: '生成每周AI汇报',
        ttlMs: ACTION_LOCK_TTL.studentAiMs,
        ...withLockActor(req),
        metadata: { route: '/api/ai/weekly-summary', weekStarting: weekStart, weekEnding: contextWeekEnding },
      },
      async () =>
        withActionLock(
          {
            lockKey: studentWriteLockKey(studentId),
            actionType: '生成每周AI汇报',
            ttlMs: ACTION_LOCK_TTL.studentAiMs,
            ...withLockActor(req),
            metadata: { route: '/api/ai/weekly-summary', weekStarting: weekStart, weekEnding: contextWeekEnding },
          },
          async () => {
            const raw = await callDeepSeek(promptToUse, context, hasCustomWeeklyPrompt
              ? { temperature: 0.2, responseFormat: 'text' }
              : { temperature: 0.2, responseFormat: 'json_object' });

            // If custom env prompt is configured, respect it as plain-text output.
            // This avoids forcing the response back into the default structured schema.
            if (hasCustomWeeklyPrompt) {
              res.json({ summary: typeof raw === 'string' ? raw.trim() : '' });
              return;
            }

            const structured = parseStructuredSummary(raw);
            res.json(structured);
          },
        ),
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    const message = getErrorMessage(err);
    if (message.includes('AI_NOT_CONFIGURED')) {
      return res.status(400).json({ error: 'AI_NOT_CONFIGURED' });
    }
    console.error('AI weekly summary error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.post('/api/ai/quarterly-summary', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId, startDate, endDate } = req.body || {};
  const saveReport = parseBooleanLike(req.body?.saveReport) === true;
  if (!studentId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!enforceReviewerScope(req, res, studentId)) return;
  const quarterlyRangeIssues = validateDateRange({
    startDate: String(startDate),
    endDate: String(endDate),
    maxDays: INPUT_LIMITS.quarterlyDateRangeMaxDays,
    fieldPrefix: 'quarterlyRange',
  });
  if (quarterlyRangeIssues.length) return invalidInput(res, quarterlyRangeIssues);
  try {
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const daily = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentId),
          gte(dailyProgress.date, startDate),
          lte(dailyProgress.date, endDate)
        )
      )
      .orderBy(dailyProgress.date);
    const weekly = await db
      .select()
      .from(weeklyFeedback)
      .where(
        and(
          eq(weeklyFeedback.studentId, studentId),
          gte(weeklyFeedback.weekStarting, startDate),
          lte(weeklyFeedback.weekEnding, endDate)
        )
      )
      .orderBy(weeklyFeedback.weekStarting);
    const papers = await db
      .select({
        id: studentPapersTable.id,
        date: studentPapersTable.date,
        subjectId: studentPapersTable.subjectId,
        subjectName: studentPapersTable.subjectName,
        typeId: studentPapersTable.typeId,
        typeName: paperTypesTable.name,
        schoolId: studentPapersTable.schoolId,
        schoolName: paperSchoolsTable.name,
        description: studentPapersTable.description,
        score: studentPapersTable.score,
        total: studentPapersTable.total,
      })
      .from(studentPapersTable)
      .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
      .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
      .where(
        and(
          eq(studentPapersTable.studentId, studentId),
          gte(studentPapersTable.date, startDate),
          lte(studentPapersTable.date, endDate)
        )
      )
      .orderBy(studentPapersTable.date);
    const exams = await db
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.studentId, studentId),
          gte(examsTable.examDate, startDate),
          lte(examsTable.examDate, endDate)
        )
      )
      .orderBy(examsTable.examDate);
    const examIds = exams.map((e) => e.id);
    const scores = examIds.length
      ? await db.select().from(examScoresTable).where(inArray(examScoresTable.examId, examIds))
      : [];
    const scoreMap = new Map<string, any[]>();
    scores.forEach((s) => {
      const list = scoreMap.get(s.examId) || [];
      list.push({ name: s.name, score: s.score });
      scoreMap.set(s.examId, list);
    });
    const examPayload = exams.map((e) => ({
      id: e.id,
      name: e.name,
      examDate: e.examDate,
      subjects: scoreMap.get(e.id) || [],
    }));
    const prevQuarter = await db
      .select()
      .from(quarterlySummaryTable)
      .where(
        and(
          eq(quarterlySummaryTable.studentId, studentId),
          lt(quarterlySummaryTable.endDate, startDate)
        )
      )
      .orderBy(desc(quarterlySummaryTable.endDate))
      .limit(1);
    const prevQuarterReportRows = await db
      .select({
        id: studentReportsTable.id,
        reportType: studentReportsTable.reportType,
        title: studentReportsTable.title,
        startDate: studentReportsTable.startDate,
        endDate: studentReportsTable.endDate,
        year: studentReportsTable.year,
        summaryText: studentReportsTable.summaryText,
        structuredReportJson: studentReportsTable.structuredReportJson,
        finalReportJson: studentReportsTable.finalReportJson,
        updatedAt: studentReportsTable.updatedAt,
      })
      .from(studentReportsTable)
      .where(
        and(
          eq(studentReportsTable.studentId, studentId),
          eq(studentReportsTable.reportType, 'quarterly'),
          lt(studentReportsTable.endDate, startDate),
        ),
      )
      .orderBy(desc(studentReportsTable.endDate), desc(studentReportsTable.updatedAt))
      .limit(1);
    const prevQuarterReport = prevQuarterReportRows[0]
      ? {
          ...prevQuarterReportRows[0],
          finalReport: parseReportJson(prevQuarterReportRows[0].finalReportJson).value,
          structuredReport: parseReportJson(prevQuarterReportRows[0].structuredReportJson).value,
        }
      : null;
    const previousQuarterContext = prevQuarterReport || prevQuarter[0] || null;
    const normalizedDaily = daily.map(withV2Activities);
    const analytics = buildStudentReportAnalytics({
      student,
      startDate,
      endDate,
      dailyProgress: normalizedDaily,
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      previousQuarterSummary: previousQuarterContext,
      quarterlySummaries: [],
      reportType: 'quarterly',
    });
    const context = buildCompactReportContext({
      student,
      startDate,
      endDate,
      dailyProgress: normalizedDaily,
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      previousQuarterSummary: previousQuarterContext,
      analytics,
      reportType: 'quarterly',
    });
    const hasCustomQuarterlyPrompt = Boolean(quarterlySummaryPrompt && quarterlySummaryPrompt.trim());
    const promptToUse = hasCustomQuarterlyPrompt
      ? quarterlySummaryPrompt
      : DEEPSEEK_QUARTERLY_PROMPT;
    await withActionLock(
      {
        lockKey: studentAiLockKey(studentId),
        actionType: '生成学期学习报告',
        ttlMs: ACTION_LOCK_TTL.studentAiMs,
        ...withLockActor(req),
        metadata: { route: '/api/ai/quarterly-summary', startDate, endDate, saveReport },
      },
      async () =>
        withActionLock(
          {
            lockKey: studentWriteLockKey(studentId),
            actionType: '生成学期学习报告',
            ttlMs: ACTION_LOCK_TTL.studentAiMs,
            ...withLockActor(req),
            metadata: { route: '/api/ai/quarterly-summary', startDate, endDate, saveReport },
          },
          async () => {
            const raw = await callDeepSeek(promptToUse, context, hasCustomQuarterlyPrompt
              ? { temperature: 0.2, responseFormat: 'text' }
              : { temperature: 0.2, responseFormat: 'json_object' });
            const parsed = parseAiStructuredReportResponse(raw, 'quarterly');
            const baseResponse: Record<string, unknown> = {
              summary: parsed.summaryText,
              structuredReport: parsed.structuredReport,
              analytics,
              rawAiResponse: parsed.rawAiResponse,
              parseError: parsed.parseError,
            };

            if (!saveReport) {
              res.json(baseResponse);
              return;
            }

            const normalizedPayload = normalizeReportPayload({
              reportType: 'quarterly',
              structuredReport: parsed.structuredReport,
              finalReport: parsed.structuredReport,
              analytics,
            });
            const saved = await db
              .insert(studentReportsTable)
              .values({
                studentId,
                reportType: 'quarterly',
                title: `${student.name || '学生'}学期学习报告（${startDate}~${endDate}）`,
                startDate,
                endDate,
                year: Number(String(startDate).slice(0, 4)),
                summaryText: parsed.summaryText,
                analyticsJson: serializeReportJson(analytics),
                structuredReportJson: normalizedPayload.structuredReportJson,
                finalReportJson: normalizedPayload.finalReportJson,
                rawAiResponse: parsed.rawAiResponse || null,
                parseError: parsed.parseError || null,
                status: 'draft',
                visibleToParent: false,
                createdBy: req.user?.id || null,
                updatedBy: req.user?.id || null,
                updatedAt: new Date(),
                updatedByName: req.user?.name || null,
              })
              .returning();

            res.json({
              ...baseResponse,
              savedReport: hydrateStudentReport(saved[0], req.user?.role || 'teacher', { includeHeavyFields: true }),
              reportId: saved[0].id,
            });
          },
        ),
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    const message = getErrorMessage(err);
    if (message.includes('AI_NOT_CONFIGURED')) {
      return res.status(400).json({ error: 'AI_NOT_CONFIGURED' });
    }
    console.error('AI quarterly summary error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.post('/api/ai/yearly-summary', authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const { studentId, year, startDate: startDateRaw, endDate: endDateRaw } = req.body || {};
  const saveReport = parseBooleanLike(req.body?.saveReport) === true;
  const yearNum = parseFiniteInteger(year);
  const startDateInput = parseDateString(startDateRaw);
  const endDateInput = parseDateString(endDateRaw);
  const hasCustomRange = Boolean(startDateInput && endDateInput);
  if (!studentId || (!hasCustomRange && yearNum === null)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!enforceReviewerScope(req, res, studentId)) return;
  let startDate = '';
  let endDate = '';
  let resolvedYear: number | null = null;
  if (hasCustomRange) {
    const rangeIssues = validateDateRange({
      startDate: startDateInput as string,
      endDate: endDateInput as string,
      maxDays: INPUT_LIMITS.yearlyDateRangeMaxDays,
      fieldPrefix: 'yearlyRange',
    });
    if (rangeIssues.length) return invalidInput(res, rangeIssues);
    startDate = startDateInput as string;
    endDate = endDateInput as string;
    resolvedYear = Number(String(startDate).slice(0, 4));
  } else {
    const yearIssue = validateYearRange(yearNum as number, 'year');
    if (yearIssue) return invalidInput(res, [yearIssue]);
    startDate = `${yearNum}-01-01`;
    endDate = `${yearNum}-12-31`;
    resolvedYear = yearNum;
  }
  try {
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const daily = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentId),
          gte(dailyProgress.date, startDate),
          lte(dailyProgress.date, endDate)
        )
      )
      .orderBy(dailyProgress.date);
    const weekly = await db
      .select()
      .from(weeklyFeedback)
      .where(
        and(
          eq(weeklyFeedback.studentId, studentId),
          gte(weeklyFeedback.weekStarting, startDate),
          lte(weeklyFeedback.weekEnding, endDate)
        )
      )
      .orderBy(weeklyFeedback.weekStarting);
    const papers = await db
      .select({
        id: studentPapersTable.id,
        date: studentPapersTable.date,
        subjectId: studentPapersTable.subjectId,
        subjectName: studentPapersTable.subjectName,
        typeId: studentPapersTable.typeId,
        typeName: paperTypesTable.name,
        schoolId: studentPapersTable.schoolId,
        schoolName: paperSchoolsTable.name,
        description: studentPapersTable.description,
        score: studentPapersTable.score,
        total: studentPapersTable.total,
      })
      .from(studentPapersTable)
      .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
      .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
      .where(
        and(
          eq(studentPapersTable.studentId, studentId),
          gte(studentPapersTable.date, startDate),
          lte(studentPapersTable.date, endDate)
        )
      )
      .orderBy(studentPapersTable.date);
    const exams = await db
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.studentId, studentId),
          gte(examsTable.examDate, startDate),
          lte(examsTable.examDate, endDate)
        )
      )
      .orderBy(examsTable.examDate);
    const examIds = exams.map((e) => e.id);
    const scores = examIds.length
      ? await db.select().from(examScoresTable).where(inArray(examScoresTable.examId, examIds))
      : [];
    const scoreMap = new Map<string, any[]>();
    scores.forEach((s) => {
      const list = scoreMap.get(s.examId) || [];
      list.push({ name: s.name, score: s.score });
      scoreMap.set(s.examId, list);
    });
    const examPayload = exams.map((e) => ({
      id: e.id,
      name: e.name,
      examDate: e.examDate,
      subjects: scoreMap.get(e.id) || [],
    }));
    const quarters = await db
      .select()
      .from(quarterlySummaryTable)
      .where(and(eq(quarterlySummaryTable.studentId, studentId), eq(quarterlySummaryTable.year, resolvedYear as number)))
      .orderBy(quarterlySummaryTable.quarter);
    const quarterlyReportRows = await db
      .select({
        id: studentReportsTable.id,
        reportType: studentReportsTable.reportType,
        title: studentReportsTable.title,
        startDate: studentReportsTable.startDate,
        endDate: studentReportsTable.endDate,
        year: studentReportsTable.year,
        summaryText: studentReportsTable.summaryText,
        structuredReportJson: studentReportsTable.structuredReportJson,
        finalReportJson: studentReportsTable.finalReportJson,
        updatedAt: studentReportsTable.updatedAt,
      })
      .from(studentReportsTable)
      .where(
        and(
          eq(studentReportsTable.studentId, studentId),
          eq(studentReportsTable.reportType, 'quarterly'),
          gte(studentReportsTable.startDate, startDate),
          lte(studentReportsTable.endDate, endDate),
        ),
      )
      .orderBy(studentReportsTable.startDate, studentReportsTable.endDate);
    const quarterlyReportHistory = quarterlyReportRows.map((row) => ({
      ...row,
      finalReport: parseReportJson(row.finalReportJson).value,
      structuredReport: parseReportJson(row.structuredReportJson).value,
    }));
    const quarterlyHistoryForContext = quarterlyReportHistory.length ? quarterlyReportHistory : quarters;
    const normalizedDaily = daily.map(withV2Activities);
    const analytics = buildStudentReportAnalytics({
      student,
      startDate,
      endDate,
      dailyProgress: normalizedDaily,
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      previousQuarterSummary: null,
      quarterlySummaries: quarterlyHistoryForContext,
      reportType: 'yearly',
    });
    const context = buildCompactReportContext({
      student,
      year: resolvedYear || undefined,
      startDate,
      endDate,
      dailyProgress: normalizedDaily,
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      quarterlySummaries: quarterlyHistoryForContext,
      analytics,
      reportType: 'yearly',
    });
    const hasCustomYearlyPrompt = Boolean(yearlySummaryPrompt && yearlySummaryPrompt.trim());
    const promptToUse = hasCustomYearlyPrompt
      ? yearlySummaryPrompt
      : DEEPSEEK_YEARLY_PROMPT;
    await withActionLock(
      {
        lockKey: studentAiLockKey(studentId),
        actionType: '生成年度学习报告',
        ttlMs: ACTION_LOCK_TTL.studentAiMs,
        ...withLockActor(req),
        metadata: { route: '/api/ai/yearly-summary', year: resolvedYear, startDate, endDate, saveReport },
      },
      async () =>
        withActionLock(
          {
            lockKey: studentWriteLockKey(studentId),
            actionType: '生成年度学习报告',
            ttlMs: ACTION_LOCK_TTL.studentAiMs,
            ...withLockActor(req),
            metadata: { route: '/api/ai/yearly-summary', year: resolvedYear, startDate, endDate, saveReport },
          },
          async () => {
            const raw = await callDeepSeek(promptToUse, context, hasCustomYearlyPrompt
              ? { temperature: 0.2, responseFormat: 'text' }
              : { temperature: 0.2, responseFormat: 'json_object' });
            const parsed = parseAiStructuredReportResponse(raw, 'yearly');
            const baseResponse: Record<string, unknown> = {
              summary: parsed.summaryText,
              structuredReport: parsed.structuredReport,
              analytics,
              rawAiResponse: parsed.rawAiResponse,
              parseError: parsed.parseError,
            };

            if (!saveReport) {
              res.json(baseResponse);
              return;
            }

            const normalizedPayload = normalizeReportPayload({
              reportType: 'yearly',
              structuredReport: parsed.structuredReport,
              finalReport: parsed.structuredReport,
              analytics,
            });
            const saved = await db
              .insert(studentReportsTable)
              .values({
                studentId,
                reportType: 'yearly',
                title: resolvedYear
                  ? `${student.name || '学生'}年度学习报告（${resolvedYear}）`
                  : `${student.name || '学生'}年度学习报告（${startDate}~${endDate}）`,
                startDate,
                endDate,
                year: resolvedYear,
                summaryText: parsed.summaryText,
                analyticsJson: serializeReportJson(analytics),
                structuredReportJson: normalizedPayload.structuredReportJson,
                finalReportJson: normalizedPayload.finalReportJson,
                rawAiResponse: parsed.rawAiResponse || null,
                parseError: parsed.parseError || null,
                status: 'draft',
                visibleToParent: false,
                createdBy: req.user?.id || null,
                updatedBy: req.user?.id || null,
                updatedAt: new Date(),
                updatedByName: req.user?.name || null,
              })
              .returning();

            res.json({
              ...baseResponse,
              savedReport: hydrateStudentReport(saved[0], req.user?.role || 'teacher', { includeHeavyFields: true }),
              reportId: saved[0].id,
            });
          },
        ),
    );
    return;
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    const message = getErrorMessage(err);
    if (message.includes('AI_NOT_CONFIGURED')) {
      return res.status(400).json({ error: 'AI_NOT_CONFIGURED' });
    }
    console.error('AI yearly summary error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.delete('/api/feedback/:id', authenticate, requireTeacher, async (req, res) => {
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    const existing = await db.select().from(weeklyFeedback).where(eq(weeklyFeedback.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    if (!enforceReviewerScope(req, res, existing[0].studentId)) return;
    await withActionLock(
      {
        lockKey: studentWriteLockKey(existing[0].studentId),
        actionType: '删除每周汇报',
        ttlMs: ACTION_LOCK_TTL.studentWriteMs,
        ...withLockActor(req),
        metadata: { route: `/api/feedback/${req.params.id}` },
      },
      async () => {
        if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
          res.status(409).json({
            error: 'CONFLICT',
            updatedAt: existing[0].updatedAt,
            updatedByName: existing[0].updatedByName,
          });
          return;
        }
        await db.delete(weeklyFeedback).where(eq(weeklyFeedback.id, req.params.id)).returning();
        res.json({ success: true });
      },
    );
  } catch (err) {
    if (isActionLockConflictError(err)) {
      return res.status(409).json(buildActionLockConflictPayload(err.conflict));
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/feedback/one?studentId=...&weekStarting=yyyy-MM-dd
app.get('/api/feedback/one', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId, weekStarting } = req.query;
  if (!studentId || !weekStarting) return res.status(400).json({ error: 'Missing query' });

  const d = new Date(String(weekStarting));
  if (isNaN(d.getTime())) {
    return res.status(400).json({ error: 'Invalid weekStarting date' });
  }

  const formattedStartDate = format(d, 'yyyy-MM-dd');
  try {
    const [row] = await db
      .select()
      .from(weeklyFeedback)
      .where(and(
        eq(weeklyFeedback.studentId, String(studentId)),
        eq(weeklyFeedback.weekStarting, formattedStartDate)
      ))
      .limit(1);

    res.json(row || null);
  } catch (err) {
    console.error('feedback/one error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/feedback/list?studentId=...
app.get('/api/feedback/list', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

  try {
    const rows = await db
      .select()
      .from(weeklyFeedback)
      .where(eq(weeklyFeedback.studentId, String(studentId)))
      .orderBy(desc(weeklyFeedback.weekStarting));
    res.json(rows);
  } catch (err) {
    console.error('feedback/list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});



// ========== LOGIN ROUTE ==========

// WeChat Mini Program login
app.post('/api/auth/wechat', async (req, res) => {
  const { code, role, name, nickname, displayName, avatarUrl } = req.body as {
    code?: string;
    role?: 'teacher' | 'parent' | 'admin';
    name?: string;
    nickname?: string;
    displayName?: string;
    avatarUrl?: string;
  };

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing code' });
  }
  if (role !== 'teacher' && role !== 'parent' && role !== 'admin') {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const session = await exchangeWeChatCode(code);
    if (session.errcode) {
      return res.status(401).json({ error: session.errmsg || 'WeChat auth failed', code: session.errcode });
    }
    if (!session.openid) {
      return res.status(401).json({ error: 'WeChat auth failed: missing openid' });
    }

    const openid = session.openid;
    const unionid = session.unionid || null;
    const submittedDisplayName =
      pickDisplayName(displayName) || pickDisplayName(nickname) || pickDisplayName(name);
    if (submittedDisplayName) {
      const displayIssue = validateDisplayName(submittedDisplayName);
      if (displayIssue) return invalidInput(res, [displayIssue]);
    }
    const nextAvatarUrl = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null;

    if (role === 'teacher' || role === 'parent') {
      const table = role === 'teacher' ? teachersTable : parentsTable;
      const openIdColumn = role === 'teacher' ? teachersTable.wechatOpenId : parentsTable.wechatOpenId;
      const unionIdColumn = role === 'teacher' ? teachersTable.wechatUnionId : parentsTable.wechatUnionId;

      let existing = await db.select().from(table).where(eq(openIdColumn, openid)).limit(1);

      if (!existing.length && unionid) {
        existing = await db.select().from(table).where(eq(unionIdColumn, unionid)).limit(1);
      }

      if (existing.length) {
        let userRow = existing[0];
        const storedDisplayName = (userRow.displayName || userRow.name || '').trim();
        const hasRealNickname = Boolean(storedDisplayName) && storedDisplayName !== DEFAULT_USER_NAME;

        // Legacy / incomplete record: created before the nickname requirement. Force profile completion.
        if (!hasRealNickname && !submittedDisplayName) {
          return res.status(400).json({
            error: '请先填写昵称，管理员需凭此名称审核账号。',
            code: 'nickname_required',
          });
        }

        const patch: Record<string, unknown> = {};
        const currentDisplayName = storedDisplayName || DEFAULT_USER_NAME;
        if (submittedDisplayName && currentDisplayName !== submittedDisplayName) {
          patch.name = submittedDisplayName;
          patch.displayName = submittedDisplayName;
        }
        if (userRow.wechatOpenId !== openid) {
          patch.wechatOpenId = openid;
        }
        if (unionid && userRow.wechatUnionId !== unionid) {
          patch.wechatUnionId = unionid;
        }
        if (nextAvatarUrl && userRow.avatarUrl !== nextAvatarUrl) {
          patch.avatarUrl = nextAvatarUrl;
        }
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date();
          const updatedRows = await db.update(table).set(patch).where(eq(table.id, userRow.id)).returning();
          userRow = updatedRows[0];
        }

        if (userRow.status !== 'approved') {
          return res.status(401).json({
            error: userRow.status === 'rejected' ? '账号已被管理员拒绝，请联系管理员。' : '账号等待管理员审核。',
            status: 'pending_approval',
            user: toPublicUser(userRow, role),
          });
        }

        const token = generateToken({
          id: userRow.id,
          role,
          name: userRow.displayName || userRow.name || DEFAULT_USER_NAME,
        });
        return res.json({ user: toPublicUser(userRow, role), token });
      }

      // First login: require a human-readable nickname so admins can identify the applicant.
      if (!submittedDisplayName) {
        return res.status(400).json({
          error: '请先填写昵称，管理员需凭此名称审核账号。',
          code: 'nickname_required',
        });
      }

      // First login: create pending account bound to WeChat identity only.
      const createdRows = await db
        .insert(table)
        .values({
          name: submittedDisplayName,
          displayName: submittedDisplayName,
          avatarUrl: nextAvatarUrl,
          status: 'pending',
          emailVerified: 'true',
          email: null,
          password: null,
          authProvider: 'wechat',
          wechatOpenId: openid,
          wechatUnionId: unionid,
        })
        .returning();

      const created = createdRows[0];
      return res.json({
        user: toPublicUser(created, role),
        status: 'pending_approval',
        message: 'Account created. Pending admin approval.',
      });
    }

    // role === 'admin': admin must already exist in DB and be mapped to WeChat identity.
    let admins = await db.select().from(adminsTable).where(eq(adminsTable.wechatOpenId, openid)).limit(1);
    if (!admins.length && unionid) {
      admins = await db.select().from(adminsTable).where(eq(adminsTable.wechatUnionId, unionid)).limit(1);
    }
    if (!admins.length) {
      return res.status(403).json({
        error: '当前微信账号没有管理员权限。',
        code: 'admin_not_authorized',
      });
    }

    let admin = admins[0];
    const adminPatch: Record<string, unknown> = {};
    const adminDisplayName = admin.displayName || admin.name || DEFAULT_USER_NAME;
    if (submittedDisplayName && adminDisplayName !== submittedDisplayName) {
      adminPatch.name = submittedDisplayName;
      adminPatch.displayName = submittedDisplayName;
    }
    if (admin.wechatOpenId !== openid) adminPatch.wechatOpenId = openid;
    if (unionid && admin.wechatUnionId !== unionid) adminPatch.wechatUnionId = unionid;
    if (nextAvatarUrl && admin.avatarUrl !== nextAvatarUrl) adminPatch.avatarUrl = nextAvatarUrl;
    if (Object.keys(adminPatch).length) {
      adminPatch.updatedAt = new Date();
      const updatedRows = await db.update(adminsTable).set(adminPatch).where(eq(adminsTable.id, admin.id)).returning();
      admin = updatedRows[0];
    }

    const token = generateToken({
      id: admin.id,
      role: 'admin',
      name: admin.displayName || admin.name || DEFAULT_USER_NAME,
    });
    return res.json({ user: toPublicUser(admin, 'admin'), token });
  } catch (err) {
    console.error('WeChat login error:', err);
    res.status(500).json({ error: 'WeChat login failed' });
  }
});

const reviewerLoginHandler: express.RequestHandler = async (req, res) => {
  const username = trimString(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  if (username.length > 64 || password.length > 128) {
    return res.status(400).json({ error: 'Invalid credentials format' });
  }

  const validUser = safeEq(username, REVIEWER_USERNAME);
  const validPass = safeEq(password, REVIEWER_PASSWORD);
  if (!validUser || !validPass) {
    return res.status(401).json({ error: '账号或密码错误' });
  }

  if (!REVIEWER_STUDENT_ID) {
    return res.status(503).json({
      error: 'Reviewer login is not configured',
      code: 'reviewer_not_configured',
    });
  }

  try {
    const demoStudentRows = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, REVIEWER_STUDENT_ID))
      .limit(1);
    if (!demoStudentRows.length) {
      return res.status(503).json({
        error: 'Reviewer demo student is not configured correctly',
        code: 'reviewer_student_not_found',
      });
    }

    let teacherRows: Array<typeof teachersTable.$inferSelect> = [];
    if (REVIEWER_TEACHER_ID) {
      teacherRows = await db
        .select()
        .from(teachersTable)
        .where(eq(teachersTable.id, REVIEWER_TEACHER_ID))
        .limit(1);
    }
    if (!teacherRows.length) {
      teacherRows = await db
        .select()
        .from(teachersTable)
        .where(eq(teachersTable.email, REVIEWER_EMAIL))
        .limit(1);
    }

    let reviewerTeacher = teacherRows[0];
    if (!reviewerTeacher) {
      const created = await db
        .insert(teachersTable)
        .values({
          name: REVIEWER_DISPLAY_NAME,
          displayName: REVIEWER_DISPLAY_NAME,
          email: REVIEWER_EMAIL,
          password: null,
          status: 'approved',
          emailVerified: 'true',
          authProvider: 'reviewer',
          wechatOpenId: null,
          wechatUnionId: null,
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .returning();
      reviewerTeacher = created[0];
    } else if (
      reviewerTeacher.status !== 'approved' ||
      reviewerTeacher.displayName !== REVIEWER_DISPLAY_NAME ||
      reviewerTeacher.name !== REVIEWER_DISPLAY_NAME
    ) {
      const updated = await db
        .update(teachersTable)
        .set({
          name: REVIEWER_DISPLAY_NAME,
          displayName: REVIEWER_DISPLAY_NAME,
          status: 'approved',
          emailVerified: 'true',
          authProvider: reviewerTeacher.authProvider || 'reviewer',
          updatedAt: new Date(),
        })
        .where(eq(teachersTable.id, reviewerTeacher.id))
        .returning();
      reviewerTeacher = updated[0];
    }

    const token = generateToken({
      id: reviewerTeacher.id,
      role: 'teacher',
      name: reviewerTeacher.displayName || reviewerTeacher.name || REVIEWER_DISPLAY_NAME,
      isReviewer: true,
      reviewerStudentId: REVIEWER_STUDENT_ID,
    });

    return res.json({
      user: {
        ...toPublicUser(reviewerTeacher, 'teacher'),
        isReviewer: true,
        reviewerStudentId: REVIEWER_STUDENT_ID,
      },
      token,
    });
  } catch (err) {
    console.error('Reviewer login error:', err);
    return res.status(500).json({ error: 'Reviewer login failed' });
  }
};

// Keep both paths to tolerate API gateway setups that may or may not strip `/api`.
app.post('/api/auth/reviewer-login', reviewerLoginHandler);
app.post('/auth/reviewer-login', reviewerLoginHandler);

app.post('/api/login', async (_req, res) => {
  res.status(410).json({
    error: 'Email/password login is deprecated. Use /api/auth/wechat.',
  });
});

// ========== PROFILE / SETTINGS ROUTES ==========

app.get('/api/profile', authenticate, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  try {
    if (req.user.role === 'teacher') {
      const rows = await db.select().from(teachersTable).where(eq(teachersTable.id, req.user.id)).limit(1);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: toPublicUser(rows[0], 'teacher') });
    }
    if (req.user.role === 'parent') {
      const rows = await db.select().from(parentsTable).where(eq(parentsTable.id, req.user.id)).limit(1);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: toPublicUser(rows[0], 'parent') });
    }
    const rows = await db.select().from(adminsTable).where(eq(adminsTable.id, req.user.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toPublicUser(rows[0], 'admin') });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const explicitDisplayName = pickDisplayName(req.body?.displayName) || pickDisplayName(req.body?.name);
  const hasDisplayName = !!explicitDisplayName;
  const hasAvatarField = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatarUrl');
  const nextAvatar = hasAvatarField && typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim() : null;
  if (!hasDisplayName && !hasAvatarField) {
    return res.status(400).json({ error: 'displayName or avatarUrl is required' });
  }

  try {
    if (hasDisplayName) {
      const displayIssue = validateDisplayName(explicitDisplayName);
      if (displayIssue) return invalidInput(res, [displayIssue]);
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (hasDisplayName) {
      patch.name = explicitDisplayName;
      patch.displayName = explicitDisplayName;
    }
    if (hasAvatarField) {
      patch.avatarUrl = nextAvatar || null;
    }

    if (req.user.role === 'teacher') {
      const updated = await db.update(teachersTable).set(patch).where(eq(teachersTable.id, req.user.id)).returning();
      if (!updated.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: toPublicUser(updated[0], 'teacher') });
    }

    if (req.user.role === 'parent') {
      const updated = await db.update(parentsTable).set(patch).where(eq(parentsTable.id, req.user.id)).returning();
      if (!updated.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: toPublicUser(updated[0], 'parent') });
    }

    const updated = await db.update(adminsTable).set(patch).where(eq(adminsTable.id, req.user.id)).returning();
    if (!updated.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toPublicUser(updated[0], 'admin') });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/profile/password', authenticate, async (_req, res) => {
  res.status(410).json({
    error: 'Password-based profile update is deprecated in WeChat-only auth mode.',
  });
});

// ========== TEST ENDPOINTS ==========

app.get('/api/test-env', (req, res) => {
  res.json({
    resendApiKey: process.env.RESEND_API_KEY ? 'Present' : 'Missing',
    gmailUser: process.env.GMAIL_USER ? 'Present' : 'Missing',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD ? 'Present' : 'Missing',
    frontendUrl: process.env.FRONTEND_URL || 'Not set',
    nodeEnv: process.env.NODE_ENV || 'Not set',
    message: 'Environment variables check'
  });
});

app.get('/api/test-gmail', async (req, res) => {
  try {
    const { gmailEmailService } = await import('./utils/gmailEmailService');
    const isConnected = await gmailEmailService.testConnection();
    
    res.json({
      success: isConnected,
      message: isConnected ? 'Gmail SMTP connection successful' : 'Gmail SMTP connection failed',
      gmailUser: process.env.GMAIL_USER || 'Not set',
      gmailAppPassword: process.env.GMAIL_APP_PASSWORD ? 'Present' : 'Missing'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to test Gmail connection',
      error: getErrorMessage(error)
    });
  }
});

// ========== EMAIL VERIFICATION ROUTES ==========

app.get('/api/verify-email/:token', async (_req, res) => {
  res.status(410).json({
    error: 'Email verification is deprecated in WeChat-only auth mode.',
  });
});


if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });
}

export { app };
