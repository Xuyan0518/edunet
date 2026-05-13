ALTER TABLE "student_papers"
  ADD COLUMN IF NOT EXISTS "strengths" text,
  ADD COLUMN IF NOT EXISTS "improvements" text;
