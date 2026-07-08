CREATE TABLE IF NOT EXISTS "student_parent_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "parent_id" uuid NOT NULL REFERENCES "parents"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_parent_bindings_student_parent"
  ON "student_parent_bindings" ("student_id", "parent_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_parent_bindings_student_id"
  ON "student_parent_bindings" ("student_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_parent_bindings_parent_id"
  ON "student_parent_bindings" ("parent_id");
--> statement-breakpoint

INSERT INTO "student_parent_bindings" ("student_id", "parent_id")
SELECT "id", "parent_id"
FROM "students"
WHERE "parent_id" IS NOT NULL
ON CONFLICT ("student_id", "parent_id") DO NOTHING;
