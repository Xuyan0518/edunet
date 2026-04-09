ALTER TABLE "daily_progress"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

ALTER TABLE "weekly_feedback"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

ALTER TABLE "quarterly_summary"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

ALTER TABLE "yearly_summary"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

ALTER TABLE "student_papers"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_by_name" varchar(100);

UPDATE "daily_progress" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "weekly_feedback" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "exams" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "quarterly_summary" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "yearly_summary" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "student_papers" SET "updated_at" = now() WHERE "updated_at" IS NULL;
