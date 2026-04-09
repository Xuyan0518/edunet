ALTER TABLE "student_topic_progress"
  ADD COLUMN "definition_recited" boolean NOT NULL DEFAULT false,
  ADD COLUMN "chapter_exercise_completed" boolean NOT NULL DEFAULT false;

UPDATE "student_topic_progress"
SET definition_recited = true,
    chapter_exercise_completed = true
WHERE status = 'completed';

UPDATE "student_topic_progress"
SET definition_recited = true,
    chapter_exercise_completed = false
WHERE status = 'in_progress'
  AND definition_recited = false
  AND chapter_exercise_completed = false;
