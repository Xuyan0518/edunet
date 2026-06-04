import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, date, uniqueIndex, boolean, index } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';
// Fix uuid import for ESM compatibility
import { randomUUID } from 'node:crypto';
import { unique } from 'drizzle-orm/gel-core';

// Zod Schemas (updated for UUIDs)
export const UserSchema = z.object({
  id: z.string().uuid().optional(), // Optional for creation
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'teacher', 'parent'])
});

export const AdminSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional().nullable(),
  password: z.string().min(6).max(100).optional().nullable(),
  wechatOpenId: z.string().optional(),
  wechatUnionId: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  authProvider: z.enum(['wechat']).optional().default('wechat'),
});

export const TeacherSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional().nullable(),
  password: z.string().min(6).max(100).optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  emailVerified: z.string().optional().default('false'),
  verificationToken: z.string().optional(),
  verificationTokenExpires: z.date().optional(),
  wechatOpenId: z.string().optional(),
  wechatUnionId: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  authProvider: z.enum(['wechat']).optional().default('wechat'),
});

export const ParentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional().nullable(),
  password: z.string().min(6).max(100).optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  emailVerified: z.string().optional().default('false'),
  verificationToken: z.string().optional(),
  verificationTokenExpires: z.date().optional(),
  wechatOpenId: z.string().optional(),
  wechatUnionId: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  authProvider: z.enum(['wechat']).optional().default('wechat'),
});

export const StudentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  grade: z.string().max(20),
  parentId: z.string().uuid().nullable().optional(),
});

// Loss-point references stored on each scored English sub-field.
// (Catalog tables are introduced in Part 4; this shape only describes what
// the V2 English fields persist on a daily record.)
export const LossPointRefsSchema = z.object({
  lossPointIds: z.array(z.string()).default([]),
  lossPointLabelsSnapshot: z.array(z.string()).default([]),
  otherLossPointText: z.string().default(''),
});

// V2 English sub-field schemas. All scored fields share the same loss-point
// shape; counts vary by field semantically (articleCount/exerciseCount/etc.).
export const EnglishEditingV2Schema = LossPointRefsSchema.extend({
  text: z.string().default(''),
  score: z.number().nullable().default(null),
  totalScore: z.number().nullable().default(10),
  exerciseCount: z.number().int().nonnegative().default(0),
});

export const EnglishReadingV2Schema = LossPointRefsSchema.extend({
  text: z.string().default(''),
  score: z.number().nullable().default(null),
  totalScore: z.number().nullable().default(10),
  articleCount: z.number().int().nonnegative().default(0),
});

export const EnglishGrammarV2Schema = LossPointRefsSchema.extend({
  text: z.string().default(''),
  score: z.number().nullable().default(null),
  totalScore: z.number().nullable().default(10),
  exerciseCount: z.number().int().nonnegative().default(0),
});

export const EnglishVocabV2Schema = z.object({
  text: z.string().default(''),
  vocabularySentenceCount: z.number().int().nonnegative().default(0),
});

export const EnglishRecitationV2Schema = z.object({
  text: z.string().default(''),
});

export const EnglishEssayV2Schema = LossPointRefsSchema.extend({
  text: z.string().default(''),
  title: z.string().default(''),
  completed: z.boolean().default(false),
  score: z.number().nullable().default(null),
  totalScore: z.number().nullable().default(null),
});

export const EnglishFieldsV2Schema = z.object({
  editing: EnglishEditingV2Schema,
  reading: EnglishReadingV2Schema,
  grammar: EnglishGrammarV2Schema,
  vocab: EnglishVocabV2Schema,
  recitation: EnglishRecitationV2Schema,
  essay: EnglishEssayV2Schema,
});

