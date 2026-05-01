-- Part 6: Exam system upgrade.
--
-- Add assessment-cycle classification and per-subject scope to existing exam
-- rows. All new columns are NULLABLE so legacy data keeps validating.
--
-- exams.exam_type        e.g. 'WA1' / 'WA2' / 'WA3' / 'FINALS' (free varchar,
--                        validated at API boundary so legacy values are tolerated).
-- exams.reminder_date    date from which the upcoming-exams dashboard card
--                        starts surfacing the exam. Null → server uses
--                        examDate - 7 days as the implicit reminder.
-- exam_scores.scope      per-subject scope text shown on the dashboard card
--                        and the exam-detail page.
--
-- Also relax exam_scores.score to allow empty strings: an exam can now be
-- SCHEDULED (no score yet) and updated later with the result. We keep the
-- NOT NULL constraint and supply a default of '' to preserve invariants.

ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "exam_type" varchar(20);
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "reminder_date" date;

ALTER TABLE "exam_scores" ADD COLUMN IF NOT EXISTS "scope" text;
ALTER TABLE "exam_scores" ALTER COLUMN "score" SET DEFAULT '';

-- Backfill any historical NULLs that may have leaked in (defensive).
UPDATE "exam_scores" SET "score" = '' WHERE "score" IS NULL;
