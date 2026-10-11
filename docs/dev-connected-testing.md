# Dev database integration and testing

This workflow runs the existing business API and the built web app against **the development database in the repository's `.env`**. It does not deploy, alter the mini program, or send notifications. The original prototype is untouched.

## Initial connected result — 2026-10-03

The user corrected the Neon endpoint in `.env`. The connection and complete required-column preflight now pass. The API uses `DATABASE_URL`; `DB_HOST` alone does not override it.

- Docker web/API runs at `http://127.0.0.1:3001` with notifications disabled.
- Teacher, admin, parent, and unrelated-parent test accounts were created, with two initial student profiles and assigned subjects. Credentials are in `.dev/accounts.json`.
- **22 connected workflow checks passed**, including daily/weekly CRUD and stale versions, real weekly AI and semester-report AI, admin publication, parent boundaries, XLSX download, and direct database readback.
- **10 additional admin workflow checks passed**: student/binding management, configuration/directory reads, curriculum CRUD, chapter completion, student English settings/reset, grade plans/zero scores, three plan exports, approval/rejection/identity roles, secondary-parent role protection, and real student cascade deletion. Rows created by the admin-only suite were cleaned up by exact ID.
- Chrome extension control verified teacher login, real dashboard data, daily create/edit/reload/soft-delete, teacher and admin weekly edits, admin publication, actual XLSX download, yearly AI report generation, admin report edit/publication, and parent profile/weekly/report/exam/practice reads. Parent views omitted author controls.
- The browser exposed an empty-day bug: `/progress/student` returns 404, while the editor expected null. The client now maps only that specific missing-record response to an empty day, including deletion/reconciliation. Other failures still surface; the mini API response is unchanged.
- **148 offline regression tests / 18 files passed**, along with frontend/new-script TypeScript, focused ESLint, and the Docker build.
- Both the API and Chrome XLSX files passed ZIP integrity/XML parsing. The Chrome download contains the latest admin weekly edit. Its filename is `QA Connected 2026-10-03T06_44_49.245Z_records_2026-10-03.xlsx` in Downloads.

The successful test student is `f3198bb2-6ba2-47ab-b324-fdbe2cc93bc0`. The browser-generated yearly report is `4191031e-6310-4533-889a-90ab0836652c`. The initial failed smoke run left another isolated QA student with a daily row in its bin; it did not overwrite pre-existing records. `.dev/runs/` preserves earlier smoke results.

Real AI generation is confirmed, not guaranteed content accuracy. The yearly sample inferred weak learning continuity from sparse records; the administrator replaced its overall comment before publication. The subsequent UX checkpoint below adds explicit sparse-data guidance and assigned-subject filtering; broader AI content review remains necessary.

## Latest UX and subject-scope verification — 2026-10-03

The updated student workspace is running in Docker Desktop at `http://127.0.0.1:3001`. The current successful QA student is `3d390ec6-5aa7-4d86-8217-85e8796cccea` (`QA Connected 2026-10-03T08:04:33.961Z`); open it from Students. Existing credentials in `.dev/accounts.json` still apply. Teacher rows are in `public.teacher`, admins in `public.admins`, parents in `public.parents`, and student profiles in `public.students` in the configured Neon database.

- **155 offline tests / 19 files passed**, with frontend TypeScript, focused ESLint, server-helper TypeScript, and a successful Docker build.
- **22 connected checks passed again**, including actual weekly/report AI, publication, parent access boundaries, XLSX, and database persistence. The earlier ten admin-only checks were not repeated in this UX pass.
- Chrome verified persistent subject/chapter expansion after save; assigned-only daily/exam/practice subject choices; daily save/reload with its practice intact; a zero-score exam; daily cards inside weekly feedback; desktop/mobile navigation; and parent read-only weekly/report pages.
- Existing AI handlers now use assigned-subject inputs and explicit sparse-data guidance. The new weekly output correctly avoided treating unrecorded dates as absences; generated report subject sections matched the two assignments. Saved historical reports and subjects remain visible.
- `.dev/ux-review.json` records these browser observations and screenshots. `.dev/api-results.json` contains the latest connected results. The new synthetic student's records remain available for inspection.

This pass added no business endpoints. It retains the established color scheme and mini-program API contracts. Full release acceptance and the previously documented identity/reviewer/security decisions remain separate.

## Run against the configured dev database

From a terminal:

```sh
cd /Users/xiaoyangchen/Downloads/edunet
npm run dev:db:check && npm run dev:seed && docker-compose up --build -d --wait --force-recreate
```

