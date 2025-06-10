import { pgTable, serial, varchar, integer, timestamp, jsonb, text, date } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  password: varchar('password', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const studentsTable = pgTable('students', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  grade: varchar('grade', { length: 20 }).notNull(),
  parentId: integer('parent_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dailyProgress = pgTable('daily_progress', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => studentsTable.id).notNull(),
  date: date('date').notNull(),
  activities: jsonb('activities').notNull(),
  mood: varchar('mood', { length: 20 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const weeklyFeedback = pgTable('weekly_feedback', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => studentsTable.id).notNull(),
  weekEnding: date('week_ending').notNull(),
  academicProgress: text('academic_progress').notNull(),
  behavior: text('behavior').notNull(),
  recommendations: text('recommendations'),
  createdAt: timestamp('created_at').defaultNow(),
});
