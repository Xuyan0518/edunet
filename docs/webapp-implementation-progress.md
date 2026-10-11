# Web application implementation evidence

Date: 2026-10-03. Source baseline: `88fd906240ebd82663041759db5ca416331fea84`.
Working repository: `/Users/xiaoyangchen/Downloads/edunet`.

This records implemented code and observed validation, not full parity acceptance or release approval. P0/P1 foundations and the independent P3–P8 workflows are implemented; P2 browser identity and parts of P9 remain open below. The supplied plan/audit and original prototype were not edited. Mini-program source is unchanged. No production database, live business API, real notification service, or deployment was used.

## Reviewable implementation areas

| Area | Main files | Implemented behavior |
|---|---|---|
| Foundation/session | `src/services/http.ts`, `src/features/auth/session.ts`, `src/context/AuthContext.tsx`, `src/app/` | Actual object/array/null/204 response contracts; typed 401/403/409 errors; no mutation retries; identity-scoped queries; server-verified profile restore; approval/reviewer metadata; unavailable recovery; logout clears private cache/drafts/seen. |
| Shell/auth | `src/components/layout/`, `src/pages/Login.tsx`, `src/pages/RetiredAuth.tsx`, `src/App.tsx`, `src/index.css` | Forest/ivory responsive shell, Chinese/English navigation, keyboard/focus handling, role guards, canonical and compatible legacy URLs; retained password/admin/reviewer login; honest retired signup/email/password/URL-token pages. |
| Students/parents | `src/pages/{Dashboard,Students,AddStudent,Parents,StudentProfile}.tsx`, `src/features/studentSave.ts` | Role-scoped queues, roster/filter/child switching, multi-parent creation/edit, ID capture and assignment-stage reconciliation, parent directory/binding protection, confirmed student deletion. |
| Curriculum/settings | `src/pages/{Curriculum,EnglishSettings,Settings}.tsx`, `src/features/settings/`, `src/components/ui/SubjectTopicsPanel.tsx` | Levels/subjects/topics, hierarchy protections, textual order, assignment/progress, global/student task snapshots/reset and eligible-new-day study defaults. |
| Daily/English | `src/features/progress/`, `src/storage/dailyDrafts.ts` | Historical adapters; attendance/summary/narratives; canonical and custom English tasks, per-exercise scores/losses; separate historical embedded papers; complete day-paper batch; staged save and read-only unknown-outcome reconciliation; manual namespaced drafts; delete; date/tab/link/reload safeguards. |
| Assessments | `src/pages/Assessments.tsx`, `src/features/assessments/` | Exam scheduling/subject scores, zero scores, versioned edits/deletes; standalone papers, dictionary creation, required evaluations and actual integer paper score validation. |
| Weekly | `src/features/weekly/`, `src/components/shared/TextPreview.tsx` | Sunday–Saturday authoring, historical daily/paper sources, retained legacy fields, AI draft adoption/discard without save, versioned persistence/delete, preview/copy/text download. |
| Planning | `src/pages/Planning.tsx`, `src/pages/admin/PlanSummaries.tsx`, `src/features/planning/` | Global grade plan upsert, student completion, server-returned cycle, zero-score completion, current cycle/term summaries and three authenticated exports with actual XLS/XLSX formats. |
| Reports | `src/pages/Reports.tsx`, `src/features/reports/` | Legacy quarter/year editors, unsaved AI suggestions, persisted structured generation with returned ID, list filters, final-first detail parsing, nested-field-preserving edits, truthful final/visibility states, publication recovery, Markdown preview/copy/download, authenticated dashboard copy-link fallback and date-range export. |
| Administration | `src/pages/admin/{Accounts,ReviewQueue,AdminDashboard}.tsx`, `src/features/admin/` | Approve/reject, server-grouped identities and role editing, four-type content review, aggregate student view/CSV, complete student fetch before parent edits; daily/weekly/summary drilldowns reuse shared editors. |
| Recovery/local state | `src/pages/StudentBin.tsx`, `src/features/bin/`, `src/storage/seen.ts` | Seven record types in five bin groups, restore/permanent-delete confirmation and read-back, truthful retention/visibility; account/student-specific seen markers only after successful views. |

The initial implementation did not introduce a new business endpoint namespace, database schema, identity provider, notification channel, or report workflow state. The subsequent authorized dev integration adds local Docker configuration and one admin-only student XLSX endpoint; see the latest checkpoint below.

