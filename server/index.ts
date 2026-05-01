import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
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
import { enrichLossPointLabels, type LossPointLookup } from './utils/lossPointLabels';
import {
  ENHANCED_WEEKLY_PROMPT,
  aggregateAttendance,
  aggregateEnglishStats,
  aggregateLossPoints,
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
  StudentSubjectSchema,
  StudentTopicProgressSchema,
  TOPIC_STATUS
} from './schema';

import { generateToken } from './utils/auth';
import { authenticate, requireTeacher, requireParent, requireAdmin } from './middleware/auth';
import { verifyParentStudentAccess } from './middleware/parentStudent';
import { syncCatalogForStudentSubjects } from './utils/catalogSync';
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
  if (!payload.parentId || !payload.templateId) return;
  const parents = await db.select().from(parentsTable).where(eq(parentsTable.id, payload.parentId));
  if (!parents.length || !parents[0].wechatOpenId) return;
  await sendWeChatSubscribeMessage({
    toUser: parents[0].wechatOpenId,
    templateId: payload.templateId,
    page: payload.page,
    data: payload.data,
  });
};

const callDeepSeek = async (prompt: string, context: any) => {
  if (!deepseekApiKey || !deepseekApiUrl || !prompt) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  const resp = await fetch(deepseekApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: deepseekModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(context) },
      ],
    }),
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

