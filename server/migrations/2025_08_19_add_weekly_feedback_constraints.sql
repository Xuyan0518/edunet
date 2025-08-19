CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE weekly_feedback
  ADD COLUMN period DATERANGE GENERATED ALWAYS AS (
    daterange(week_starting, week_ending + INTERVAL '1 day', '[]')
  ) STORED;

CREATE INDEX IF NOT EXISTS weekly_feedback_period_gist
  ON weekly_feedback USING GIST (student_id, period);

ALTER TABLE weekly_feedback
  ADD CONSTRAINT ex_weekly_feedback_no_overlap
  EXCLUDE USING GIST (student_id WITH =, period WITH &&);