## Narrow backend corrections

- Profile DTO retains authenticated reviewer metadata. Existing daily/weekly PUT and report GET check the original row's student against reviewer scope. Registered-handler tests cover both rejection and legitimate demo/teacher behavior.
- Teacher account PUT now uses the same `authenticate` and `requireAdmin` boundary as adjacent teacher management routes (I01). No active mini/browser caller of the formerly unauthenticated update was found; self-profile editing retains its existing profile endpoint. Registration tests verify anonymous 401 and wrong-role 403.
- `server/services/studentDeletion.ts` groups the complete student relation cascade in one installed Neon driver's `batch` transaction, with a student row lock and student action lock. Includes active/deleted papers, configurations, targets, plan records, exams and scores, summaries, reports, subjects and both parent bindings (I02).
- `server/services/userRoles.ts` checks primary **and secondary** parent bindings and groups all three role-table changes in one batch (I05). Existing self/last-admin checks remain; the precheck does not certify concurrent last-admin protection.
- `server/services/paperBatch.ts` replaces a day's active papers with a transactional delete/insert under the existing student lock/version check (I06). Empty sets preserve the prior response shape. Soft-deleted papers are excluded. Daily + paper saves still comprise **two** business operations; the editor exposes the partial stage and never claims an atomic combined save.

Transaction tests exercise SQL construction and the installed driver's single transaction invocation, including rejected transactions/no retry. They are **not** real PostgreSQL rollback, foreign-key race, or multi-client integration tests.

## Validation evidence

- `npm run test:web`: **132 passed across 17 files**. Covers transport/download errors, sessions/permissions, student reconciliation, settings/historical adapters, curriculum, daily drafts and partial writes, English snapshots, weekly preservation, exams/papers, planning, report formatter parity/publication recovery, seven-type bin identity, admin/seen contracts, registered authorization, and transactional service boundaries.
- App TypeScript check (`tsconfig.app.json`): passed. Separate TypeScript check of the three transactional services: passed.
- Focused ESLint on the new domains, shared components/services, new pages/admin pages, tests and transactional helpers: passed with no errors or warnings at the final checkpoint.
- Full repository lint: **227 errors, 10 warnings**. Existing modified error-bearing files retain the earlier baseline counts (server/index.ts 136, server/auth/userIdentity.ts 1, ProgressForm.tsx 2). A clean repository-wide lint result is not claimed.
- Root `/` and `/school/` Vite builds: passed with `VITE_API_URL=/api`, test mode and an empty environment directory. Both generated the correct base href and an identical `404.html` fallback. Confirmed dirty-form navigation strips the deployment prefix before passing a path to React Router; a regression test covers root/subdirectory/prefix-boundary cases. The fallback plugin now respects the configured output directory.
- `git diff --check`: passed. `git diff --name-only -- miniprogram`: empty.
- Original prototype SHA-256: `8bb4f05106f3031ee2ebbd979cd45c4e6652551b6de5c4cf258cab603531af8a`.
- Build warnings: old Browserslist data and the approximately 712 kB main JS chunk. No dependency upgrade was performed.

Web tests block HTTP/socket traffic and real database access. Handler suites mock dotenv, notifications, action locks and the database and invoke registered handlers without starting the business API listener.

### Observed browser journeys

Only the in-memory `tests/web/preview.mjs` fixture server on `127.0.0.1:4317` was used, with no API proxy, application environment files, database or notification sends. Fixture state resets on restart; it is not a backend emulator or proof of production behavior.

- Teacher password login/admin-route denial; parent two-child list with a secondary binding, create denial/read-only chapters and child switch/reload.
- Profile edit/reload; manager student edit retains both parents; parent bind/reload; linked-account delete disabled and unlinked synthetic account deletion/reload.
- Curriculum subject/topic create and reload retain `001.010` order; core/default deletion disabled.
- Student task rename/disable/reorder/zero target save/reload/reset; admin study-time save/reload using native time input.
- Generic daily create/edit/reload, drafts, required narratives/summary and eligible default attendance; English vocabulary counts saved. Standalone paper zero score saved/reloaded and included in the daily complete paper set.
- Weekly AI suggestion left original text intact until adoption, discard and save/reload; preview and clipboard success.
- Grade plan creation with the server's non-Saturday cycle end; student completed/zero-score record save/reload.
- Structured nested summary/comment edit and reload preserved other sections; legacy review URL selected the correct quarter and save returned pending/hidden.
- All seven bin types displayed; synthetic legacy summary restore removed the row after read-back.
- Synthetic pending-account approval refreshed to approved; all four review queue types linked to their correct workspaces.
- Structured report publication changed draft/hidden to final/visible with read-back. After logout and parent sign-in the report was readable without author controls.
- Chinese/English shell; 390×844 mobile drawer and focus restoration; 1280×900 curriculum/report layouts. Report spacing/typography was corrected during visual review.

