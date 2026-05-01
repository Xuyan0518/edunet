-- Part 3: Weekly English task system.
--
-- weekly_study_cycles defines explicit study weeks (default Sun→Thu, but
-- teachers can override). When no row covers a given date the server
-- synthesises a Sun→Thu cycle in code, so this table being empty is fine.
--
-- student_weekly_task_targets holds per (student, cycle) target overrides.
-- A missing row falls back to hardcoded defaults: 5 reading / 5 editing /
-- 5 grammar / 50 vocab / 1 composition; both editing and grammar required.

CREATE TABLE IF NOT EXISTS "weekly_study_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100),
  CONSTRAINT "weekly_cycle_dates_ok" CHECK ("start_date" <= "end_date")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_weekly_cycle_start_end"
  ON "weekly_study_cycles" ("start_date", "end_date");

CREATE TABLE IF NOT EXISTS "student_weekly_task_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "weekly_study_cycles"("id"),
  "reading_target" integer NOT NULL DEFAULT 5,
  "editing_target" integer NOT NULL DEFAULT 5,
  "grammar_target" integer NOT NULL DEFAULT 5,
  "vocab_target" integer NOT NULL DEFAULT 50,
  "composition_target" integer NOT NULL DEFAULT 1,
  "is_grammar_required" boolean NOT NULL DEFAULT true,
  "is_editing_required" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_weekly_targets"
  ON "student_weekly_task_targets" ("student_id", "cycle_id");
