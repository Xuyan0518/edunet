CREATE TABLE IF NOT EXISTS "subject_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_subject_levels_name"
  ON "subject_levels" ("name");
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "chinese_name" varchar(120);
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "english_name" varchar(120);
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "is_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "level_id" uuid;
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'subjects_level_id_subject_levels_id_fk'
      AND table_name = 'subjects'
  ) THEN
    ALTER TABLE "subjects"
      ADD CONSTRAINT "subjects_level_id_subject_levels_id_fk"
      FOREIGN KEY ("level_id") REFERENCES "subject_levels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_english_task_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "tasks_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'student_english_task_configs_student_id_students_id_fk'
      AND table_name = 'student_english_task_configs'
  ) THEN
    ALTER TABLE "student_english_task_configs"
      ADD CONSTRAINT "student_english_task_configs_student_id_students_id_fk"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_english_task_config_student"
  ON "student_english_task_configs" ("student_id");
--> statement-breakpoint

DO $$
DECLARE
  default_level_id uuid;
BEGIN
  INSERT INTO "subject_levels" ("name", "description", "sort_order", "is_default", "is_active")
  VALUES ('O-Level', 'Default level for legacy subjects', 0, true, true)
  ON CONFLICT ("name") DO UPDATE
    SET "is_default" = true,
        "is_active" = true,
        "updated_at" = now()
  RETURNING "id" INTO default_level_id;

  IF default_level_id IS NULL THEN
    SELECT "id" INTO default_level_id
    FROM "subject_levels"
    WHERE "name" = 'O-Level'
    LIMIT 1;
  END IF;

  UPDATE "subject_levels"
    SET "is_default" = CASE WHEN "id" = default_level_id THEN true ELSE false END
    WHERE "is_default" = true OR "id" = default_level_id;

  IF default_level_id IS NOT NULL THEN
    UPDATE "subjects"
      SET "level_id" = default_level_id
      WHERE "level_id" IS NULL;
  END IF;
END $$;
