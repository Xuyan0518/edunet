DROP INDEX "uq_weekly_feedback_student_week";--> statement-breakpoint
ALTER TABLE "daily_progress" ADD COLUMN "attendance" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "week_starting" date NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "summary" text NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "strengths" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "areas_to_improve" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "teacher_notes" text;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "next_week_focus" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_weekly_feedback_student_week" ON "weekly_feedback" USING btree ("student_id","week_starting");--> statement-breakpoint
ALTER TABLE "daily_progress" DROP COLUMN "mood";--> statement-breakpoint
ALTER TABLE "daily_progress" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "academic_progress";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "behavior";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "recommendations";