-- Migration: Update progress tables to match new schema
-- This migration transforms the existing tables to use the new structure

-- Step 1: Update daily_progress table
-- Add new attendance column
ALTER TABLE daily_progress ADD COLUMN attendance VARCHAR(10);

-- Convert existing mood data to attendance (mapping mood values to attendance)
UPDATE daily_progress 
SET attendance = CASE 
  WHEN mood = 'happy' OR mood = 'good' OR mood = 'excellent' THEN 'present'
  WHEN mood = 'sad' OR mood = 'bad' OR mood = 'poor' THEN 'absent'
  WHEN mood = 'tired' OR mood = 'okay' THEN 'late'
  ELSE 'present'
END;

-- Make attendance NOT NULL after populating
ALTER TABLE daily_progress ALTER COLUMN attendance SET NOT NULL;

-- Drop the old mood column
ALTER TABLE daily_progress DROP COLUMN mood;

-- Drop the old notes column
ALTER TABLE daily_progress DROP COLUMN notes;

-- Step 2: Update weekly_feedback table
-- Add new columns
ALTER TABLE weekly_feedback ADD COLUMN week_starting DATE;
ALTER TABLE weekly_feedback ADD COLUMN summary TEXT;
ALTER TABLE weekly_feedback ADD COLUMN strengths JSONB;
ALTER TABLE weekly_feedback ADD COLUMN areas_to_improve JSONB;
ALTER TABLE weekly_feedback ADD COLUMN teacher_notes TEXT;
ALTER TABLE weekly_feedback ADD COLUMN next_week_focus TEXT;

-- Populate week_starting based on week_ending (assuming week starts 6 days before week_ending)
UPDATE weekly_feedback 
SET week_starting = week_ending - INTERVAL '6 days';

-- Convert existing academic_progress to summary
UPDATE weekly_feedback 
SET summary = academic_progress;

-- Convert existing behavior to strengths (as a simple array)
UPDATE weekly_feedback 
SET strengths = jsonb_build_array(behavior);

-- Set default areas_to_improve as empty array
UPDATE weekly_feedback 
SET areas_to_improve = '[]'::jsonb;

-- Convert existing recommendations to teacher_notes
UPDATE weekly_feedback 
SET teacher_notes = recommendations;

-- Make new required columns NOT NULL
ALTER TABLE weekly_feedback ALTER COLUMN week_starting SET NOT NULL;
ALTER TABLE weekly_feedback ALTER COLUMN summary SET NOT NULL;
ALTER TABLE weekly_feedback ALTER COLUMN strengths SET NOT NULL;
ALTER TABLE weekly_feedback ALTER COLUMN areas_to_improve SET NOT NULL;

-- Drop old columns
ALTER TABLE weekly_feedback DROP COLUMN academic_progress;
ALTER TABLE weekly_feedback DROP COLUMN behavior;
ALTER TABLE weekly_feedback DROP COLUMN recommendations;

-- Update the unique constraint to use week_starting instead of week_ending
DROP INDEX IF EXISTS uq_weekly_feedback_student_week;
CREATE UNIQUE INDEX uq_weekly_feedback_student_week ON weekly_feedback (student_id, week_starting);

-- Step 3: Update any existing data to ensure compatibility
-- For daily_progress, ensure activities is a valid JSONB array
UPDATE daily_progress 
SET activities = '[]'::jsonb 
WHERE activities IS NULL OR activities = '{}'::jsonb;

-- For weekly_feedback, ensure JSONB arrays are properly formatted
UPDATE weekly_feedback 
SET strengths = '[]'::jsonb 
WHERE strengths IS NULL;

UPDATE weekly_feedback 
SET areas_to_improve = '[]'::jsonb 
WHERE areas_to_improve IS NULL;

-- Step 4: Add any missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_progress_student_date ON daily_progress (student_id, date);
CREATE INDEX IF NOT EXISTS idx_weekly_feedback_student_week_start ON weekly_feedback (student_id, week_starting);
CREATE INDEX IF NOT EXISTS idx_weekly_feedback_week_end ON weekly_feedback (week_ending);

-- Step 5: Verify the new structure
-- This will show the new table structure
\d daily_progress;
\d weekly_feedback;