// Activity payload is intentionally permissive: legacy clients still send
// strings inside `english` and bare {subject, description, performance, notes}
// objects. Normalization happens server-side via normalizeActivities() before
// persist and on read. We keep validation loose here to avoid rejecting valid
// historical data on read.
export const DailyProgressActivitySchema = z
  .object({
    // Legacy keys
    subject: z.string().optional(),
    description: z.string().optional(),
    performance: z.string().optional(),
    notes: z.string().optional(),
    // Miniprogram keys
    subjectId: z.string().optional(),
    subjectName: z.string().optional(),
    subjectDisplayName: z.string().optional(),
    type: z.string().optional(),
    practiceProgress: z.string().optional(),
    definitionRecitation: z.string().optional(),
    comment: z.string().optional(),
    papers: z.array(z.unknown()).optional(),
    locked: z.boolean().optional(),
    // English block: legacy strings or V2 objects, both accepted on input.
    english: z.unknown().optional(),
  })
  .passthrough();

export const DailyProgressSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(), // Changed from number
  date: z.date(),
  attendance: z.enum(["present", "absent", "late"]),
  attendanceStart: z.string().optional(),
  attendanceEnd: z.string().optional(),
  summary: z.string().optional(),
  activities: z.array(DailyProgressActivitySchema),
});

// Wire-format request body for POST/PUT /api/progress (Part 9). Differs from
// DailyProgressSchema in that `date` is the YYYY-MM-DD string the client
// actually sends rather than a JS Date, and attendance times are HH:mm
// strings. updatedAt is required for PUT only — endpoint validates that
// separately.
export const DailyProgressRequestSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a UUID' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' }),
  attendance: z.enum(['present', 'absent', 'late']),
  attendanceStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  attendanceEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  summary: z.string().nullable().optional(),
  activities: z.array(DailyProgressActivitySchema).min(1, 'At least one activity is required'),
});

export const WeeklyFeedbackSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(), 
  weekStarting: z.date(),
  weekEnding: z.date(),
  summary: z.string(),
  strengths: z.array(z.string()),
  areasToImprove: z.array(z.string()),
  teacherNotes: z.string().optional(),
  nextWeekFocus: z.string().optional()
});

// Exam types for the assessment cycle. Stored as a free-form varchar in DB so
// we can accept legacy/null values, but new writes are validated against this
// enum at the API boundary.
export const EXAM_TYPES = ['WA1', 'WA2', 'WA3', 'FINALS'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const ExamSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  name: z.string().min(1).max(50),
  examType: z.enum(EXAM_TYPES).nullable().optional(),
  reminderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const ExamScoreSchema = z.object({
  id: z.string().uuid().optional(),
  examId: z.string().uuid(),
  name: z.string().min(1).max(50),
  // Score becomes optional so an exam can be SCHEDULED before it is taken;
  // POST/PUT semantics: empty score → scheduled, non-empty → recorded result.
  score: z.string().max(20).optional().default(''),
  scope: z.string().nullable().optional(),
});

export const QuarterlySummarySchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
  summary: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const YearlySummarySchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  year: z.number().int(),
  summary: z.string(),
});

export const STUDENT_REPORT_TYPES = ['quarterly', 'yearly'] as const;
export type StudentReportType = (typeof STUDENT_REPORT_TYPES)[number];

export const STUDENT_REPORT_STATUS = ['draft', 'final'] as const;
export type StudentReportStatus = (typeof STUDENT_REPORT_STATUS)[number];

export const StudentReportSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  reportType: z.enum(STUDENT_REPORT_TYPES),
  title: z.string().max(200).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  year: z.number().int().optional().nullable(),
  summaryText: z.string(),
  analyticsJson: z.unknown().optional().nullable(),
  structuredReportJson: z.unknown().optional().nullable(),
  finalReportJson: z.unknown().optional().nullable(),
  rawAiResponse: z.string().optional().nullable(),
  parseError: z.string().optional().nullable(),
  status: z.enum(STUDENT_REPORT_STATUS).optional().default('draft'),
  visibleToParent: z.boolean().optional().default(false),
});

