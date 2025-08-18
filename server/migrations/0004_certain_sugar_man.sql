ALTER TABLE "parents" ADD COLUMN "email_verified" varchar(5) DEFAULT 'false' NOT NULL;--> statement-breakpoint
ALTER TABLE "parents" ADD COLUMN "verification_token" varchar(255);--> statement-breakpoint
ALTER TABLE "parents" ADD COLUMN "verification_token_expires" timestamp;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "email_verified" varchar(5) DEFAULT 'false' NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "verification_token" varchar(255);--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "verification_token_expires" timestamp;