-- Per-subject exam dates.
--
-- An "exam" row can span multiple subjects, and in practice each subject is
-- often sat on a different day (e.g. WA2 English on Mon, WA2 Math on Wed).
-- We add a nullable per-subject exam_date column. When NULL the parent
-- exam.exam_date is used as the effective date.

ALTER TABLE "exam_scores" ADD COLUMN IF NOT EXISTS "exam_date" date;