export const ActionLockSchema = z.object({
  id: z.string().uuid().optional(),
  lockKey: z.string().min(1).max(255),
  actionType: z.string().min(1).max(100),
  actorUserId: z.string().min(1).max(64),
  actorName: z.string().max(100).optional().nullable(),
  metadataJson: z.unknown().optional().nullable(),
  acquiredAt: z.date().optional(),
  expiresAt: z.date(),
});

// ====== New enums and types for subjects and topics ======
// Status of a student's progress on a topic
export const TOPIC_STATUS = ['not_started', 'in_progress', 'completed'] as const;
export type TopicStatus = typeof TOPIC_STATUS[number];

// Zod Schemas for new entities
export const SubjectSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().max(64),
  name: z.string().max(200),
  level: z.string().max(64),
  chineseName: z.string().max(120).optional().nullable(),
  englishName: z.string().max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  isRequired: z.boolean().optional().default(false),
  levelId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const SubjectLevelSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(64),
  description: z.string().max(240).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const StudentEnglishTaskConfigSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  tasksJson: z.unknown(),
  createdBy: z.string().max(64).optional().nullable(),
  updatedBy: z.string().max(64).optional().nullable(),
});

export const TopicSchema = z.object({
  id: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  code: z.string().max(64),
  title: z.string().max(256),
  parentTopicId: z.string().uuid().nullable(),
  orderIndex: z.string().max(32),
});

export const StudentSubjectSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
});

export const StudentTopicProgressSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  topicId: z.string().uuid(),
  status: z.enum(TOPIC_STATUS),
  definitionRecited: z.boolean().optional().default(false),
  chapterExerciseCompleted: z.boolean().optional().default(false),
  updatedAt: z.date().optional(),
});

// Drizzle Tables with UUIDs


