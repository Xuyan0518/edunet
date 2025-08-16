-- Migration: Add progress tracking tables
-- Date: 2025-01-XX

-- Create daily_progress table
CREATE TABLE IF NOT EXISTS "daily_progress" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
    "date" date NOT NULL,
    "activities" jsonb NOT NULL,
    "mood" varchar(20) NOT NULL,
    "notes" text,
    "created_at" timestamp DEFAULT now()
);

-- Create weekly_feedback table
CREATE TABLE IF NOT EXISTS "weekly_feedback" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
    "week_ending" date NOT NULL,
    "academic_progress" text NOT NULL,
    "behavior" text NOT NULL,
    "recommendations" text,
    "created_at" timestamp DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS "daily_progress_student_id_idx" ON "daily_progress"("student_id");
CREATE INDEX IF NOT EXISTS "daily_progress_date_idx" ON "daily_progress"("date");
CREATE INDEX IF NOT EXISTS "weekly_feedback_student_id_idx" ON "weekly_feedback"("student_id");
CREATE INDEX IF NOT EXISTS "weekly_feedback_week_ending_idx" ON "weekly_feedback"("week_ending");
