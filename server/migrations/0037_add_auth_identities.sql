ALTER TABLE "admins" ALTER COLUMN "email" TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "email" TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "parents" ALTER COLUMN "email" TYPE varchar(320);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_role" varchar(20) NOT NULL,
  "account_id" uuid NOT NULL,
  "provider" varchar(32) NOT NULL,
  "provider_subject" varchar(255) NOT NULL,
  "wechat_union_id" varchar(64),
  "email" varchar(320),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "last_login_at" timestamp
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_auth_identities_provider_subject_role"
  ON "auth_identities" ("provider", "provider_subject", "account_role");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_auth_identities_account_provider"
  ON "auth_identities" ("account_role", "account_id", "provider");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_auth_identities_account"
  ON "auth_identities" ("account_role", "account_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_auth_identities_wechat_union_id"
  ON "auth_identities" ("wechat_union_id");
--> statement-breakpoint

INSERT INTO "auth_identities" (
  "account_role", "account_id", "provider", "provider_subject", "wechat_union_id", "created_at", "updated_at"
)
SELECT 'admin', "id", 'wechat_miniprogram', "wechat_open_id", "wechat_union_id", COALESCE("created_at", now()), COALESCE("updated_at", now())
FROM "admins"
WHERE "wechat_open_id" IS NOT NULL
ON CONFLICT ("provider", "provider_subject", "account_role") DO NOTHING;
--> statement-breakpoint

INSERT INTO "auth_identities" (
  "account_role", "account_id", "provider", "provider_subject", "wechat_union_id", "created_at", "updated_at"
)
SELECT 'teacher', "id", 'wechat_miniprogram', "wechat_open_id", "wechat_union_id", COALESCE("created_at", now()), COALESCE("updated_at", now())
FROM "teacher"
WHERE "wechat_open_id" IS NOT NULL
ON CONFLICT ("provider", "provider_subject", "account_role") DO NOTHING;
--> statement-breakpoint

INSERT INTO "auth_identities" (
  "account_role", "account_id", "provider", "provider_subject", "wechat_union_id", "created_at", "updated_at"
)
SELECT 'parent', "id", 'wechat_miniprogram', "wechat_open_id", "wechat_union_id", COALESCE("created_at", now()), COALESCE("updated_at", now())
FROM "parents"
WHERE "wechat_open_id" IS NOT NULL
ON CONFLICT ("provider", "provider_subject", "account_role") DO NOTHING;