export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()), // Auto-generates UUID
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  password: varchar('password', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adminsTable = pgTable('admins', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  email: varchar('email', { length: 100 }).unique(),
  password: varchar('password', { length: 100 }),
  wechatOpenId: varchar('wechat_open_id', { length: 64 }).unique(),
  wechatUnionId: varchar('wechat_union_id', { length: 64 }).unique(),
  avatarUrl: text('avatar_url'),
  authProvider: varchar('auth_provider', { length: 20 }).default('wechat').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const teachersTable = pgTable('teacher', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  email: varchar('email', { length: 100 }).unique(),
  password: varchar('password', { length: 100 }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  emailVerified: varchar('email_verified', { length: 5 }).default('false').notNull(),
  verificationToken: varchar('verification_token', { length: 255 }),
  verificationTokenExpires: timestamp('verification_token_expires'),
  wechatOpenId: varchar('wechat_open_id', { length: 64 }).unique(),
  wechatUnionId: varchar('wechat_union_id', { length: 64 }).unique(),
  avatarUrl: text('avatar_url'),
  authProvider: varchar('auth_provider', { length: 20 }).default('wechat').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const parentsTable = pgTable('parents', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  email: varchar('email', { length: 100 }).unique(),
  password: varchar('password', { length: 100 }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  emailVerified: varchar('email_verified', { length: 5 }).default('false').notNull(),
  verificationToken: varchar('verification_token', { length: 255 }),
  verificationTokenExpires: timestamp('verification_token_expires'),
  wechatOpenId: varchar('wechat_open_id', { length: 64 }).unique(),
  wechatUnionId: varchar('wechat_union_id', { length: 64 }).unique(),
  avatarUrl: text('avatar_url'),
  authProvider: varchar('auth_provider', { length: 20 }).default('wechat').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const studentsTable = pgTable('students', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  grade: varchar('grade', { length: 20 }).notNull(),
  parentId: uuid('parent_id').references(() => parentsTable.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dailyProgress = pgTable('daily_progress', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  date: date('date').notNull(),
  attendance: varchar('attendance', { length: 10 }).notNull(),
  attendanceStart: varchar('attendance_start', { length: 5 }),
  attendanceEnd: varchar('attendance_end', { length: 5 }),
  summary: text('summary'),
  // Activities is intentionally typed loosely: legacy rows persist
  // {subject, description, performance, notes} and miniprogram rows persist
  // {subjectId, subjectName, type, english:{...}, comment, papers}, while V2
  // English fields are objects with text/score/counts/lossPointIds.
  // Always run rows through normalizeActivities() (server/utils/englishNormalize)
  // before exposing to consumers — types here are advisory only.
  activities: jsonb('activities').$type<Record<string, unknown>[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
}, (table) => ({
  studentDateUnique: uniqueIndex('daily_progress_student_date_idx')
    .on(table.studentId, table.date)
    .where(sql`${table.deletedAt} IS NULL`),
}));

export const weeklyFeedback = pgTable('weekly_feedback', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  weekStarting: date('week_starting').notNull(),
  weekEnding: date('week_ending').notNull(),
  summary: text('summary').notNull(),
  strengths: jsonb('strengths').$type<string[]>().notNull(),
  areasToImprove: jsonb('areas_to_improve').$type<string[]>().notNull(),
  teacherNotes: text('teacher_notes'),
  nextWeekFocus: text('next_week_focus'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
}, (table) => ({
  uqStudentWeek: uniqueIndex('uq_weekly_feedback_student_week')
    .on(table.studentId, table.weekStarting)
    .where(sql`${table.deletedAt} IS NULL`),
}));

export const examsTable = pgTable('exams', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  examDate: date('exam_date').notNull(),
  // Part 6: assessment cycle (WA1 / WA2 / WA3 / FINALS) and the date from which
  // the exam should appear on the upcoming-exams dashboard card. Null means
  // the operator has not categorised the exam yet — UI falls back to "其他".
  examType: varchar('exam_type', { length: 20 }),
  reminderDate: date('reminder_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
});

export const examScoresTable = pgTable('exam_scores', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  examId: uuid('exam_id').references(() => examsTable.id).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  // Score is now nullable: an exam can be SCHEDULED (no score yet) and later
  // EDITED to record the result. Existing rows keep their values; new
  // scheduled-only rows write empty string.
  score: varchar('score', { length: 20 }).notNull().default(''),
  // Per-subject scope text for the upcoming exam (e.g. "Chapters 5-8, focus
  // on quadratic equations"). Null on legacy rows.
  scope: text('scope'),
  // Per-subject exam date. Null falls back to the parent exam's exam_date.
  // Lets a single exam group (e.g. WA2) span multiple sittings.
  examDate: date('exam_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const quarterlySummaryTable = pgTable('quarterly_summary', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter').notNull(),
  summary: text('summary').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
}, (table) => ({
  uqStudentYearQuarter: uniqueIndex('uq_quarterly_summary_student_year_quarter')
    .on(table.studentId, table.year, table.quarter)
    .where(sql`${table.deletedAt} IS NULL`),
}));

export const yearlySummaryTable = pgTable('yearly_summary', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  year: integer('year').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
}, (table) => ({
  uqStudentYear: uniqueIndex('uq_yearly_summary_student_year')
    .on(table.studentId, table.year)
    .where(sql`${table.deletedAt} IS NULL`),
}));

export const studentReportsTable = pgTable('student_reports', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  reportType: varchar('report_type', { length: 20 }).notNull(),
  title: text('title'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  year: integer('year'),
  summaryText: text('summary_text').notNull(),
  analyticsJson: jsonb('analytics_json'),
  structuredReportJson: jsonb('structured_report_json'),
  finalReportJson: jsonb('final_report_json'),
  rawAiResponse: text('raw_ai_response'),
  parseError: text('parse_error'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  visibleToParent: boolean('visible_to_parent').notNull().default(false),
  createdBy: varchar('created_by', { length: 64 }),
  updatedBy: varchar('updated_by', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
}, (table) => ({
  idxStudentReportsStudent: index('idx_student_reports_student_created')
    .on(table.studentId, table.createdAt, table.id),
}));

export const actionLocksTable = pgTable('action_locks', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  lockKey: varchar('lock_key', { length: 255 }).notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  actorUserId: varchar('actor_user_id', { length: 64 }).notNull(),
  actorName: varchar('actor_name', { length: 100 }),
  metadataJson: jsonb('metadata_json'),
  acquiredAt: timestamp('acquired_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uqActionLockKey: uniqueIndex('uq_action_locks_lock_key').on(table.lockKey),
  idxActionLocksExpiresAt: index('idx_action_locks_expires_at').on(table.expiresAt),
  idxActionLocksActor: index('idx_action_locks_actor').on(table.actorUserId),
}));

// ====== New tables for subjects and topics ======
export const subjectLevelsTable = pgTable('subject_levels', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by', { length: 64 }),
  updatedBy: varchar('updated_by', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uqSubjectLevelsName: uniqueIndex('uq_subject_levels_name').on(table.name),
}));

// Subjects (e.g. "Secondary 3/4 Pure Physics")
export const subjectsTable = pgTable('subjects', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  chineseName: varchar('chinese_name', { length: 120 }),
  englishName: varchar('english_name', { length: 120 }),
  level: varchar('level', { length: 64 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(false),
  levelId: uuid('level_id').references(() => subjectLevelsTable.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Topics (supports hierarchy via parentTopicId; null = main topic)
export const topicsTable = pgTable('topics', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  subjectId: uuid('subject_id').references(() => subjectsTable.id).notNull(),
  code: varchar('code', { length: 64 }).notNull(),
  title: text('title').notNull(),
  parentTopicId: uuid('parent_topic_id'),
  orderIndex: varchar('order_index', { length: 32 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uqTopicSubjectCode: uniqueIndex('uq_topic_subject_code').on(table.subjectId, table.code),
}));

// Junction: which subjects a student takes
export const studentSubjectsTable = pgTable('student_subjects', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  subjectId: uuid('subject_id').references(() => subjectsTable.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uqStudentSubject: uniqueIndex('uq_student_subject').on(table.studentId, table.subjectId),
}));

// Per-student topic status
export const studentTopicProgressTable = pgTable('student_topic_progress', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  topicId: uuid('topic_id').references(() => topicsTable.id).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  definitionRecited: boolean('definition_recited').notNull().default(false),
  chapterExerciseCompleted: boolean('chapter_exercise_completed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uqStudentTopic: uniqueIndex('uq_student_topic').on(table.studentId, table.topicId),
}));

// ====== Practice papers ======
export const paperTypesTable = pgTable('paper_types', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 120 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const paperSchoolsTable = pgTable('paper_schools', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 120 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const studentPapersTable = pgTable('student_papers', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  subjectId: uuid('subject_id').references(() => subjectsTable.id),
  subjectName: text('subject_name'),
  typeId: uuid('type_id').references(() => paperTypesTable.id).notNull(),
  schoolId: uuid('school_id').references(() => paperSchoolsTable.id).notNull(),
  description: text('description'),
  strengths: text('strengths'),
  improvements: text('improvements'),
  date: date('date').notNull(),
  score: integer('score'),
  total: integer('total'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 64 }),
  deletedByName: varchar('deleted_by_name', { length: 100 }),
});

export const studentEnglishTaskConfigsTable = pgTable('student_english_task_configs', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  tasksJson: jsonb('tasks_json').$type<Record<string, unknown>[]>().notNull().default([]),
  createdBy: varchar('created_by', { length: 64 }),
  updatedBy: varchar('updated_by', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uqStudentEnglishTaskConfigStudent: uniqueIndex('uq_student_english_task_config_student').on(table.studentId),
}));

// ====== Weekly study cycles & per-student weekly task targets (Part 3) ======
// Cycles default to Sunday → Thursday but are stored explicitly so teachers
// can shift weeks for holidays / makeups. When no row covers a given date,
// the server synthesises a Sun→Thu fallback (see server/utils/weeklyCycles.ts).
export const weeklyStudyCyclesTable = pgTable('weekly_study_cycles', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
}, (table) => ({
  uqCycleStartEnd: uniqueIndex('uq_weekly_cycle_start_end').on(table.startDate, table.endDate),
}));

// Per (student, cycle) target overrides. Missing row → use hardcoded defaults
// (5 reading / 5 editing / 5 grammar / 50 vocab / 1 composition; both required).
export const studentWeeklyTaskTargetsTable = pgTable('student_weekly_task_targets', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  cycleId: uuid('cycle_id').references(() => weeklyStudyCyclesTable.id).notNull(),
  readingTarget: integer('reading_target').notNull().default(5),
  editingTarget: integer('editing_target').notNull().default(5),
  grammarTarget: integer('grammar_target').notNull().default(5),
  vocabTarget: integer('vocab_target').notNull().default(50),
  compositionTarget: integer('composition_target').notNull().default(1),
  isGrammarRequired: boolean('is_grammar_required').notNull().default(true),
  isEditingRequired: boolean('is_editing_required').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
}, (table) => ({
  uqStudentCycle: uniqueIndex('uq_student_weekly_targets').on(table.studentId, table.cycleId),
}));

export const WeeklyStudyCycleSchema = z.object({
  id: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

export const StudentWeeklyTaskTargetsSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  cycleId: z.string().uuid(),
  readingTarget: z.number().int().nonnegative().default(5),
  editingTarget: z.number().int().nonnegative().default(5),
  grammarTarget: z.number().int().nonnegative().default(5),
  vocabTarget: z.number().int().nonnegative().default(50),
  compositionTarget: z.number().int().nonnegative().default(1),
  isGrammarRequired: z.boolean().default(true),
  isEditingRequired: z.boolean().default(true),
});

// ====== Academic terms (Part 8) ======
// Term config for the academic year. termType is one of EXAM_TYPES (WA1/WA2/
// WA3/FINALS) — the term leading up to that assessment. Teachers configure
// per academic year. Used by the Part 7 term-analytics endpoint to default
// the date window when caller omits startDate/endDate.
export const academicTermsTable = pgTable('academic_terms', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  year: integer('year').notNull(),
  termType: varchar('term_type', { length: 20 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
}, (table) => ({
  uqYearTerm: uniqueIndex('uq_academic_terms_year_term').on(table.year, table.termType),
}));

export const AcademicTermSchema = z.object({
  id: z.string().uuid().optional(),
  year: z.number().int().min(2000).max(3000),
  termType: z.enum(['WA1', 'WA2', 'WA3', 'FINALS']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable().optional(),
});

// ====== Loss-point catalog (Part 4) ======
// Categories scope loss points to a particular English sub-skill (editing /
// reading / grammar / essay). Teachers select from the catalog when entering
// scores; teachers cannot create new loss points (per spec).
export const lossPointCategoriesTable = pgTable('loss_point_categories', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const lossPointsTable = pgTable('loss_points', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  categoryId: uuid('category_id').references(() => lossPointCategoriesTable.id).notNull(),
  code: varchar('code', { length: 64 }).notNull(),
  label: varchar('label', { length: 200 }).notNull(),
  description: text('description'),
  orderIndex: integer('order_index').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uqCategoryCode: uniqueIndex('uq_loss_point_category_code').on(table.categoryId, table.code),
}));

export const LossPointCategorySchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().max(64),
  name: z.string().max(120),
  orderIndex: z.number().int().nonnegative().default(0),
});

export const LossPointSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  code: z.string().max(64),
  label: z.string().max(200),
  description: z.string().nullable().optional(),
  orderIndex: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

// TypeScript Types (automatically includes UUID strings)
export type User = z.infer<typeof UserSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type Parent = z.infer<typeof ParentSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type DailyProgress = z.infer<typeof DailyProgressSchema>;
export type WeeklyFeedback = z.infer<typeof WeeklyFeedbackSchema>;