Screenshots are saved in the chat visualization directory, including `edunet-report-fixture.png`. To reproduce the isolated preview: `npm run preview:web:fixtures`. Synthetic accounts: `teacher@fixture.test`, `manager@fixture.test`, `parent@fixture.test`, `admin@fixture.test`, password `fixture-only`; use the admin entry for admin. Do **not** use the general `npm run dev` for isolated QA: it also starts the business API and database studio.

## Feature acceptance status

“Implemented” means the route/action and code exist; it does not mark every plan acceptance scenario passed.

| Feature IDs | Status / acceptance still required |
|---|---|
| F01 | Browser WeChat bridge not implemented; D01 provider/handoff choice required. No fake QR/exchange flow. |
| F02 | Login/profile/original-row scope implemented/tested. D06 global reviewer write policy unresolved; UI hides global catalog/planning. |
| F03–F08, F13 | Session/profile/subscription guidance/home/queues/roster/child switch implemented. Real provider/account continuity and full role matrix remain. |
| F09–F12 | Student/multi-parent/binding/directory and transactional deletion implemented. Real database rollback/concurrency acceptance remains. |
| F14 | Namespaced local indicators implemented/tested. No cross-device or mini-storage migration claim. |
| F15–F18 | Catalog/assignments/progress implemented. Assignment removal/all reset intentionally unavailable; preservation deviation below. |
| F19–F23 | Daily history/month/page, full teacher editor, English/papers/staged recovery/drafts implemented. Full historical fixture matrix, native browser back/forward dirty-state blocking, and D04 admin dependency acceptance remain. |
| F24–F26 | Task settings/reset/study initialization implemented and exercised; complete server merge/reset matrix remains. |
| F27–F31 | Weekly/AI/source/preview and exam/paper workflows implemented. All two-client stale/duplicate/delete/notification scenarios remain. |
| F32–F35 | Planning/completion/summaries/downloads implemented. Real workbook content/format acceptance across all admin outputs remains. |
| F36–F41 | Legacy/structured reports, generation, publication, previews/range export implemented. Real AI/configuration failures and complete nested historical/report parent projection matrix remain. |
| F42–F46 | Aggregate retained, shared editor drilldowns, accounts/review/wellbeing export implemented. Aggregate fixture coverage, role-removal concurrency, all export payloads and full bilingual polish of the retained aggregate view remain. |
| F47 | All seven types, restoration and permanent-delete UI implemented. Actual unique-collision/retention/concurrent restore-delete integration acceptance remains. |
| F54 | Existing password/admin/reviewer entries retained; retired forms and URL-token handoff replaced with explanations. Credential migration remains separate. |
| F48–F53 | Existing backend/optional/operational capabilities retained; no unrequested new browser screens. |

## Decisions, deviations and release blockers

1. **D01 (pending question):** mini-authorized browser handoff versus approved website WeChat application/domain. Need actual provider availability and account-mapping evidence before implementation.
2. **D04 (authorized, connected acceptance pending):** the user explicitly requested full admin capability. Teaching dependencies now accept teacher/admin in both backend guards and the web capability matrix. Registered-route tests cover admin acceptance and parent rejection. Real database/browser acceptance is blocked by the dev database credentials.
3. **D06 (pending question):** deny reviewer global grade-plan/cycle/term writes while retaining demo writes. UI restrictions are not a server security boundary; remaining backend scope is a release blocker.
4. **Assignment reset:** modified assignment flows use `resetProgress: 'keep'`. Automatic approval review rejected the initial progress-deleting `removed` behavior; the implemented alternative preserves progress. This is an explicit deviation, not acceptance of removed/all reset parity.
5. **Paper score contract:** existing server validates integers; web uses that behavior rather than an audit/prototype assumption that decimal values are accepted and truncated.
6. **Historical papers:** new paper authoring goes through the day batch. Editing an existing daily record retains its separate embedded historical papers instead of stripping and losing them. A regression test covers this.
7. **Report editor fields:** the active mini bindings edit `teacherComment`/`teacherAnnualComment`; the web preserves that verified behavior and all executive/nested fields, rather than substituting the plan's proposed executive field binding.
8. **Security I04:** browser token logging/URL-token ingestion removed. Signing/reviewer credential defaults, plaintext password migration and operational diagnostic exposure require the separate security/configuration review identified by the plan. No live exposure assessment or diagnostic call was performed.
9. **P9:** no isolated PostgreSQL service was available. Complete DB rollback/races, mini-to-web data interoperability, notification idempotency, all workbook exports and the entire F01–F47 acceptance matrix are not certified. Existing server publication/parent-projection/retention semantics remain as audited, with accurate UI labels.
10. **P10:** no staging/production deployment, cutover, hosting or real provider setup performed. Passing local checks does not authorize release.


