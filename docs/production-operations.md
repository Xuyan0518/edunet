# EduNet production operations runbook

This runbook is the mandatory procedure for backing up, promoting, monitoring, and rolling back EduNet. It separates application rollback from database recovery and requires production deployment approval as a distinct decision.

## Safety rules

- Never paste a database URL, token, password, or API key into chat, logs, commits, issue bodies, or this document.
- Store connection URLs only in ACL-restricted files outside the repository.
- Production deployment, production database writes, and database recovery each require explicit approval.
- Promote only a full commit SHA that passed CI and exact-SHA staging tests.
- Do not use production users or production data in ordinary staging tests.
- Restore production data only into a temporary, private, access-restricted recovery database, then destroy it after the rehearsal.
- Stop on any mismatch. Do not infer provider state from repository configuration.

## Required evidence before promotion

Record the following without secret values:

- candidate full SHA and CI run URL;
- staging service, staging database, staging URL, and live staging SHA;
- production service and production database identity;
- production database plan and point-in-time-recovery window;
- current logical-backup/export identifier, creation time, and checksum if downloaded;
- latest successful restore-rehearsal timestamp and recovery-database identifier;
- production required environment-key names and whether each value is nonempty;
- notification destinations and a received test notification;
- external health monitor URL, interval, and a received test alert;
- rollback owner and decision timestamp.

## Required production configuration keys

Read back key names and nonempty status only. Never display values.

- `NODE_ENV` (`production`)
- `DATABASE_URL`
- `DATABASE_SSL_REJECT_UNAUTHORIZED` (`true`)
- `JWT_SECRET`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `CORS_ORIGIN`
- `FRONTEND_URL`
- `DEEPSEEK_API_KEY`
- `REVIEWER_LOGIN_ENABLED` (`false`)

Production must not define staging-only `DATABASE_SSL_MODE=disable`.

## Backup gate

### Provider recovery capability

The production database provider and exact database identity must be explicitly designated before this section is executed. A branch named `production` inside a development project is not sufficient evidence that the project is the production datastore. If Neon is selected for production, use a separate production project (recommended) or another clearly isolated resource, and record its project, branch, region, plan, and connection target without recording connection strings.

1. Confirm whether production should start empty or must receive existing real Mini Program data. If real data exists elsewhere, stop and design/verify a migration and reconciliation before cutover.
2. Record the production provider, project/database, root branch, region, plan, and status without recording credentials.
3. Confirm point-in-time recovery is available and set a recovery window appropriate for production (at least seven days when supported).
4. Open the provider’s backup/restore page and verify the designated production resource is eligible for PITR and snapshots/backups.
5. Create a named baseline snapshot after migrations and before traffic, then record its identifier and creation time. Do not restore it into the active production resource during readiness testing.
6. If the available plan cannot meet the selected recovery-point objective, stop and upgrade/configure it before promotion.

For Neon, documented limits currently include a six-hour history window on Free, up to seven days on Launch, and up to thirty days on Scale. Manual snapshots are available on all plans; scheduled snapshots require a supported paid plan.

### Create and verify a current logical backup

A Neon snapshot/PITR window is the durable provider recovery layer. A separate `pg_dump` verifies portability and supports disaster recovery. Place the production URL in an ACL-restricted file outside the repository, create a custom-format archive in an encrypted/access-restricted backup directory, calculate its checksum, and verify that `pg_restore` can list it:

```bash
URL_FILE='C:/secure/edunet-secrets/production-db-url.txt'
BACKUP_FILE='C:/secure/edunet-backups/edunet-<UTC timestamp>.dump'
DB_URL=$(tr -d '\r\n' < "$URL_FILE")
"C:/Program Files/PostgreSQL/18/bin/pg_dump.exe" \
  --dbname="$DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE"
unset DB_URL
test -s "$BACKUP_FILE"
sha256sum "$BACKUP_FILE"
"C:/Program Files/PostgreSQL/18/bin/pg_restore.exe" --list "$BACKUP_FILE" >/dev/null
```

A command exit code is insufficient evidence. Require a nonempty archive, a checksum, and a successful archive listing.

## Restore rehearsal gate

### Recovery target requirements

The rehearsal target must be:

- a newly created database used only for recovery testing;
- private and access restricted;
- named with `rehearsal` or `restore-test`;
- empty before restore;
- on a PostgreSQL major version compatible with the source;
- never connected to staging or production services;
- destroyed after evidence is captured.

### Restore procedure

1. Obtain separate explicit approval for the rehearsal because the temporary database will contain production data.
2. Put its external URL in an ACL-restricted file outside the repository.
3. Connect read-only first and verify `current_database()` contains `rehearsal` or `restore_test`.
4. Verify the target has no application tables.
5. Restore the current logical backup.
6. Verify schema and row-count invariants without printing personal data.
7. Run consistency checks in a read-only transaction.
8. Record backup checksum, recovery target identifier, start/end timestamps, and verification results.
9. Delete the recovery database and verify it is no longer reachable.
10. Delete the temporary URL file.

