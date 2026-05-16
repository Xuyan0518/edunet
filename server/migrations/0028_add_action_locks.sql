CREATE TABLE IF NOT EXISTS "action_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lock_key" varchar(255) NOT NULL,
  "action_type" varchar(100) NOT NULL,
  "actor_user_id" varchar(64) NOT NULL,
  "actor_name" varchar(100),
  "metadata_json" jsonb,
  "acquired_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_action_locks_lock_key"
  ON "action_locks" ("lock_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_action_locks_expires_at"
  ON "action_locks" ("expires_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_action_locks_actor"
  ON "action_locks" ("actor_user_id");
