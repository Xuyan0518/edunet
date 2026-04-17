import { z } from 'zod';
import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, date, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
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

export const DailyProgressSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(), // Changed from number
  date: z.date(),
  attendance: z.enum(["present", "absent", "late"]),
  attendanceStart: z.string().optional(),
  attendanceEnd: z.string().optional(),
  summary: z.string().optional(),
  activities: z.array(
    z.object({
      subject: z.string(),
      description: z.string(),
      performance: z.string(),
      notes: z.string().optional()
    })
  ),
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

export const ExamSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  name: z.string().min(1).max(50),
});

export const ExamScoreSchema = z.object({
  id: z.string().uuid().optional(),
  examId: z.string().uuid(),
  name: z.string().min(1).max(50),
  score: z.string().min(1).max(20),
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
  activities: jsonb('activities').$type<
    {
      subject: string;
      description: string;
      performance: string;
      notes?: string;
    }[]
  >().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
}, (table) => ({
  studentDateUnique: uniqueIndex('daily_progress_student_date_idx').on(table.studentId, table.date),
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
}, (table) => ({
  uqStudentWeek: uniqueIndex('uq_weekly_feedback_student_week').on(table.studentId, table.weekStarting),
}));

export const examsTable = pgTable('exams', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  examDate: date('exam_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
});

export const examScoresTable = pgTable('exam_scores', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  examId: uuid('exam_id').references(() => examsTable.id).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  score: varchar('score', { length: 20 }).notNull(),
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
}, (table) => ({
  uqStudentYearQuarter: uniqueIndex('uq_quarterly_summary_student_year_quarter').on(table.studentId, table.year, table.quarter),
}));

export const yearlySummaryTable = pgTable('yearly_summary', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  year: integer('year').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
}, (table) => ({
  uqStudentYear: uniqueIndex('uq_yearly_summary_student_year').on(table.studentId, table.year),
}));

// ====== New tables for subjects and topics ======
// Subjects (e.g. "Secondary 3/4 Pure Physics")
export const subjectsTable = pgTable('subjects', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  level: varchar('level', { length: 64 }).notNull(),
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
  date: date('date').notNull(),
  score: integer('score'),
  total: integer('total'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByName: varchar('updated_by_name', { length: 100 }),
});

// TypeScript Types (automatically includes UUID strings)
export type User = z.infer<typeof UserSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type Parent = z.infer<typeof ParentSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type DailyProgress = z.infer<typeof DailyProgressSchema>;
export type WeeklyFeedback = z.infer<typeof WeeklyFeedbackSchema>;
