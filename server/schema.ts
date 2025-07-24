import { z } from 'zod';
import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, date } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';

// Zod Schemas (updated for UUIDs)
export const UserSchema = z.object({
  id: z.string().uuid().optional(), // Optional for creation
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'teacher', 'parent'])
});

export const TeacherSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100)
});

export const ParentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  email: z.string().email().max(100)
});

export const StudentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  grade: z.string().max(20),
  parentId: z.string().uuid() // Changed from number
});

export const DailyProgressSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(), // Changed from number
  date: z.date(),
  activities: z.record(z.string()),
  mood: z.string().max(20),
  notes: z.string().optional()
});

export const WeeklyFeedbackSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(), // Changed from number
  weekEnding: z.date(),
  academicProgress: z.string(),
  behavior: z.string(),
  recommendations: z.string().optional()
});

// Drizzle Tables with UUIDs
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4), // Auto-generates UUID
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  password: varchar('password', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const teacher = pgTable('teacher', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const parentsTable = pgTable('parents', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const studentsTable = pgTable('students', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4),
  name: varchar('name', { length: 100 }).notNull(),
  grade: varchar('grade', { length: 20 }).notNull(),
  parentId: uuid('parent_id').references(() => parentsTable.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dailyProgress = pgTable('daily_progress', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  date: date('date').notNull(),
  activities: jsonb('activities').$type<Record<string, string>>().notNull(),
  mood: varchar('mood', { length: 20 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const weeklyFeedback = pgTable('weekly_feedback', {
  id: uuid('id').primaryKey().$defaultFn(uuidv4),
  studentId: uuid('student_id').references(() => studentsTable.id).notNull(),
  weekEnding: date('week_ending').notNull(),
  academicProgress: text('academic_progress').notNull(),
  behavior: text('behavior').notNull(),
  recommendations: text('recommendations'),
  createdAt: timestamp('created_at').defaultNow(),
});

// TypeScript Types (automatically includes UUID strings)
export type User = z.infer<typeof UserSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type Parent = z.infer<typeof ParentSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type DailyProgress = z.infer<typeof DailyProgressSchema>;
export type WeeklyFeedback = z.infer<typeof WeeklyFeedbackSchema>;
