ALTER TABLE "parents" ADD COLUMN "password" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "email" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "password" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_email_unique" UNIQUE("email");