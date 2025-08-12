ALTER TABLE "weekly_feedback" ADD COLUMN "week_starting" date NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "summary" text NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "strengths" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "areas_to_improve" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "teacher_notes" text;--> statement-breakpoint
ALTER TABLE "weekly_feedback" ADD COLUMN "next_week_focus" text;--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "academic_progress";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "behavior";--> statement-breakpoint
ALTER TABLE "weekly_feedback" DROP COLUMN "recommendations";