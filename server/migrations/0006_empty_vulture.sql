DROP INDEX "uq_weekly_feedback_student_week";--> statement-breakpoint
ALTER TABLE "daily_progress" ADD COLUMN "mood" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_progress" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "academic_progress" text NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "behavior" text NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "recommendations" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_weekly_feedback_student_week" ON "weekly_feedback" USING btree ("student_id","week_ending");--> statement-breakpoint
ALTER TABLE "daily_progress" DROP COLUMN "attendance";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "week_starting";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "strengths";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "areas_to_improve";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "teacher_notes";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "next_week_focus";