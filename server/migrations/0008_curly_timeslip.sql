CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"label" varchar(50) NOT NULL,
	"score" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quarterly_summary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "yearly_summary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_progress" ADD COLUMN "attendance_start" varchar(5);--> statement-breakpoint
ALTER TABLE "daily_progress" ADD COLUMN "attendance_end" varchar(5);--> statement-breakpoint
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "wechat_open_id" varchar(64);--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "wechat_open_id" varchar(64);--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarterly_summary" ADD CONSTRAINT "quarterly_summary_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_summary" ADD CONSTRAINT "yearly_summary_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quarterly_summary_student_year_quarter" ON "quarterly_summary" USING btree ("student_id","year","quarter");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_yearly_summary_student_year" ON "yearly_summary" USING btree ("student_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parents_wechat_open_id_unique" ON "parents" USING btree ("wechat_open_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_wechat_open_id_unique" ON "teacher" USING btree ("wechat_open_id");
