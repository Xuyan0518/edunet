import { z } from 'zod';
import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, date, uniqueIndex } from 'drizzle-orm/pg-core';
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
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
});

export const TeacherSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  emailVerified: z.string().optional().default('false'),
  verificationToken: z.string().optional(),
  verificationTokenExpires: z.date().optional()
});

export const ParentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  emailVerified: z.string().optional().default('false'),
  verificationToken: z.string().optional(),
  verificationTokenExpires: z.date().optional()
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
  email: varchar('email', { length: 100 }).unique().notNull(),
  password: varchar('password', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const teachersTable = pgTable('teacher', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  password: varchar('password', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  emailVerified: varchar('email_verified', { length: 5 }).default('false').notNull(),
  verificationToken: varchar('verification_token', { length: 255 }),
  verificationTokenExpires: timestamp('verification_token_expires'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const parentsTable = pgTable('parents', {
  id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  password: varchar('password', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  emailVerified: varchar('email_verified', { length: 5 }).default('false').notNull(),
  verificationToken: varchar('verification_token', { length: 255 }),
  verificationTokenExpires: timestamp('verification_token_expires'),
  createdAt: timestamp('created_at').defaultNow(),
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
  activities: jsonb('activities').$type<
    {
      subject: string;
      description: string;
      performance: string;
      notes?: string;
    }[]
  >().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
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
}, (table) => ({
  uqStudentWeek: uniqueIndex('uq_weekly_feedback_student_week').on(table.studentId, table.weekStarting),
}));

// TypeScript Types (automatically includes UUID strings)
export type User = z.infer<typeof UserSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type Parent = z.infer<typeof ParentSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type DailyProgress = z.infer<typeof DailyProgressSchema>;
export type WeeklyFeedback = z.infer<typeof WeeklyFeedbackSchema>;