app.get('/api/parents', authenticate, requireTeacher, async (_, res) => {
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

    await db.delete(studentsTable).where(eq(studentsTable.id, id));
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
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
    const scoreMap = new Map<string, { name: string; score: string; scope: string | null; examDate: string | Date | null }[]>();
    scores.forEach((s) => {
      const list = scoreMap.get(s.examId) || [];
      list.push({ name: s.name, score: s.score, scope: s.scope ?? null, examDate: s.examDate ?? null });
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

  try {
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
        data: {
          thing1: { value: `成绩记录已发布` },
          time2: { value: examDate },
        },
      });
    }
    res.status(201).json({ ...exam, subjects: normalized });
  } catch (err) {
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

  try {
    const existing = await db.select().from(examsTable).where(eq(examsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Exam not found' });
    if (studentId && existing[0].studentId !== studentId) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
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
  } catch (err) {
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
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    await db.delete(examScoresTable).where(eq(examScoresTable.examId, id));
    const result = await db.delete(examsTable).where(eq(examsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Exam not found' });
    res.json({ message: 'Exam deleted successfully' });
  } catch (err) {
    console.error('Error deleting exam:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// "即将到来的考试" dashboard card. Returns exams across all students that are
// inside their reminder window (effective reminder ≤ today ≤ examDate).
app.get('/api/exams/upcoming', authenticate, requireTeacher, async (req, res) => {
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
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
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
  const year = Number(req.body?.year || new Date().getFullYear());
  const summaries = Array.isArray(req.body?.summaries) ? req.body.summaries : [];
  const singleQuarter = Number(req.body?.quarter);
  const singleSummary = req.body?.summary;
  const startDate = req.body?.startDate ? String(req.body.startDate) : null;
  const endDate = req.body?.endDate ? String(req.body.endDate) : null;
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
  try {
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
          data: {
            thing1: { value: `学期总结已发布 ${label}` },
            time2: { value: timeValue },
          },
        });
      }
    }
    res.json({ message: 'Quarterly summaries saved' });
  } catch (err) {
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
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
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
  const year = Number(req.body?.year || new Date().getFullYear());
  const summary = String(req.body?.summary || "");
  const clientUpdatedAt = parseTimestamp(req.body?.updatedAt);
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' });
  try {
    const parsed = YearlySummarySchema.safeParse({ studentId, year, summary });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const existing = await db
      .select()
      .from(yearlySummaryTable)
      .where(and(eq(yearlySummaryTable.studentId, studentId), eq(yearlySummaryTable.year, year)))
      .limit(1);
    if (existing.length) {
      if (!clientUpdatedAt) {
        return res.status(409).json({
          error: 'CONFLICT',
          updatedAt: existing[0].updatedAt,
          updatedByName: existing[0].updatedByName,
        });
      }
      if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
        return res.status(409).json({
          error: 'CONFLICT',
          updatedAt: existing[0].updatedAt,
          updatedByName: existing[0].updatedByName,
        });
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
          data: {
            thing1: { value: `年度总结已发布` },
            time2: { value: `${year}-12-31` },
          },
        });
      }
      res.status(201).json(result[0]);
    }
  } catch (err) {
    console.error('Error saving yearly summary:', err);
    res.status(500).json({ error: 'Database error' });
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

// ====== SUBJECT & TOPIC ROUTES ======
// List all subjects
app.get('/api/subjects', async (_, res) => {
  try {
    const subjects = await db.select().from(subjectsTable);
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get list of subject IDs a student is enrolled in
app.get('/api/students/:studentId/subjects', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  try {
    const records = await db
      .select({ subjectId: studentSubjectsTable.subjectId })
      .from(studentSubjectsTable)
      .where(eq(studentSubjectsTable.studentId, studentId));
    res.json(records.map(r => r.subjectId));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign subjects to a student (replaces existing assignments)
app.put('/api/students/:studentId/subjects', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  const { subjectIds, resetProgress } = req.body as {
    subjectIds: string[];
    /** optional: 'removed' | 'all' | 'keep' */
    resetProgress?: 'removed' | 'all' | 'keep';
  };

  if (!Array.isArray(subjectIds)) {
    return res.status(400).json({ error: 'subjectIds must be an array of subject IDs' });
  }

  try {
    const englishRows = await db
      .select({ id: subjectsTable.id })
      .from(subjectsTable)
      .where(eq(subjectsTable.code, 'ENGLISH'))
      .limit(1);
    if (!englishRows.length) {
      return res.status(500).json({ error: 'English subject not found' });
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Sync topics from subjectCatalogs.json for a student's assigned subjects
app.post('/api/students/:studentId/subjects/sync-catalog', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  try {
    const subjects = await db
      .select({
        id: subjectsTable.id,
        code: subjectsTable.code,
      })
      .from(studentSubjectsTable)
      .innerJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
      .where(eq(studentSubjectsTable.studentId, studentId));

    const summary = await syncCatalogForStudentSubjects(subjects);
    res.json(summary);
  } catch (err) {
    console.error('Error syncing catalog topics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// Get full subject with topics and current progress status for a student
app.get('/api/students/:studentId/subjects/full', authenticate, verifyParentStudentAccess, async (req, res) => {
  const { studentId } = req.params;
  try {
    const rows = await db
      .select({
        subjectId: subjectsTable.id,
        subjectCode: subjectsTable.code,
        subjectName: subjectsTable.name,
        subjectLevel: subjectsTable.level,
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
      .where(eq(studentSubjectsTable.studentId, studentId))
      .leftJoin(subjectsTable, eq(studentSubjectsTable.subjectId, subjectsTable.id))
      .leftJoin(topicsTable, eq(topicsTable.subjectId, subjectsTable.id))
      .leftJoin(
        studentTopicProgressTable,
        and(
          eq(studentTopicProgressTable.studentId, studentId),
          eq(studentTopicProgressTable.topicId, topicsTable.id)
        )
      )
      .orderBy(subjectsTable.name, topicsTable.orderIndex);
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
        level: string | null;
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
            level: r.subjectLevel
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
  } catch (err) {
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
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    const existing = await db
      .select()
      .from(paperTypesTable)
      .where(eq(paperTypesTable.name, String(name).trim()))
      .limit(1);
    if (existing.length) {
      return res.status(409).json({ error: 'Type already exists', data: existing[0] });
    }
    const created = await db
      .insert(paperTypesTable)
      .values({ name: String(name).trim() })
      .returning();
    res.status(201).json(created[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/paper-types/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const used = await db
      .select()
      .from(studentPapersTable)
      .where(eq(studentPapersTable.typeId, id))
      .limit(1);
    if (used.length) {
      return res.status(409).json({ error: 'Type is in use' });
    }
    await db.delete(paperTypesTable).where(eq(paperTypesTable.id, id));
    res.json({ message: 'Deleted' });
  } catch (err) {
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
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    const existing = await db
      .select()
      .from(paperSchoolsTable)
      .where(eq(paperSchoolsTable.name, String(name).trim()))
      .limit(1);
    if (existing.length) {
      return res.status(409).json({ error: 'School already exists', data: existing[0] });
    }
    const created = await db
      .insert(paperSchoolsTable)
      .values({ name: String(name).trim() })
      .returning();
    res.status(201).json(created[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/paper-schools/:id', authenticate, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const used = await db
      .select()
      .from(studentPapersTable)
      .where(eq(studentPapersTable.schoolId, id))
      .limit(1);
    if (used.length) {
      return res.status(409).json({ error: 'School is in use' });
    }
    await db.delete(paperSchoolsTable).where(eq(paperSchoolsTable.id, id));
    res.json({ message: 'Deleted' });
  } catch (err) {
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
      subjectName: r.subjectName || undefined,
      typeName: r.typeName || undefined,
      schoolName: r.schoolName || undefined,
      description: r.description || undefined,
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
  const { date, papers, expectedUpdatedAt } = req.body || {};
  if (!date || !Array.isArray(papers)) {
    return res.status(400).json({ error: 'Missing date or papers' });
  }
  try {
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
        return res.status(409).json({
          error: 'CONFLICT',
          updatedAt: latest[0].updatedAt,
          updatedByName: latest[0].updatedByName,
        });
      }
    }
    await db
      .delete(studentPapersTable)
      .where(and(eq(studentPapersTable.studentId, studentId), eq(studentPapersTable.date, date)));

    if (papers.length === 0) {
      return res.json({ message: 'No papers to save' });
    }

    const now = new Date();
    const values = papers.map((p: any) => ({
      studentId,
      subjectId: p.subjectId || null,
      subjectName: p.subjectName || null,
      typeId: p.typeId,
      schoolId: p.schoolId,
      description: p.description || null,
      date,
      score: parseOptionalInt(p.score),
      total: parseOptionalInt(p.total),
      updatedAt: now,
      updatedByName: req.user?.name || null,
    }));
    const inserted = await db.insert(studentPapersTable).values(values).returning();
    res.json({ message: 'Saved', count: inserted.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Create single paper
app.post('/api/students/:studentId/papers', authenticate, requireTeacher, async (req, res) => {
  const { studentId } = req.params;
  const { subjectId, subjectName, typeId, schoolId, description, date, score, total } = req.body || {};
  if (!typeId || !schoolId || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const created = await db
      .insert(studentPapersTable)
      .values({
        studentId,
        subjectId: subjectId || null,
        subjectName: subjectName || null,
        typeId,
        schoolId,
        description: description || null,
        date,
        score: parseOptionalInt(score),
        total: parseOptionalInt(total),
        updatedAt: new Date(),
        updatedByName: req.user?.name || null,
      })
      .returning();
    res.status(201).json(created[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Update single paper
app.put('/api/students/:studentId/papers/:paperId', authenticate, requireTeacher, async (req, res) => {
  const { studentId, paperId } = req.params;
  const { subjectId, subjectName, typeId, schoolId, description, date, score, total, updatedAt } = req.body || {};
  if (!typeId || !schoolId || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const clientUpdatedAt = parseTimestamp(updatedAt);
  if (!clientUpdatedAt) {
    return res.status(400).json({ error: 'Missing updatedAt' });
  }
  try {
    const existing = await db
      .select()
      .from(studentPapersTable)
      .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
      .limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    const updated = await db
      .update(studentPapersTable)
      .set({
        subjectId: subjectId || null,
        subjectName: subjectName || null,
        typeId,
        schoolId,
        description: description || null,
        date,
        score: parseOptionalInt(score),
        total: parseOptionalInt(total),
        updatedAt: new Date(),
        updatedByName: req.user?.name || null,
      })
      .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
      .returning();
    if (!updated.length) return res.status(404).json({ error: 'Not found' });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete single paper
app.delete('/api/students/:studentId/papers/:paperId', authenticate, requireTeacher, async (req, res) => {
  const { studentId, paperId } = req.params;
  try {
    const clientUpdatedAt = parseTimestamp((req.query as any).updatedAt || req.body?.updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    const existing = await db
      .select()
      .from(studentPapersTable)
      .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)))
      .limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    await db
      .delete(studentPapersTable)
      .where(and(eq(studentPapersTable.id, paperId), eq(studentPapersTable.studentId, studentId)));
    res.json({ message: 'Deleted' });
  } catch (err) {
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
app.get('/api/progress', authenticate, requireTeacher, async (_, res) => {
  try {
    console.log('Fetching all daily progress...');
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
  } catch (err) {
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
  const parsed = StudentWeeklyTaskTargetsSchema.safeParse({ ...req.body, studentId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  try {
    // Confirm the cycle exists (we never auto-create cycles from the targets
    // endpoint to keep cycle creation an explicit teacher action).
    const cycleRow = await db
      .select({ id: weeklyStudyCyclesTable.id })
      .from(weeklyStudyCyclesTable)
      .where(eq(weeklyStudyCyclesTable.id, data.cycleId))
      .limit(1);
    if (!cycleRow.length) {
      return res.status(404).json({ error: 'Cycle not found; create it first via POST /api/weekly-cycles' });
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
      return res.json(row);
    }
    const [row] = await db
      .insert(studentWeeklyTaskTargetsTable)
      .values(values)
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error('Error upserting weekly targets:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Friday "本周英文任务未完成学生" card. Computes per-student English completion
// across the cycle covering `date` (default: today CST) and returns any whose
// required tasks aren't all met. Heavy: O(students) progress reads — fine for
// classroom-sized rosters; revisit if rosters grow into the thousands.
app.get('/api/weekly-tasks/incomplete', authenticate, requireTeacher, async (req, res) => {
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

// Return empty array for now until tables are created
app.get('/api/feedback', async (_, res) => {
  res.json([]);
});

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

    // Check if progress already exists for this student and date
    const existingProgress = await db
      .select()
      .from(dailyProgress)
      .where(and(eq(dailyProgress.studentId, studentId), eq(dailyProgress.date, date)))
      .limit(1);
    
    if (existingProgress.length > 0) {
      return res.status(409).json({ error: 'Progress already exists for this student and date' });
    }
    
    // Insert new progress (normalize English V2 on the way in so that even
    // legacy clients posting string-only `english` blocks land in V2 shape).
    // Loss-point validation runs first so we reject unscored entries with
    // missing loss points before we touch the DB.
    const lossPointValidation = validateLossPointsRequired(activities);
    if (!lossPointValidation.ok) {
      return res.status(400).json({
        error: 'LOSS_POINTS_REQUIRED',
        details: lossPointValidation.errors,
      });
    }
    const lossPointLookup = await loadLossPointLookup();
    const enrichedActivities = enrichLossPointLabels(activities, lossPointLookup);
    const normalizedActivities = normalizeActivities(enrichedActivities);
    // Part 9: post-normalize structural sanity check — catches normalize
    // regressions before they hit the DB.
    const englishStructural = validateNormalizedEnglish(normalizedActivities);
    if (!englishStructural.ok) {
      return res.status(400).json({
        error: 'INVALID_ENGLISH_STRUCTURE',
        details: englishStructural.errors,
      });
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
  } catch (err) {
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

    // Prevent duplicates on update
    const dup = await db
      .select()
      .from(dailyProgress)
      .where(and(eq(dailyProgress.studentId, studentId), eq(dailyProgress.date, date)))
      .limit(1);
    if (dup.length > 0 && dup[0].id !== id) {
      return res.status(409).json({ error: 'Progress already exists for this student and date' });
    }

    const existing = await db.select().from(dailyProgress).where(eq(dailyProgress.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Progress not found' });
    const clientUpdatedAt = parseTimestamp(updatedAt);
    if (!clientUpdatedAt) {
      return res.status(400).json({ error: 'Missing updatedAt' });
    }
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }

    // Same loss-point validation + label-snapshot enrichment as POST so an
    // edit that introduces (or removes) a score is held to the same contract.
    const lossPointValidation = validateLossPointsRequired(activities);
    if (!lossPointValidation.ok) {
      return res.status(400).json({
        error: 'LOSS_POINTS_REQUIRED',
        details: lossPointValidation.errors,
      });
    }
    const lossPointLookup = await loadLossPointLookup();
    const enrichedActivities = enrichLossPointLabels(activities, lossPointLookup);
    const normalizedActivitiesPut = normalizeActivities(enrichedActivities);
    // Part 9: post-normalize structural sanity check (same as POST).
    const englishStructuralPut = validateNormalizedEnglish(normalizedActivitiesPut);
    if (!englishStructuralPut.ok) {
      return res.status(400).json({
        error: 'INVALID_ENGLISH_STRUCTURE',
        details: englishStructuralPut.errors,
      });
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
  } catch (err) {
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
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    const result = await db.delete(dailyProgress).where(eq(dailyProgress.id, id)).returning();
    res.json({ message: 'Progress deleted successfully' });
  } catch (err) {
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

app.get('/api/feedback', authenticate, requireTeacher, async (_, res) => {
  try {
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
    const result = await db.insert(weeklyFeedback).values(data).returning();
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, parsedData.studentId));
    const student = studentRows[0];
    if (student) {
      await notifyParent({
        studentId: parsedData.studentId,
        parentId: student.parentId ?? null,
        templateId: weeklyTemplateId,
        page: `/pages/student-detail/index?id=${parsedData.studentId}`,
        data: {
          thing1: { value: `每周反馈已发布` },
          time2: { value: format(parsedData.weekStarting, 'yyyy-MM-dd') },
        },
      });
    }
    res.status(201).json(result[0]);
  } catch (err) {
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
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
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
    const dup = await db
      .select()
      .from(weeklyFeedback)
      .where(and(eq(weeklyFeedback.studentId, parsedData.studentId), eq(weeklyFeedback.weekStarting, data.weekStarting)))
      .limit(1);
    if (dup.length > 0 && dup[0].id !== req.params.id) {
      return res.status(409).json({ error: 'Weekly feedback already exists for this student and week' });
    }
    const result = await db.update(weeklyFeedback)
      .set(data)
      .where(eq(weeklyFeedback.id, req.params.id))
      .returning();

    if (!result.length) return res.status(404).json({ error: 'Not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ====== AI SUMMARY ROUTES ======
app.post('/api/ai/weekly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId, weekStarting, weekEnding } = req.body || {};
  if (!studentId || !weekStarting || !weekEnding) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const contextWeekEnding = addDaysToDate(String(weekStarting), 6);
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
    const progress = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentId),
          gte(dailyProgress.date, weekStarting),
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
        score: studentPapersTable.score,
        total: studentPapersTable.total,
      })
      .from(studentPapersTable)
      .leftJoin(paperTypesTable, eq(studentPapersTable.typeId, paperTypesTable.id))
      .leftJoin(paperSchoolsTable, eq(studentPapersTable.schoolId, paperSchoolsTable.id))
      .where(
        and(
          eq(studentPapersTable.studentId, studentId),
          gte(studentPapersTable.date, weekStarting),
          lte(studentPapersTable.date, contextWeekEnding)
        )
      )
      .orderBy(studentPapersTable.date);
    const subjectProgress = await getSubjectProgressSummary(studentId);

    // Part 5: enrich the AI context so the model can reference concrete
    // numbers and loss-points instead of guessing.
    const v2Progress = progress.map(withV2Activities);
    const lossPointLookup = await loadLossPointLookup();
    const englishStats = aggregateEnglishStats(v2Progress);
    const lossPointBreakdown = aggregateLossPoints(v2Progress, lossPointLookup);
    const attendanceRollup = aggregateAttendance(v2Progress);
    const context = {
      student,
      weekStarting,
      weekEnding: contextWeekEnding,
      recordWeekEnding: weekEnding,
      attendance: attendanceRollup,
      englishStats,
      lossPoints: lossPointBreakdown,
      dailyProgress: v2Progress,
      papers,
      subjectProgress,
    };
    // Operator-supplied prompt wins; otherwise use the Part 5 enhanced prompt.
    const promptToUse = weeklySummaryPrompt && weeklySummaryPrompt.trim()
      ? weeklySummaryPrompt
      : ENHANCED_WEEKLY_PROMPT;
    const raw = await callDeepSeek(promptToUse, context);
    const structured = parseStructuredSummary(raw);
    res.json(structured);
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes('AI_NOT_CONFIGURED')) {
      return res.status(400).json({ error: 'AI_NOT_CONFIGURED' });
    }
    console.error('AI weekly summary error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.post('/api/ai/quarterly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId, startDate, endDate } = req.body || {};
  if (!studentId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
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
    const context = {
      student,
      startDate,
      endDate,
      dailyProgress: daily.map(withV2Activities),
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      previousQuarterSummary: prevQuarter[0] || null,
    };
    const summary = await callDeepSeek(quarterlySummaryPrompt, context);
    res.json({ summary });
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes('AI_NOT_CONFIGURED')) {
      return res.status(400).json({ error: 'AI_NOT_CONFIGURED' });
    }
    console.error('AI quarterly summary error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.post('/api/ai/yearly-summary', authenticate, requireTeacher, async (req, res) => {
  const { studentId, year } = req.body || {};
  const yearNum = Number(year);
  if (!studentId || !Number.isFinite(yearNum)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const startDate = `${yearNum}-01-01`;
  const endDate = `${yearNum}-12-31`;
  try {
    const studentRows = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    const student = studentRows[0];
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
      .where(and(eq(quarterlySummaryTable.studentId, studentId), eq(quarterlySummaryTable.year, yearNum)))
      .orderBy(quarterlySummaryTable.quarter);
    const context = {
      student,
      year: yearNum,
      startDate,
      endDate,
      dailyProgress: daily.map(withV2Activities),
      weeklyReports: weekly,
      papers,
      exams: examPayload,
      quarterlySummaries: quarters,
    };
    const summary = await callDeepSeek(yearlySummaryPrompt, context);
    res.json({ summary });
  } catch (err) {
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
    if (!isSameTimestamp(existing[0].updatedAt, clientUpdatedAt)) {
      return res.status(409).json({
        error: 'CONFLICT',
        updatedAt: existing[0].updatedAt,
        updatedByName: existing[0].updatedByName,
      });
    }
    const result = await db.delete(weeklyFeedback).where(eq(weeklyFeedback.id, req.params.id)).returning();
    res.json({ success: true });
  } catch (err) {
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
