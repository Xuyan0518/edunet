-- Add WeChat OpenID columns for teacher and parent
ALTER TABLE "teacher" ADD COLUMN IF NOT EXISTS "wechat_open_id" varchar(64);
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "wechat_open_id" varchar(64);

-- Ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_wechat_open_id_unique" ON "teacher" ("wechat_open_id");
CREATE UNIQUE INDEX IF NOT EXISTS "parents_wechat_open_id_unique" ON "parents" ("wechat_open_id");
