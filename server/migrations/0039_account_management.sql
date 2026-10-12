ALTER TABLE admins ADD COLUMN IF NOT EXISTS account_identity_id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS account_identity_id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE parents ADD COLUMN IF NOT EXISTS account_identity_id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE admins ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE parents ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE admins ADD COLUMN IF NOT EXISTS email_verified varchar(5) NOT NULL DEFAULT 'true';
--> statement-breakpoint
ALTER TABLE admins ADD COLUMN IF NOT EXISTS google_subject varchar(255) UNIQUE;
--> statement-breakpoint
ALTER TABLE admins ADD COLUMN IF NOT EXISTS wechat_web_open_id varchar(64) UNIQUE;
--> statement-breakpoint

-- Link only proven provider identities, never coincidentally matching emails.
WITH RECURSIVE accounts AS (
  SELECT account_identity_id, wechat_open_id, wechat_union_id, google_subject, wechat_web_open_id FROM admins
  UNION ALL SELECT account_identity_id, wechat_open_id, wechat_union_id, google_subject, wechat_web_open_id FROM teacher
  UNION ALL SELECT account_identity_id, wechat_open_id, wechat_union_id, google_subject, wechat_web_open_id FROM parents
), keys AS (
  SELECT a.account_identity_id, k.kind, k.value FROM accounts a
  CROSS JOIN LATERAL (VALUES ('openid',wechat_open_id),('unionid',wechat_union_id),('google',google_subject),('web-wechat',wechat_web_open_id)) k(kind,value)
  WHERE k.value IS NOT NULL AND k.value <> ''
), edges AS (
  SELECT DISTINCT a.account_identity_id AS src, b.account_identity_id AS dst FROM keys a JOIN keys b ON a.kind=b.kind AND a.value=b.value
), walk(start,node) AS (
  SELECT account_identity_id,account_identity_id FROM accounts
  UNION SELECT w.start,e.dst FROM walk w JOIN edges e ON e.src=w.node
), mapped AS (SELECT start,min(node::text)::uuid AS identity FROM walk GROUP BY start),
ua AS (UPDATE admins a SET account_identity_id=m.identity FROM mapped m WHERE a.account_identity_id=m.start RETURNING a.id),
ut AS (UPDATE teacher a SET account_identity_id=m.identity FROM mapped m WHERE a.account_identity_id=m.start RETURNING a.id)
UPDATE parents a SET account_identity_id=m.identity FROM mapped m WHERE a.account_identity_id=m.start;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admins_account_identity_unique ON admins(account_identity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS teacher_account_identity_unique ON teacher(account_identity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS parents_account_identity_unique ON parents(account_identity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_case_unique ON admins(lower(email)) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS teacher_email_case_unique ON teacher(lower(email)) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS parents_email_case_unique ON parents(lower(email)) WHERE email IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS auth_action_tokens (
  token_hash varchar(64) PRIMARY KEY,
  account_identity_id uuid NOT NULL,
  user_role varchar(10) NOT NULL CHECK(user_role IN ('admin','teacher','parent')),
  user_id uuid NOT NULL,
  email varchar(100) NOT NULL,
  auth_version integer NOT NULL,
  purpose varchar(10) NOT NULL CHECK(purpose IN ('reset','verify')),
  expires_at timestamptz NOT NULL,
  UNIQUE(account_identity_id,purpose)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_action_tokens_expiry ON auth_action_tokens(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_mail_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_payload text,
  token_hash varchar(64),
  status varchar(12) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_mail_pending ON auth_mail_jobs(status,available_at);
--> statement-breakpoint

-- Serialized role changes protect the last admin even across API replicas.
CREATE OR REPLACE FUNCTION edunet_set_account_roles(p_role text,p_id uuid,p_roles text[],p_name text,p_actor uuid,p_password_snapshot text,p_new_role_password text,p_assign boolean DEFAULT false)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE source jsonb; identity uuid; r text; existing_id uuid; admin_id uuid; linked_parent_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('edunet:account-management',0));
  IF NOT EXISTS(SELECT 1 FROM admins WHERE id=p_actor) THEN RAISE EXCEPTION 'ADMIN_ACCESS_REQUIRED'; END IF;
  IF p_role NOT IN ('admin','teacher','parent') OR cardinality(p_roles)<1 OR NOT p_roles <@ ARRAY['admin','teacher','parent']::text[] OR length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ROLE_INPUT'; END IF;
  IF p_role='admin' THEN SELECT to_jsonb(a) INTO source FROM admins a WHERE id=p_id FOR UPDATE;
  ELSIF p_role='teacher' THEN SELECT to_jsonb(a) INTO source FROM teacher a WHERE id=p_id FOR UPDATE;
  ELSE SELECT to_jsonb(a) INTO source FROM parents a WHERE id=p_id FOR UPDATE; END IF;
  IF source IS NULL THEN RAISE EXCEPTION 'SOURCE_NOT_FOUND'; END IF;
  IF source->>'auth_provider'='reviewer' THEN RAISE EXCEPTION 'REVIEWER_IDENTITY'; END IF;
  IF source->>'password' IS DISTINCT FROM p_password_snapshot THEN RAISE EXCEPTION 'ACCOUNT_CHANGED'; END IF;
  identity=(source->>'account_identity_id')::uuid;
  IF p_assign THEN
    SELECT array_agg(DISTINCT r.role) INTO p_roles FROM (
      SELECT 'admin' AS role FROM admins WHERE account_identity_id=identity UNION ALL
      SELECT 'teacher' FROM teacher WHERE account_identity_id=identity UNION ALL
      SELECT 'parent' FROM parents WHERE account_identity_id=identity UNION ALL SELECT unnest(p_roles)
    ) r;
  END IF;
  SELECT id INTO admin_id FROM admins WHERE account_identity_id=identity;
  IF admin_id IS NOT NULL AND NOT 'admin'=ANY(p_roles) THEN
    IF admin_id=p_actor THEN RAISE EXCEPTION 'OWN_ADMIN_ROLE'; END IF;
    IF (SELECT count(*) FROM admins)<=1 THEN RAISE EXCEPTION 'LAST_ADMIN_ROLE'; END IF;
  END IF;
  SELECT id INTO linked_parent_id FROM parents WHERE account_identity_id=identity FOR UPDATE;
  IF linked_parent_id IS NOT NULL AND NOT 'parent'=ANY(p_roles) AND
    (EXISTS(SELECT 1 FROM students s WHERE s.parent_id=linked_parent_id) OR EXISTS(SELECT 1 FROM student_parent_bindings b WHERE b.parent_id=linked_parent_id)) THEN RAISE EXCEPTION 'PARENT_HAS_BINDINGS'; END IF;
  FOREACH r IN ARRAY ARRAY['admin','teacher','parent'] LOOP
    -- Table names come from this fixed server-owned list only.
    EXECUTE format('SELECT id FROM %I WHERE account_identity_id=$1',CASE WHEN r='teacher' THEN 'teacher' WHEN r='parent' THEN 'parents' ELSE 'admins' END) INTO existing_id USING identity;
    IF r=ANY(p_roles) THEN
      IF existing_id IS NOT NULL THEN
        IF r='admin' THEN UPDATE admins SET name=p_name,display_name=p_name,updated_at=now() WHERE id=existing_id;
        ELSIF r='teacher' THEN UPDATE teacher SET name=p_name,display_name=p_name,status='approved',updated_at=now() WHERE id=existing_id;
        ELSE UPDATE parents SET name=p_name,display_name=p_name,status='approved',updated_at=now() WHERE id=existing_id; END IF;
      ELSE
        EXECUTE format('INSERT INTO %I(id,account_identity_id,name,display_name,email,password,auth_provider,wechat_open_id,wechat_union_id,google_subject,wechat_web_open_id,avatar_url,email_verified,auth_version%s) VALUES(gen_random_uuid(),$1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12%s)',
          CASE WHEN r='teacher' THEN 'teacher' WHEN r='parent' THEN 'parents' ELSE 'admins' END,
          CASE WHEN r='admin' THEN '' ELSE ',status' END, CASE WHEN r='admin' THEN '' ELSE ',''approved''' END)
        USING identity,p_name,source->>'email',p_new_role_password,source->>'auth_provider',source->>'wechat_open_id',source->>'wechat_union_id',source->>'google_subject',source->>'wechat_web_open_id',source->>'avatar_url',COALESCE(source->>'email_verified','false'),(source->>'auth_version')::integer;
      END IF;
    ELSIF existing_id IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I WHERE id=$1',CASE WHEN r='teacher' THEN 'teacher' WHEN r='parent' THEN 'parents' ELSE 'admins' END) USING existing_id;
    END IF;
  END LOOP;
  RETURN p_roles;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION edunet_change_account_password(p_role text,p_id uuid,p_snapshot text,p_hash text,p_token_hash text)
RETURNS TABLE(email text,user_role text) LANGUAGE plpgsql AS $$
DECLARE source jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('edunet:account-management',0));
  IF p_role='admin' THEN SELECT to_jsonb(a) INTO source FROM admins a WHERE id=p_id FOR UPDATE;
  ELSIF p_role='teacher' THEN SELECT to_jsonb(a) INTO source FROM teacher a WHERE id=p_id FOR UPDATE;
  ELSIF p_role='parent' THEN SELECT to_jsonb(a) INTO source FROM parents a WHERE id=p_id FOR UPDATE;
  ELSE RETURN; END IF;
  IF source IS NULL OR source->>'password' IS NULL OR source->>'password' IS DISTINCT FROM p_snapshot OR source->>'auth_provider'='reviewer' THEN RETURN; END IF;
  INSERT INTO auth_action_tokens(token_hash,account_identity_id,user_role,user_id,email,auth_version,purpose,expires_at)
  VALUES(p_token_hash,(source->>'account_identity_id')::uuid,p_role,p_id,source->>'email',(source->>'auth_version')::integer,'reset',now()+interval '1 minute')
  ON CONFLICT(account_identity_id,purpose) DO UPDATE SET token_hash=excluded.token_hash,user_role=excluded.user_role,user_id=excluded.user_id,email=excluded.email,auth_version=excluded.auth_version,expires_at=excluded.expires_at;
  RETURN QUERY SELECT * FROM edunet_complete_auth_action(p_token_hash,'reset',p_hash);
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION edunet_complete_auth_action(p_hash text,p_purpose text,p_password text)
RETURNS TABLE(email text,user_role text) LANGUAGE plpgsql AS $$
DECLARE action auth_action_tokens; source jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('edunet:account-management',0));
  SELECT * INTO action FROM auth_action_tokens WHERE token_hash=p_hash AND purpose=p_purpose AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF action.user_role='admin' THEN SELECT to_jsonb(a) INTO source FROM admins a WHERE id=action.user_id;
  ELSIF action.user_role='teacher' THEN SELECT to_jsonb(a) INTO source FROM teacher a WHERE id=action.user_id;
  ELSE SELECT to_jsonb(a) INTO source FROM parents a WHERE id=action.user_id; END IF;
  IF source IS NULL OR source->>'auth_provider'='reviewer' OR source->>'password' IS NULL OR source->>'email' IS DISTINCT FROM action.email OR
    (source->>'account_identity_id')::uuid<>action.account_identity_id OR (source->>'auth_version')::integer<>action.auth_version THEN RETURN; END IF;
  IF action.user_role<>'admin' AND source->>'status' NOT IN ('approved','pending') THEN RETURN; END IF;
  IF p_purpose='reset' THEN
    IF p_password IS NULL OR p_password !~ '^scrypt[$][a-f0-9]{32}[$][a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_PASSWORD_HASH'; END IF;
    UPDATE admins SET password=CASE WHEN admins.email=action.email AND password IS NOT NULL THEN p_password ELSE password END,email_verified=CASE WHEN admins.email=action.email THEN 'true' ELSE email_verified END,auth_version=auth_version+1,updated_at=now() WHERE account_identity_id=action.account_identity_id;
    UPDATE teacher SET password=CASE WHEN teacher.email=action.email AND password IS NOT NULL THEN p_password ELSE password END,email_verified=CASE WHEN teacher.email=action.email THEN 'true' ELSE email_verified END,auth_version=auth_version+1,updated_at=now() WHERE account_identity_id=action.account_identity_id;
    UPDATE parents SET password=CASE WHEN parents.email=action.email AND password IS NOT NULL THEN p_password ELSE password END,email_verified=CASE WHEN parents.email=action.email THEN 'true' ELSE email_verified END,auth_version=auth_version+1,updated_at=now() WHERE account_identity_id=action.account_identity_id;
    DELETE FROM auth_action_tokens WHERE account_identity_id=action.account_identity_id;
  ELSIF p_purpose='verify' THEN
    UPDATE admins SET email_verified='true' WHERE account_identity_id=action.account_identity_id AND admins.email=action.email;
    UPDATE teacher SET email_verified='true' WHERE account_identity_id=action.account_identity_id AND teacher.email=action.email;
    UPDATE parents SET email_verified='true' WHERE account_identity_id=action.account_identity_id AND parents.email=action.email;
    DELETE FROM auth_action_tokens WHERE token_hash=p_hash;
  ELSE RETURN; END IF;
  RETURN QUERY SELECT action.email::text,action.user_role::text;
END $$;
