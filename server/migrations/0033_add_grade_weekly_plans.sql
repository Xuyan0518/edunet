CREATE TABLE IF NOT EXISTS "grade_weekly_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "grade" varchar(20) NOT NULL,
  "week_starting" date NOT NULL,
  "week_ending" date NOT NULL,
  "topic" text NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_grade_weekly_plans_grade_week"
  ON "grade_weekly_plans" ("grade", "week_starting");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_weekly_plan_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "grade_weekly_plan_id" uuid NOT NULL REFERENCES "grade_weekly_plans"("id"),
  "score" integer,
  "completed" boolean NOT NULL DEFAULT false,
  "comment" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_weekly_plan_records_student_plan"
  ON "student_weekly_plan_records" ("student_id", "grade_weekly_plan_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_weekly_plan_records_plan"
  ON "student_weekly_plan_records" ("grade_weekly_plan_id");
