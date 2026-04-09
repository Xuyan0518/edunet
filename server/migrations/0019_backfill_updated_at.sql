UPDATE "daily_progress" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "weekly_feedback" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "exams" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "quarterly_summary" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "yearly_summary" SET "updated_at" = now() WHERE "updated_at" IS NULL;
UPDATE "student_papers" SET "updated_at" = now() WHERE "updated_at" IS NULL;
