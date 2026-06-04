ALTER TABLE "daily_progress"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "weekly_feedback"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "quarterly_summary"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "yearly_summary"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "student_reports"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

ALTER TABLE "student_papers"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(64),
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);
--> statement-breakpoint

DROP INDEX IF EXISTS "daily_progress_student_date_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_progress_student_date_idx"
  ON "daily_progress" ("student_id", "date")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_weekly_feedback_student_week";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_weekly_feedback_student_week"
  ON "weekly_feedback" ("student_id", "week_starting")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_quarterly_summary_student_year_quarter";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_quarterly_summary_student_year_quarter"
  ON "quarterly_summary" ("student_id", "year", "quarter")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_yearly_summary_student_year";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_yearly_summary_student_year"
  ON "yearly_summary" ("student_id", "year")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_daily_progress_deleted_at"
  ON "daily_progress" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_weekly_feedback_deleted_at"
  ON "weekly_feedback" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_exams_deleted_at"
  ON "exams" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_reports_deleted_at"
  ON "student_reports" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_papers_deleted_at"
  ON "student_papers" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
