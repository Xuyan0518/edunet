CREATE TABLE IF NOT EXISTS "student_reports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "student_id" uuid NOT NULL,
  "report_type" varchar(20) NOT NULL,
  "title" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "year" integer,
  "summary_text" text NOT NULL,
  "analytics_json" jsonb,
  "structured_report_json" jsonb,
  "final_report_json" jsonb,
  "raw_ai_response" text,
  "parse_error" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "visible_to_parent" boolean DEFAULT false NOT NULL,
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_reports"
    ADD CONSTRAINT "student_reports_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "student_reports"
  DROP CONSTRAINT IF EXISTS "student_reports_report_type_check";
--> statement-breakpoint
ALTER TABLE "student_reports"
  ADD CONSTRAINT "student_reports_report_type_check"
  CHECK ("report_type" IN ('quarterly', 'yearly'));
--> statement-breakpoint
ALTER TABLE "student_reports"
  DROP CONSTRAINT IF EXISTS "student_reports_status_check";
--> statement-breakpoint
ALTER TABLE "student_reports"
  ADD CONSTRAINT "student_reports_status_check"
  CHECK ("status" IN ('draft', 'final'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_reports_student_created"
  ON "student_reports" USING btree ("student_id", "created_at", "id");
