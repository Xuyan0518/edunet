CREATE TABLE "paper_types" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "paper_types_name_unique" UNIQUE("name")
);

CREATE TABLE "paper_schools" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "paper_schools_name_unique" UNIQUE("name")
);

CREATE TABLE "student_papers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "student_id" uuid NOT NULL,
  "subject_id" uuid,
  "subject_name" text,
  "type_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  "date" date NOT NULL,
  "score" integer,
  "total" integer,
  "created_at" timestamp DEFAULT now()
);

ALTER TABLE "student_papers" ADD CONSTRAINT "student_papers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "student_papers" ADD CONSTRAINT "student_papers_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "student_papers" ADD CONSTRAINT "student_papers_type_id_paper_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."paper_types"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "student_papers" ADD CONSTRAINT "student_papers_school_id_paper_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."paper_schools"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "idx_student_papers_student_date" ON "student_papers" USING btree ("student_id","date");
CREATE INDEX "idx_student_papers_type" ON "student_papers" USING btree ("type_id");
CREATE INDEX "idx_student_papers_school" ON "student_papers" USING btree ("school_id");
