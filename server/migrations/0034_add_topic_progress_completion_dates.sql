ALTER TABLE "student_topic_progress"
  ADD COLUMN IF NOT EXISTS "definition_recited_at" timestamp,
  ADD COLUMN IF NOT EXISTS "chapter_exercise_completed_at" timestamp;
--> statement-breakpoint

UPDATE "student_topic_progress"
SET "definition_recited_at" = COALESCE("definition_recited_at", "updated_at")
WHERE "definition_recited" = true;
--> statement-breakpoint

UPDATE "student_topic_progress"
SET "chapter_exercise_completed_at" = COALESCE("chapter_exercise_completed_at", "updated_at")
WHERE "chapter_exercise_completed" = true;