Example verification and restore:

```bash
TARGET_URL_FILE='C:/secure/edunet-secrets/rehearsal-db-url.txt'
BACKUP_FILE='C:/secure/edunet-backups/<verified backup>.dump'
TARGET_URL=$(tr -d '\r\n' < "$TARGET_URL_FILE")
DB_NAME=$("C:/Program Files/PostgreSQL/18/bin/psql.exe" "$TARGET_URL" -Atc 'select current_database()')
case "$DB_NAME" in
  *rehearsal*|*restore_test*) ;;
  *) echo 'Refusing restore: target is not a rehearsal database' >&2; exit 1 ;;
esac
TABLE_COUNT=$("C:/Program Files/PostgreSQL/18/bin/psql.exe" "$TARGET_URL" -Atc \
  "select count(*) from information_schema.tables where table_schema='public'")
test "$TABLE_COUNT" = '0' || { echo 'Refusing restore: target is not empty' >&2; exit 1; }
"C:/Program Files/PostgreSQL/18/bin/pg_restore.exe" \
  --dbname="$TARGET_URL" \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "$BACKUP_FILE"
"C:/Program Files/PostgreSQL/18/bin/psql.exe" "$TARGET_URL" -v ON_ERROR_STOP=1 -Atc \
  "select count(*) from information_schema.tables where table_schema='public';
   select count(*) from information_schema.columns
     where table_schema='public' and table_name in ('students','daily_progress','weekly_feedback');"
unset TARGET_URL
```

Do not print table rows or user fields. Counts and schema metadata are sufficient.

## Application promotion

1. Confirm the candidate SHA still equals the reviewed, remotely CI-approved, staging-live SHA.
2. Confirm no tracked changes occurred after review.
3. Confirm all backup, restore, monitoring, and configuration gates above are current.
4. Obtain separate production-deployment approval naming the exact SHA and production service.
5. Deploy that exact SHA with automatic deployment disabled.
6. Confirm the pre-deploy migration succeeds before new traffic.
7. Read back the live production SHA.
8. Run public and harmless authenticated smoke checks.

## Application rollback

Use this when the new application is unhealthy but the migration remains backward compatible.

1. Stop promotion and declare an incident.
2. Record the failed live SHA and first fatal log line.
3. In Render, choose **Deploy a specific commit** for the last verified production SHA.
4. Do not use **Clear build cache & deploy** unless cache corruption is proven.
5. Wait for health checks and read back the active SHA.
6. Probe `/api/health`, the frontend root, authorization rejection, and one harmless feature route.
7. Keep automatic deployment disabled.

Application rollback does not reverse a database migration.

## Database recovery or rollback

Use this only when data integrity is affected or a migration is not backward compatible.

1. Stop application writes or place the service in maintenance mode.
2. Preserve logs and record the incident timestamp.
3. Obtain explicit database-recovery approval.
4. In Neon, use Time Travel Assist or a read-only historical branch to verify the target timestamp before changing production.
5. Prefer a multi-step restore or snapshot-derived branch so the recovered state can be validated without overwriting the active production branch.
6. Compare schema metadata and aggregate counts; do not expose records.
7. Finalize/swap the recovered Neon branch only after validation and approval. Neon preserves the prior branch as a backup branch.
8. Confirm the Render production service still resolves the expected Neon connection, then deploy the compatible application SHA if needed.
9. Run health, authentication, and consistency checks.
10. Retain the original database until recovery is confirmed; then follow the approved retention/deletion decision.

Never run ad-hoc reverse SQL against production unless it is a reviewed migration with an independently tested rollback.

## Monitoring and alerting gate

Configure all three layers:

1. **Render service notifications**: email or Slack for deploy failures and unhealthy service events.
2. **External uptime monitor**: HTTPS GET to `/api/health` at least every five minutes from outside Render.
3. **Log retention/streaming**: forward service logs to a controlled provider or document the Render retention window and daily review owner.

Verification requires a delivered test signal:

- Trigger a test notification through the provider integration where available.
- For the external monitor, use its explicit test-alert function. Do not intentionally stop production.
- Record destination type, timestamp, and receipt confirmation without addresses, tokens, or webhook URLs.

Minimum alert response:

- health failure: acknowledge within 15 minutes;
- deploy failure: inspect the first fatal line and preserve the previous live revision;
- database connectivity or migration failure: block deployment and verify database status before retrying;
- repeated authentication failures: inspect for configuration drift or abuse without logging credentials.

## Final release decision

A `GO` means all evidence above is current for one immutable SHA. It does not itself authorize production deployment. Deployment still requires a separate explicit approval naming the exact SHA and `edunet-api` production service.
