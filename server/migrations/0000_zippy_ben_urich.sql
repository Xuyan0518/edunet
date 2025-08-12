
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
CREATE TABLE "daily_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"activities" jsonb NOT NULL,
	"mood" varchar(20) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
<<<<<<< HEAD
	"password" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
=======
>>>>>>> 6706c99 (weekly feedback insertion done, viewing feedback incomplete)
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "parents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"grade" varchar(20) NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teacher" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
<<<<<<< HEAD
	"email" varchar(100) NOT NULL,
	"password" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "teacher_email_unique" UNIQUE("email")
=======
	"created_at" timestamp DEFAULT now()
>>>>>>> 6706c99 (weekly feedback insertion done, viewing feedback incomplete)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password" varchar(100) NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"week_ending" date NOT NULL,
	"academic_progress" text NOT NULL,
	"behavior" text NOT NULL,
	"recommendations" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_progress" ADD CONSTRAINT "daily_progress_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD CONSTRAINT "weekly_feedback_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;