## Latest dev integration checkpoint — 2026-10-03

Supersedes the earlier fixture-only and D04 status above. The user authorized dev database writes, test accounts, Docker/API startup, real AI on synthetic records, and Chrome extension browser actions. Production databases/APIs, live mini writes, notifications, deployment, and prototype modifications remain prohibited.

- Implemented a local-only Docker web/API service using runtime `.env`, a private named volume for its dev signing key, disabled notifications, disabled query logging, and required subject catalog assets. Built and started successfully; HTTP health and Chrome-served login verified. The named volume fixes Colima's host bind-mount ownership error.
- Added `dev:db:check`, `dev:seed`, `dev:connected`, and `test:connected` scripts. The guarded suite rejects nonlocal/unmarked servers and mismatched database fingerprints; seed data has synthetic addresses, no WeChat IDs, and a private local manifest. No schema changes are automatic.
- Expanded the former strict-teacher teaching endpoints and web capabilities to administrators, preserving teacher access, reviewer scope checks and parent denial.
- Added the admin student XLSX endpoint and profile download control. Registered handler tests inspect actual ZIP/XML output, ten worksheets, structured activities, preserved whitespace and admin-only access. Long raw JSON is chunked without loss.
- Latest local regression total: **144 tests / 18 files**; frontend/new-service/dev-script TypeScript and focused ESLint passed. Earlier 132-test results describe the prior checkpoint.
- **Connected blocker:** both `npm run dev:db:check` and `npm run test:connected -- --ai` failed with PostgreSQL password authentication for `neondb_owner`. The suite stopped before seeding/login/business mutation/AI. No real accounts, daily/weekly records, reports, or AI outputs have been created, and real workbook download/role journeys are not yet validated.
- Chrome extension control opened `http://127.0.0.1:3001/login`, changed language, and submitted a synthetic connection-check login. The real app displayed failure. This is evidence of startup and error handling only, not successful authenticated integration.
- Read [dev-connected-testing.md](dev-connected-testing.md) for exact commands, coverage, pending acceptance and credential-safe recovery. Test results are local in `.dev/api-results.json`.


## Connected acceptance checkpoint — 2026-10-03, after corrected Neon endpoint

This checkpoint supersedes the credential blocker above. The password was unchanged; the user replaced the mismatched hostname in `.env`. The designated dev database now connects and all required schema columns exist.

