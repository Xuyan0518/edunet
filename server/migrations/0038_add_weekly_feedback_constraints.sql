CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE weekly_feedback
  DROP CONSTRAINT IF EXISTS ex_weekly_feedback_no_overlap;
--> statement-breakpoint
DROP INDEX IF EXISTS weekly_feedback_period_gist;
--> statement-breakpoint
ALTER TABLE weekly_feedback
  DROP COLUMN IF EXISTS period;
--> statement-breakpoint
ALTER TABLE weekly_feedback
  ADD COLUMN period DATERANGE GENERATED ALWAYS AS (
    daterange(week_starting, week_ending, '[]')
  ) STORED;
--> statement-breakpoint
CREATE INDEX weekly_feedback_period_gist
  ON weekly_feedback USING GIST (student_id, period)
  WHERE (deleted_at IS NULL);
--> statement-breakpoint
ALTER TABLE weekly_feedback
  ADD CONSTRAINT ex_weekly_feedback_no_overlap
  EXCLUDE USING GIST (student_id WITH =, period WITH &&)
  WHERE (deleted_at IS NULL);