This Mac has `docker-compose`; on installations with the Compose plugin, `docker compose` is the equivalent. Docker must be running. No migration is applied automatically. If the schema check lists missing tables/columns, review the matching migrations before continuing.

Open `http://127.0.0.1:3001`. Use the generated email/password values in `.dev/accounts.json`:

- `teacher`: normal login, Teacher role.
- `parent`: normal login, Parent role.
- `admin`: Administrator login.
- `otherParent`: negative access-control checks.
- `student` and `otherStudent` are bound student profiles; the existing backend has no separate student login role.

The manifest is gitignored, mode `600`, and tied to a database fingerprint. Re-running the seed reuses its UUIDs and does not overwrite existing accounts. It creates two synthetic parent accounts so cross-child access can be tested, and assigns active English/required subjects plus an available generic subject to both test students. An active ENGLISH catalog entry is required. All test addresses end in `example.test` and have no WeChat identities.

Run the connected API test:

```sh
npm run test:connected -- --ai
```

`--ai` makes real requests to the configured AI provider with the new synthetic student's data; provider usage charges may apply. Without `--ai`, the suite exercises manual report creation and explicitly records AI as skipped. It never claims the AI path passed in that mode.

The test refuses non-loopback origins, checks that server and local `.env` identify the same database, and requires notifications disabled. Every run creates a fresh QA student bound to the test parent; its created records remain for browser inspection. It does not overwrite existing students or retry ambiguous mutations automatically.

Evidence stays local:

- `.dev/api-results.json`: named results, failures, and created record IDs; no tokens/passwords.
- `.dev/student-records.xlsx`: downloaded workbook when the export step succeeds.
- `.dev/accounts.json`: test login credentials. Do not commit or share this file.

To use a different port, set the same port for startup and tests:

```sh
WEB_PORT=3011 docker-compose up --build -d --wait --force-recreate
TEST_BASE_URL=http://127.0.0.1:3011 npm run test:connected -- --ai
```

After any `.env` update, recreate the container with `docker-compose up -d --wait --force-recreate`; restarting a process alone will not load new Compose environment values. `docker-compose down` stops this stack. Keep its named volume for stable dev sessions.

## VS Code: Rebuild and Reopen in Container

Open `/Users/xiaoyangchen/Downloads/edunet` in VS Code and keep the selected Docker engine running. If the standalone Compose app is running on port 3001, stop it from a **Mac terminal** first:

```sh
cd /Users/xiaoyangchen/Downloads/edunet
docker-compose stop
```

Use **Shift + Command + P → Dev Containers: Rebuild and Reopen in Container**. The development container mounts this repository at `/app`, supplies Node 22, Bash and Git, and runs `npm ci` into a container-only dependency volume. It no longer references the removed `frontend` Compose service. The first build/install requires network access. The standalone Compose workflow above remains available separately.

Once setup completes, open a **VS Code terminal inside the container**:

```sh
npm run dev:web
```

Open `http://localhost:3001`. VS Code forwards port 3001 to your Mac; both the browser and the WeChat DevTools simulator can use `http://127.0.0.1:3001/api`. Vite serves the source with hot reload and proxies `/api` to the internal API at `127.0.0.1:3003`. Port 3003 does not need to be forwarded. The API reads the mounted repository's `.env`, forces notifications off, and uses its configured development database. No database container or database studio is launched.

Press **Control + C** in that terminal to stop both servers. The development workspace stays open; run `npm run dev:web` again to restart. Closing the VS Code remote workspace stops the development container. Do not run `docker-compose up` inside it: the app is started directly with Node, and the workspace intentionally does not mount the Docker daemon socket.

Code changes in the mounted source appear on the Mac. Frontend changes reload automatically; restart `npm run dev:web` after backend or `.env` changes. Never put database credentials in `devcontainer.json`. `npm run dev` is a different, older command that also starts database studio; use `dev:web` for this workflow.

### Dev Container validation — 2026-10-05 (Singapore)

VS Code's installed Dev Containers CLI (0.89.0) successfully built and started the configuration, including its `npm ci` lifecycle step. Verified Node 22.23.3, Bash, Git, the `/app` source bind mount, and a separate Linux `node_modules` volume. Inside this container, `npm run dev:web` served the Vite page and proxied `/api/health` successfully; the database fingerprint matched the existing dev QA manifest, notifications were disabled, and the read-only database schema check passed. An actual terminal Control+C stopped both listeners (3001 and 3003) while the workspace container remained running. All **155 offline tests in 19 files** passed in that Linux environment. Changed launcher/proxy lint, launcher syntax, and `git diff --check` passed. The package lock and original prototype were unchanged.