- Seeded teacher/admin/two-parent accounts and two student profiles with subjects. Local credentials remain private in `.dev/accounts.json`.
- `npm run test:connected -- --ai`: **22/22 connected checks passed**, with genuine weekly AI and persisted semester AI, publication, role/scope boundaries, daily/weekly CRUD and conflicts, exams/practices, XLSX, and direct DB readback. `.dev/api-results.json` records IDs/results.
- `npx tsx scripts/dev/admin-smoke.ts`: **10/10 additional admin groups passed**. Includes real curriculum operations, student English settings, plans, zero-score completion, three export endpoints, pending approvals/rejection, cross-role account changes and linked-secondary-parent protection, and a successful real transactional student cascade. Only this suite's newly-created rows were removed. `.dev/admin-results.json` records the evidence.
- Chrome extension (not screen recording) performed teacher daily create/edit/reload/delete, teacher/admin weekly edit and publication, XLSX download, real yearly AI generation, report edit/finalize/publication, and bound-parent profile/weekly/report/exam/practice reads. Parent views had no authoring controls.
- The Chrome daily journey found a real missing-day mismatch. `loadDailyRecord` now handles the existing endpoint's specific 404 as an empty record; initial load, delete confirmation and uncertain-save reconciliation share it. Four regression cases cover the empty response and propagation of other 403/404/500 errors. The mini endpoint is unchanged.
- **148 offline tests / 18 files passed**; app TypeScript, changed daily/dev-script lint, and Docker build passed. The later admin script separately passed TypeScript and ESLint before its connected run. The earlier full-repository lint baseline remains unresolved.
- Real downloaded workbooks passed ZIP/CRC/XML checks; the ten-sheet student export includes generated record IDs, and the browser download includes the latest weekly admin edit.
- Browser evidence: `edunet-dev-daily.png` and `edunet-dev-parent-report.png` in the chat visualization directory. Detailed paths/IDs and completed browser actions are in `.dev/browser-results.json`.
- Remaining limits: this is not certification of every F01–F54 edge case, concurrent rollback/race behavior, all historical English/custom-task payloads, or release readiness. AI output requires review: the yearly test over-inferred annual learning continuity from one day of records, and the administrator corrected the overall comment. D01/D06 and other release items above remain outside this connected workflow checkpoint.
- No production API/database, live mini writes, real notifications, prototype edits, or deployment were used. The configured dev database's pre-existing business records were read but not edited by these tests.

## Student workflow UX checkpoint — 2026-10-03

Implemented in the existing repository after the user's six usability findings:

- Subject progress remains mounted during refresh, retains open subject/chapter state after status changes, and prevents duplicate in-flight toggles. Failure restores the previous value before reloading.
- A shared student workspace separates Overview, Subject progress, Daily progress, Weekly feedback, Exams, Tests & practices, Reports, and Learning plan. Existing browser links still work. Student switching preserves the current section, and mobile navigation keeps the active tab visible.
- Daily cards now show attendance, study times, summary, subject/task previews, and expandable activity/teacher details. Weekly authoring and parent detail show the week's daily cards and practices before the summary. Closed history cards fetch their source records only when expanded.
- New daily, exam, and practice subject choices use the existing student's assigned-subject endpoint only. English authoring requires an English assignment. Historical unassigned subject values remain readable and can be preserved during an unrelated edit; they cannot be selected for new records.
- Existing weekly, quarterly, and yearly AI handlers filter source activities, papers, and exams by assigned subjects. Newly generated structured report subject sections are filtered too. Attendance rows remain intact, and prompt guidance explicitly forbids inferring absence or learning discontinuity from unrecorded dates. Saved historical reports are unchanged.
- Shared spacing, focus states, cards, responsive layouts, directory controls, and read-only parent views were improved while retaining the forest/ivory color tokens. This pass added browser routes, not business API endpoints or schema changes.

Validation: **155 offline tests in 19 files**, app TypeScript, focused ESLint, targeted server-helper TypeScript, Docker build, and `git diff --check` passed. The existing repository-wide lint/dependency findings remain outside this checkpoint. **22 connected workflow checks** passed again against the configured development database, including real weekly/report AI, admin publication, parent access restrictions, XLSX download, and database readback. The ten additional admin checks documented above were from the preceding checkpoint, not rerun in this pass.

Chrome extension control verified the expanded subject/chapter stays open after a persisted status update; assigned-only daily/exam/practice selectors; daily edit/save/reload with its practice preserved; a new zero-score exam; weekly daily source cards; 390×844 mobile layout without horizontal page overflow; active-tab visibility; and published parent weekly/report views without author controls. Generated report sections contained only English and Lower Secondary G3 Geography, the test student's assignments. The generated weekly text correctly treated missing dates as unknown rather than absence. This is evidence for these scenarios, not certification of every historical payload, concurrent mutation, or AI factual claim.

Latest test student: `3d390ec6-5aa7-4d86-8217-85e8796cccea` (`QA Connected 2026-10-03T08:04:33.961Z`). Its records remain for inspection. `.dev/api-results.json` contains the 22 API results and record IDs; `.dev/ux-review.json` contains the browser observations and screenshot paths. Earlier API results remain under `.dev/runs/`.

Docker Desktop's `edunet-web-1` is healthy at `http://127.0.0.1:3001`. An older Edunet container in the Colima context was stopped to release that same port. No production writes, live mini-program mutations, real notifications, deployment, or prototype changes occurred.
