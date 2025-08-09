ALTER TABLE "daily_progress" ADD COLUMN "attendance" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_progress" DROP COLUMN "mood";--> statement-breakpoint
ALTER TABLE "daily_progress" DROP COLUMN "notes";