# Production startup and private staging

The full application runs as one Node 22 web service: Express serves `/api` and
the built Vite SPA. GitHub Pages is an optional manual static preview only.

## Runtime

`npm ci --include=dev`, `npm run build`, then `npm run start:api`.
The startup command validates the signing key, database URL, HTTPS public URLs,
web build and authentication mail configuration. It does not seed data or apply
migrations. Render's `PORT` takes priority over the local `API_PORT`.

`/api/health` is liveness. `/api/ready` checks database access and the account-mail
schema, returning only `{ok:true}` or a 503. Use readiness as the deployment health
check. SIGTERM stops the mail polling timer and drains HTTP requests.

Migrations use PostgreSQL with certificate verification, a release advisory lock
and a bounded connection/lock wait. Neon HTTP remains the application query
driver; its prepared statements cannot bootstrap the legacy multi-statement SQL.
For Neon, the migration runner derives the direct endpoint from a pooled URL so
its session advisory lock and timeout remain on one PostgreSQL connection.

The Docker image starts this same production command as a non-root user.
`docker compose up --build` explicitly uses the separate development launcher;
outbound authentication mail remains in its private local test inbox.

## Separate private staging

Use `render.staging.yaml` or create a separate Render service with those settings.
The staging database must be a new empty Neon project containing synthetic data;
never supply the live or shared development connection string. Signing and
staging-access secrets must also be separate.

Set `DEPLOYMENT_ENV=staging`, `STAGING_ACCESS_USERNAME` and a random
`STAGING_ACCESS_PASSWORD` of at least 24 characters. Missing credentials prevent
startup. The gate protects HTML, assets and API routes. Initial Basic login sets
an eight-hour Secure, HttpOnly cookie so API Bearer authentication remains usable.
Browsers enter these existing credentials through a staging-only access form;
it checks the request origin and limits password attempts. Basic authentication
also works for API verification. Only GET/HEAD health/readiness responses are public. Responses prohibit caching
and indexing. An HTTPS origin is required for the gate cookie.

Free Render staging runs migrations during its build against the isolated
database. Auto-deploy is off. Deploy a recorded commit only after release checks
pass. `AUTH_MAIL_ENABLED=false` and `NOTIFICATIONS_ENABLED=false` are the initial
staging defaults. Enable Resend only for an explicitly approved inbox test.
Free Render may sleep, so it is not the production background-mail reliability
configuration. The existing Neon organization may bill staging usage under its
current plan; do not upgrade either provider as part of staging setup.

## Production release still requires separate approval

Run `npm run db:migrate` as a release step after identifying and backing up the
production database, before starting the new revision. For an existing database,
also run `npm run db:migrate-admin-passwords` to convert legacy administrator
credentials; this is never performed automatically at startup. On a paid Render
service, use a pre-deploy migration command. A free service does not support that
phase, so do not assume `render.yaml` performs production migrations.

Configure Resend's verified sender, a stable signing/encryption key and exact
HTTPS public URLs in provider secrets. Verify role boundaries, student privacy,
practice XLSX exports and recovery on the hosted revision. OAuth credentials,
dependency/security triage, backup/restore and alerting are separate launch gates.
See `production-operations.md` for production recovery and rollback controls.