The existing VS Code window had an unsaved file, so it was not reloaded or reopened automatically. VS Code GUI attachment and its host-side port forwarding were not exercised in this checkpoint; the configuration/build/lifecycle and internal application/proxy were validated through the extension's CLI. The app was left stopped so port 3001 is available when the user reopens the workspace and starts it. No business records were inserted/edited/deleted during this repair. Local evidence: `.dev/devcontainer-results.json`.

## What the connected suite covers

1. Teacher/admin/two-parent login and a new isolated student's parent binding.
2. Subject catalog and student assignment with `resetProgress: 'keep'`.
3. Daily creation, persisted fetch, admin edit, stale-version conflict, soft deletion and bin restoration.
4. Exam and standalone practice creation, admin updates, and parent reads, including a zero practice score on creation.
5. Optional weekly AI, weekly creation/fetch, hidden draft, admin edit, conflict, soft deletion/restoration, review queue, publication and parent visibility.
6. Optional structured semester AI generation with persisted ID, then admin review/edit/finalize/publication and parent read. Without AI, a manual draft exercises the same review path.
7. Parent own-child profile access, unrelated-child denial, parent write denial, and admin-only export.
8. Actual XLSX HTTP download and direct dev-database readback confirming persisted daily/weekly/report records.

The script stops at the first failed dependency, preserves evidence and records, and does not certify unexecuted scenarios. Yearly AI was additionally verified through Chrome. Full English/custom-task variants, every administrative edge case, concurrent transaction rollback, and every historical migration case still need additional connected acceptance; the smoke suite is not the entire parity audit.

## Additional admin checks

```sh
npx tsx scripts/dev/admin-smoke.ts
```

This guarded suite creates its own temporary student, curriculum, grade plan, and synthetic identity. It checks admin writes and removes only those exact created rows. It exercises account role APIs with a fabricated QA WeChat identity; it never calls WeChat login or sends a notification. Results are in `.dev/admin-results.json`; exported workbooks stay in `.dev/`.

## Browser acceptance after the API checks

Use Chrome through the browser extension, with these real test accounts. The WeChat dev tools remain a read-only reference; screen inspection is only needed for unclear visual behavior.

- Teacher: open the new QA student from the test results, create/edit/delete another daily record; verify assigned English and generic subjects and standalone practices. Review weekly sources, generate/adopt AI, save, reload, edit and delete/restore a draft.
- Admin: open review queue, edit weekly feedback and publish; review/update/finalize/publish the generated report. Download **All student records XLSX** from the student's profile.
- Parent: sign out and in as the bound parent; verify child's profile, published feedback/report, exams and practices. Confirm the other parent cannot access that student.
- Administration: continue through the implementation plan's curriculum, configuration, plans, account approvals, parent bindings, and bin acceptance matrix using synthetic records only.

Do not open the original mini program's mutation actions or send real notifications during any of these checks.

## Runtime changes and limits

The Docker image contains the compiled web app, API, and subject catalog. `.env`, backups, `.dev`, and mini program files are excluded. Compose injects `.env` at runtime and publishes only `127.0.0.1:3001`. A private named volume keeps the dev JWT signing key across restarts; no database container or database studio is launched because the requested database is hosted in Neon.

`npm run dev:connected` is an alternative local API launcher on `127.0.0.1:3003`. It reads `.env`, generates a private stable signing key if absent, and disables notifications/query logging. Serve or develop the frontend separately in that mode; the Docker workflow above runs both together.

The user authorized full admin teaching capability. Former teacher-only exam/paper/chapter/cycle/term dependencies now accept teacher or admin, retain reviewer checks, and still reject parents. The existing teacher-only middleware remains available for other callers. No mini payload names changed.

The new admin-only `/api/admin/students/:studentId/records-export` returns a genuine `.xlsx` workbook with Student, Subjects, Daily progress, Weekly feedback, Exams, Papers, Semester summaries, Yearly summaries, Reports, and Complete record JSON sheets. It excludes soft-deleted records and authentication credentials. The last sheet chunks long JSON for lossless reconstruction; human-readable cells exceeding Excel's limit are clipped. Existing wellbeing `.xls` and other exports remain available.

Known repository-wide issues remain tracked in `webapp-implementation-progress.md`. The Docker dependency audit currently reports 81 existing dependency findings, including 7 critical; no broad dependency upgrade was performed as part of this integration work.
