ALTER TABLE "weekly_feedback"
  ADD COLUMN IF NOT EXISTS "review_status" varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "visible_to_parent" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "quarterly_summary"
  ADD COLUMN IF NOT EXISTS "review_status" varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "visible_to_parent" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "yearly_summary"
  ADD COLUMN IF NOT EXISTS "review_status" varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "visible_to_parent" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "weekly_feedback"
  ALTER COLUMN "review_status" SET DEFAULT 'pending',
  ALTER COLUMN "visible_to_parent" SET DEFAULT false;
--> statement-breakpoint

ALTER TABLE "quarterly_summary"
  ALTER COLUMN "review_status" SET DEFAULT 'pending',
  ALTER COLUMN "visible_to_parent" SET DEFAULT false;
--> statement-breakpoint

ALTER TABLE "yearly_summary"
  ALTER COLUMN "review_status" SET DEFAULT 'pending',
  ALTER COLUMN "visible_to_parent" SET DEFAULT false;
