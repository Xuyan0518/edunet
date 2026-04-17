-- WeChat-only auth refactor: keep legacy email/password columns for compatibility,
-- but stop using them as authentication credentials.

-- 1) Make legacy credentials optional
ALTER TABLE "teacher" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "teacher" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "parents" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "parents" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "admins" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "admins" ALTER COLUMN "password" DROP NOT NULL;

-- 2) Add WeChat identity/profile columns
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "display_name" varchar(100);
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "wechat_union_id" varchar(64);
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "auth_provider" varchar(20) DEFAULT 'wechat' NOT NULL;
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "display_name" varchar(100);
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "wechat_union_id" varchar(64);
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "auth_provider" varchar(20) DEFAULT 'wechat' NOT NULL;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "display_name" varchar(100);
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "wechat_open_id" varchar(64);
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "wechat_union_id" varchar(64);
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "auth_provider" varchar(20) DEFAULT 'wechat' NOT NULL;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- 3) Backfill display name and auth provider
UPDATE "teacher"
SET
  "display_name" = COALESCE(NULLIF("display_name", ''), NULLIF("name", ''), '未命名用户'),
  "auth_provider" = COALESCE(NULLIF("auth_provider", ''), 'wechat');

UPDATE "parents"
SET
  "display_name" = COALESCE(NULLIF("display_name", ''), NULLIF("name", ''), '未命名用户'),
  "auth_provider" = COALESCE(NULLIF("auth_provider", ''), 'wechat');

UPDATE "admins"
SET
  "display_name" = COALESCE(NULLIF("display_name", ''), NULLIF("name", ''), '未命名用户'),
  "auth_provider" = COALESCE(NULLIF("auth_provider", ''), 'wechat');

-- 4) Unique indexes for WeChat identity fields
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_wechat_union_id_unique"
  ON "teacher" ("wechat_union_id")
  WHERE "wechat_union_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "parents_wechat_union_id_unique"
  ON "parents" ("wechat_union_id")
  WHERE "wechat_union_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "admins_wechat_open_id_unique"
  ON "admins" ("wechat_open_id")
  WHERE "wechat_open_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "admins_wechat_union_id_unique"
  ON "admins" ("wechat_union_id")
  WHERE "wechat_union_id" IS NOT NULL;
