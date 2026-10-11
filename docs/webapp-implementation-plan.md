# Web app implementation plan: prototype design with mini program feature parity

Prepared: 2026-10-03. Source baseline: Git `88fd906240ebd82663041759db5ca416331fea84`.

This is an implementation specification for future work in the existing React application. Creating this document does not implement the application, change configuration, migrate data, or authorize deployment. No application, business API, database, external identity provider, or notification service was exercised while preparing it.

Reading guide: start with [scope](#1-objective-inputs-and-scope), [UI/routes](#2-ui-translation-and-browser-information-architecture), and [architecture](#3-frontend-architecture-and-reusable-implementation-units); implement the W01–W14 work units; use the [dependency sequence](#19-implementation-sequence-and-reviewable-delivery-units), [verification plan](#20-verification-plan-and-definition-of-done), and [feature checklist](#appendix-a-feature-to-work-unit-completion-checklist) to track completion. Existing facts, proposed file/route organization, optional additions, and unresolved decisions are labeled separately.

## 1. Objective, inputs, and scope

Deliver a browser application that uses the supplied prototype's visual design and retains the current mini program's reachable functionality and existing business endpoints. Preserve access to existing records, including legacy activity formats, legacy semester/yearly summaries, secondary parent bindings, and soft-deleted records. Extend and repair the current React application rather than create a second application or duplicate business API.

### 1.1 Sources and precedence

| Input | Use in implementation |
|---|---|
| Current mini program and backend at the revision above | Factual source for current actions, permissions, request/response behavior, validation, side effects, and data compatibility. Source facts are not an instruction to reproduce defects. |
| [Feature and endpoint audit](webapp-feature-endpoint-parity-audit.md) | Contract baseline. `F01–F54` are feature IDs; `C1–C11` are shared contracts; `I01–I12` are separate security/correctness findings. Appendix A lists 34 registered pages/actions; Appendix B lists the backend route inventory, including inactive/retired/operational distinctions. |
| `/Users/xiaoyangchen/Desktop/webapp-prototype.html` | Visual reference for the forest/ivory theme, shell, navigation, cards, tables, tabs, forms, and responsive behavior. Endpoint annotations, role simulation, mock success, and explanatory toasts are not implementation contracts. |
| `/Users/xiaoyangchen/Desktop/webapp-full-transfer-implementation-brief.md` | Earlier proposals evaluated by audit §5. Do not import its conflicting API namespace, permissions, report states, or scope additions as settled requirements. |
| Existing `src/` | Reuse working components, routing, transport utilities, translations, and read views; repair deficiencies identified by the audit. Existing code has not been runtime-certified by this document. |

Reference SHA-256 values at preparation:

- Audit: `4c02685c498a889a84823c271ab3e22de774f44800230868db19053b095bcc8c`.
- Prototype: `8bb4f05106f3031ee2ebbd979cd45c4cf258cab603531af8a`.
- Earlier brief: `80422446b116e85ed2ab53250295cb9d11045715b64538ed31ae54a361af6540`.

The audit's recorded inspection date is 2026-09-13; this plan was prepared later against the same Git revision. The audit and both reference documents remain unchanged. If implementation begins on another revision, review the source diff and update the affected contract assumptions before coding those workflows.

### 1.2 Scope classes

| Class | Included work |
|---|---|
| Baseline parity | Audit F01–F47: active account, student, parent, curriculum, daily, English settings, weekly, assessment, planning, reporting, administration, export, and recovery workflows. |
| Required browser adaptations | Real browser authentication/account continuity, session restore, URL navigation, authenticated downloads, clipboard/file handling, local drafts, local seen markers, and a truthful WeChat subscription handoff. |
| Necessary corrective work | Findings that make an affected workflow insecure or unreliable, tracked separately with before/after tests. Frontend hiding alone cannot fix backend authorization or data-integrity defects. |
| Existing web compatibility | F54: maintain a deliberate disposition for stored-password users, old links, and retired authentication pages; do not silently strand existing accounts. |
| Preserved backend capability, optional new UI | F48–F53: terms/period analytics, explicit cycle targets, dictionary deletion, expired-bin cleanup, low-level account operations, and retained report-preview helpers. Keep APIs available; new UI needs a scope decision. |
| Optional additions | Google login, provider-linking UI, enhanced XLSX products, cloud drafts, audit/revision histories, read receipts, notification center, permission redesign, new report workflow states, and target-model unification. |

Baseline completion cannot be claimed while an active mini program feature is merely hidden, represented by a toast, or indefinitely blocked. A blocker must be resolved or explicitly accepted as a migration exception. Backend-only capability does not require inventing a browser screen to claim mini program parity.

### 1.3 Implementation constraints

1. Reuse existing `/api` business routes and existing records. Do not create `/api/web/v1` copies by default.
2. Preserve wire field names and per-handler behavior. Client service modules may reorganize code without changing the HTTP contract.
3. Use the prototype as a design reference; implement real React state, validation, requests, and persisted reloads. Keep the supplied HTML unchanged.
4. Retain both legacy and structured reports. A new visual presentation does not authorize data conversion or deletion.
5. Distinguish API capability from current UI permission and from desired future policy. Make exceptions visible in the decision register.
6. Do not call diagnostic mail endpoints, start production-connected development scripts, or use real external sends to verify implementation. Future test environments must be isolated and explicitly configured.

## 2. UI translation and browser information architecture

### 2.1 Design system to extract

Implement the final CSS overrides in the prototype, not its earlier overridden palette. The final forest/ivory rules begin at prototype line 6; responsive rules are at lines 54–55. Treat these as source-inspected design references, not a rendered screenshot comparison.

| Element | Implementation direction |
|---|---|
| Main colors | Primary `#1f513e`, secondary `#3e745d`, pale green `#e5eee7`, text `#252a26`, muted `#6f746e`, line `#ddd7c9`, page `#f2efe7`, surface `#fbf8f0`. Preserve amber/red/blue semantic accents from the final overrides. |
| Shell | Forest sidebar, ivory content, account area, breadcrumb/header, current identity, language control, and collapsible mobile navigation. Replace the prototype's role selector with authenticated identity information. |
| Typography | Avenir Next/PingFang/Microsoft YaHei/system sans for UI; Georgia/Songti/serif headings. Respect system fallbacks; do not require a new font service. |
| Surfaces | Consistent cards, 7–11px component radii, restrained shadows, tabs, clear field labels, status badges, horizontal table overflow, and destructive confirmation dialogs. |
| Breakpoints | Preserve the prototype's 1050px layout simplification and 760px mobile sidebar/form behavior. Test long Chinese and English labels and narrow screens. |
| Interaction | Semantic buttons/links, keyboard operation, focus-visible states, labeled controls, dialog focus restoration, accessible errors, and explicit pending/disabled states. Do not depend on hover for actions. |
| Localization | Reuse `src/context/I18nContext.tsx` and `src/i18n/translations.ts`. Chinese is the default prototype language; implement its English toggle consistently across added screens. Do not translate user-authored narrative content or alter stored subject identities. |

Extract tokens into the existing style system and build shared components. Do not mount the prototype as an iframe, transplant its delegated click/toast handler, retain mock user data, or expose implementation endpoint annotations in the production UI. The prototype's explanatory inspector is a design aid, not an end-user feature.

### 2.2 Prototype views and required completion

| Prototype view | Browser implementation and extensions needed |
|---|---|
| Login | Real session flow, pending/rejected/nickname states where supported by the selected identity mechanism, reviewer credentials, and explicit password-user compatibility. Hide unimplemented Google and fake QR success. |
| Dashboard | Role-specific landing; real daily/weekly missing queues, exam reminders, incomplete tasks; parent 0/1/multiple-child handling; admin metrics. |
| Students / student workspace | Search/grade filters, complete child switching, multiparent bindings, chapter tree, history tabs, English task settings, student management and parent directory. |
| Subjects | Level/subject/topic CRUD, assignment selection, catalog sync, two-condition progress. Distinguish catalog administration from per-student progress. |
| Daily | Full legacy-compatible activity editor, all English/custom task controls, loss points, paper editing, manual local draft restore/discard, real two-stage save, and conflicts. |
| Weekly | History, Sunday–Saturday selector, daily/paper source cards, AI-assisted summary, save/delete, preview and parent visibility. |
| Assessments | Complete exam and standalone paper forms, score/date handling, type/school creation, read-only parent views. |
| Reports | Add a clear legacy summaries section alongside structured reports; implement generation/detail/edit/visibility and the real independent state fields. Remove unsupported submit/returned/history flows. |
| Planning | Grade weekly plans and student records; add administrator weekly/term summaries and three existing exports. Cycle-target controls remain optional. |
| Bin | All seven record types under five groups, including legacy summaries; restore and permanent deletion; distinguish student hard deletion. |
| Administration | Approval, identity-grouped role editing, four-type review, student aggregate/detail, global English settings, study settings, and wellbeing export. |
| Settings | Profile edit, language, real local logout, parent subscription guidance. Provider binding is optional. |

The missing views should use the same shell, form, table, and confirmation components. Visual consistency must not remove functionality absent from the HTML.

### 2.3 Proposed web routes

These are **browser routes**, not new HTTP business endpoints. Names can be adjusted during implementation if old links are preserved. Use `BrowserRouter`'s existing base-path support in `src/App.tsx:153`.

| Route or route family | Purpose |
|---|---|
| `/login`, `/login/reviewer`, `/web-auth` | Login, reviewer credentials, selected browser handoff callback. Keep `/admin/login` compatible. |
| `/dashboard` | Role-specific landing. |
| `/students`, `/students/new`, `/students/manage`, `/parents` | Roster, creation, eligible management, parent directory. |
| `/students/:studentId` | Student overview and chapter progress; parent child switcher remains available. |
| `/students/:studentId/edit`, `/students/:studentId/subjects`, `/students/:studentId/english-tasks` | Profile/bindings, assignments, student task configuration. |
| `/subjects`, `/subjects/new`, `/subjects/:subjectId/edit` | Global catalog and level/topic management. |
| `/daily-progress`, `/students/:studentId/daily/:date` | Daily selection/history and date-specific form/read view. |
| `/weekly-feedback`, `/students/:studentId/weekly/:weekStarting` | Weekly selection/history and weekly detail. |
| `/students/:studentId/exams`, `/students/:studentId/papers` | Assessment lists and in-page create/edit dialogs or panels. |
| `/planning/grades`, `/students/:studentId/weekly-plan` | Grade plans and completion record; week in query string. |
| `/students/:studentId/summaries/quarterly`, `/students/:studentId/summaries/yearly` | Legacy summaries; year/quarter/range in query string as applicable. |
| `/students/:studentId/reports`, `/reports/:reportId` | Structured generation/list and full detail. |
| `/students/:studentId/bin`, `/report-preview` | Recovery and locally prepared long-text preview. Preview requires a reload-safe local payload or a reloadable source. |
| `/admin/dashboard`, `/admin/students/:studentId`, `/admin/users`, `/admin/review` | Admin aggregate, detail, accounts, and review queue. |
| `/admin/settings`, `/admin/plans` | Global task/study configuration; weekly/term summaries and exports. |
| `/profile`, `/settings` | Existing profile/settings destinations. |

Keep compatibility adapters for existing `/student/:id`, `/add-student`, and `/progress-form` URLs. Redirect to the new route while preserving query student/date context. Do not silently interpret a missing ID as the last visited student. Parent home derives available children from the server's scoped `/students` result, without filtering again by legacy `parentId`.

Persist meaningful student/date/week/type/year/filter selection in the URL. Keep unsaved fields in form state/draft storage. Back/forward/reload must restore the authorized context; changing student cancels or ignores previous-student responses before rendering new data.

## 3. Frontend architecture and reusable implementation units

### 3.1 Keep the current stack

The repository already declares React 18, TypeScript, Vite, React Router 6, TanStack Query 5, React Hook Form, Zod, Tailwind, Radix/shadcn components, date-fns, and Vitest in `package.json`. Reuse these dependencies; the migration does not require Next.js, another router, or another state-management system.

`src/App.tsx:29` already creates a QueryClient. `src/config/api.ts:2` chooses the `/api` base. Existing API methods in `src/services/api.ts` and ad hoc component fetches should converge on one transport. Preserve existing environment/base-path choices unless a separately reviewed hosting change requires otherwise.

### 3.2 Proposed file organization

All paths below are planned files/directories unless explicitly identified as existing. Do not treat their listing as proof that they have been implemented.

```text
src/
  app/
    routes.tsx                 # canonical route definitions and compatibility redirects
    permissions.ts            # UI capability predicates; never replaces backend checks
    queryKeys.ts               # identity/student-scoped query key factories
  components/layout/
    AppShell.tsx              # prototype sidebar/header/mobile navigation
    StudentWorkspace.tsx      # child context, tabs, per-child indicators
  components/shared/
    AsyncState.tsx             # loading, empty, denied, error
    ConflictDialog.tsx        # stale version versus action lock
    ConfirmDeleteDialog.tsx
    DateOnlyInput.tsx
    LongTextPreview.tsx
  services/
    http.ts                   # JSON, binary, errors, AbortSignal, auth handling
    authApi.ts
    studentsApi.ts
    curriculumApi.ts
    progressApi.ts
    englishTasksApi.ts
    feedbackApi.ts
    assessmentsApi.ts
    plansApi.ts
    reportsApi.ts
    adminApi.ts
    binApi.ts
  features/
    auth/ students/ curriculum/ progress/ english-tasks/
    feedback/ assessments/ planning/ reports/ admin/ bin/
  domain/
    contracts.ts              # endpoint-specific DTOs, not a fictional common envelope
    activityAdapters.ts       # read old shapes without destructive normalization
    reportAdapters.ts         # parsed JSON, display/edit/Markdown mapping
    businessDates.ts          # date-only/week/range rules
    scoreDisplay.ts           # score/percentage/grade compatibility
  storage/
    dailyDrafts.ts
    seenMarkers.ts
```

Keep existing `src/pages/` entry points as thin adapters until callers move. Share one daily editor between `/daily-progress`, `/progress-form`, and admin entry points; do not maintain two incompatible payload builders. Reuse the existing `SubjectTopicsPanel`, daily/weekly read panels, and admin aggregate work where possible, extracting business logic out of generic UI component directories gradually.

Port pure behavior from mini utilities with provenance comments and fixture tests. Do not import modules that reference `wx`, `Page`, or server DB/environment initialization into the browser bundle. Do not send provider secrets or server-only libraries to the client.

### 3.3 HTTP transport contract

Implement `requestJson<T>()` and `requestDownload()` with these requirements:

1. Build URLs through the existing API base, adding `/api` exactly once. Encode path IDs and query values with explicit endpoint serializers.
2. Add the current authorized session header according to the chosen session design. The existing business handlers use Bearer tokens; the custom token is not JWT and must not be decoded as one for authorization.
3. Accept each endpoint's actual successful shape: array, object, `null`, empty response, or binary. Do not require `{data: ...}` across the application.
4. Parse non-success JSON where possible and retain `status`, `error`, `message`, `updatedAt`, `updatedByName`, and lock metadata. Fall back to a safe textual message for non-JSON responses.
5. A login `pending_approval` response is a login state. A protected resource's 401 invalidates the session; 403 is denied access, not an empty dataset or automatic logout. 410 denotes retired functionality.
6. Distinguish 409 `CONFLICT`, 409 `ACTION_LOCKED`, and duplicate/dependency conflicts. Keep entered data while showing the appropriate recovery action.
7. Never automatically retry a mutation that may have saved, published, generated a persisted report, sent a notification, or replaced paper rows. An aborted request or lost response is an unknown outcome, not proof of rollback.
8. Allow cancellation/ignore-stale handling for reads. Configure mutation retry off; do not let focus refetch overwrite a dirty form. Success messages follow confirmed responses and required follow-up writes.
9. Keep DELETE payload handling endpoint-specific. Several handlers use query/body versions; bin permanent deletion explicitly accepts JSON `{recordType,recordId}`. Verify proxies preserve the intended body in the isolated deployment.
10. Remove token logging and ensure error reporting does not log tokens, passwords, raw student narratives, or provider responses by default.

### 3.4 DTOs, form state, and query invalidation

Separate API DTOs from editable form state and display models. Retain the original server version and untouched historical fields in form state. Never replace a full record with only visible fields when the endpoint replaces nested arrays or parent bindings.

Use a session namespace such as `[role,userId,reviewerStudentId]` in query keys and clear all private query data on logout/account change. Student keys include student ID plus applicable date/range/filter. Report detail keys include report ID and session identity. Public catalog caching must still honor explicit active/inactive filters.

| Successful mutation | Invalidate/refetch |
|---|---|
| Student/profile/bindings | Student list/detail, relation data, parent directory, admin aggregate; update session profile separately for profile edits. |
| Catalog or assignments | Hierarchy, affected student assignments/full topic trees; subject deletion also affects relevant paper/report-source views. |
| Topic progress | Student full tree, overview, and source/export-related views; do not invent a historical completion event. |
| Daily save/delete; paper mutation | Daily day/history, relevant paper list, daily missing queue, incomplete tasks, weekly source cards, admin aggregate, bin after delete. Stored generated reports remain stored reports; do not silently regenerate them. |
| Global/student task settings | Applicable settings and future/current unsaved editor initialization. Prompt before applying changed defaults to a dirty editor; preserve historical snapshots. |
| Weekly/legacy save/delete/publish | Detail/history, missing queue where relevant, review queue, admin counts, parent-visible lists, bin after delete. |
| Structured generation/edit/visibility/delete | Student report list/detail, review queue, admin counts, parent-visible views, bin after delete. |
| Grade plans/student completion | Grade plan, selected student record, admin weekly/term summaries. |
| Bin restore/permanent | Bin plus corresponding live history, detail, queues, parent-visible views, and aggregates. |

Invalidate broad dependent families when a precise relationship is unknown; do not refetch every student's private records globally. Identity invalidation is immediate. Ordinary data refresh must not clear an unsaved local draft.

## 4. Authentication, permissions, and browser boundaries

### 4.1 W01 — Session and identity continuity (F01–F04, F54; C1)

Existing entry points are `POST /api/auth/wechat`, `POST /api/auth/reviewer-login`, `POST /api/login`, `POST /api/admin/login`, and `GET/PUT /api/profile`. The mini WeChat endpoint exchanges a **mini program** login code using `jscode2session`; it is not a website OAuth code exchange (`server/index.ts:9412`). A browser cannot complete that flow simply by calling `wx.login` or reusing the prototype's fake QR.

Implement the browser session state machine `checking → anonymous | authenticated | unavailable`, with explicit login pending/rejected/configuration-error states. At startup, validate cached credentials using `/profile` before showing private data. On a network failure during validation, show retry rather than trusting cached identity or destroying potentially valid credentials. On confirmed auth rejection, clear private caches and require login. Resolve admin storage into the same session service without discarding an existing valid admin session during the migration.

Implement the existing reviewer credential flow early. Carry `isReviewer` and `reviewerStudentId` through a server-authoritative session response and refresh. The current profile DTO drops these fields (`server/auth/userIdentity.ts:17`); correcting that is a narrow backend dependency, not a new reviewer role. Do not infer unrestricted teacher status when flags disappear.

Browser WeChat login is a separate required adaptation with a decision before production use:

| Option | Preconditions and required behavior |
|---|---|
| Website WeChat authentication | Verify actual provider application/domain eligibility and authoritative identity association. Server exchanges the website code, validates callback state, resolves the existing role records, and retains the mini notification identity. Website openid must not overwrite the mini openid merely because both identify the same person in different applications. |
| Mini-authorized browser handoff | Add a narrowly scoped, short-lived, single-use approval/exchange mechanism through an authenticated mini session. Bind exchange to the initiating browser and intended role; validate expiry and replay. This requires its own mini/backend work; no such complete flow exists today. |

Choose one after verifying the available provider setup. Proposed auth-only endpoints and any identity storage changes require a reviewed contract; no invented endpoint in the prototype is assumed implemented. Reuse existing business handlers after session establishment. A local fixture session may unblock UI development, but is not completion of F01.

For either option, test existing approved T/P/A accounts, first-time pending T/P, nickname requirement where applicable, rejected accounts, role mismatch, cancellation, expired/replayed callback, and secondary-parent continuity. Link identities only with authoritative evidence; matching display names is insufficient. A user-selected role is a request for an authorized session, not a permission grant. The prototype role selector must never appear as a production impersonation switch.

Retain stored-password login until its use/deprecation is decided; address its credential hygiene separately (I04). Remove misleading successful signup/password-change/email-verification forms that call 410 endpoints, and provide an intentional explanatory route for old links. Do not implement Google merely because it is shown in the HTML.

Profile editing uses `PUT /api/profile` with `displayName` and the existing 1–40 UI limit. Refresh the authenticated profile after save. Cancel restores the loaded value. Logout clears this application's session, private query data, and account-scoped local drafts/seen state consistent with the chosen documented policy; preserve unrelated browser-origin storage.

### 4.2 Capability predicates

Use explicit action predicates instead of `role !== 'parent'` or `isAdmin || isTeacher` everywhere. The backend remains authoritative. `M` below is `canManageStudentsAndParents`; reviewer is a scoped teacher session, not a fourth persisted role.

| Action | Current contract to preserve |
|---|---|
| Read student resources | T/A, P linked through either binding model, R demo student; report visibility adds restrictions. |
| Create student | T/A API, not R; mini create UI is teacher and is not M-gated. Do not silently gate ordinary teacher creation on M. |
| Edit/delete student and incremental parent management | T+M or A, not R. Parent list has broader T/A read access than management endpoints. |
| Catalog/assignment/sync writes | T/A, not R. |
| Topic progress, exams, papers, loss-point catalog | Their strict-teacher routes exclude A. R is student-scoped for student writes; R cannot create shared paper dictionaries. |
| Daily, weekly, legacy and structured report authoring | T/A, R demo scope; parent read rules vary by resource. Admin is not globally read-only. |
| Student English settings | T/A, R demo scope. |
| Global English/study settings, accounts, review, admin exports | A. |
| Structured publication controls | Existing mini UI exposes to A, though PATCH handlers permit T/A. Keep the UI gate unless explicitly redesigned; document and test the backend discrepancy. |
| Parent chapter progress | Read only, all authorized children, both progress conditions visible. |
| Bin | T/A, R demo scope, not P. |

Build denied-route and denied-action states and test direct URLs. Do not issue known-forbidden dependent calls merely because a parent/admin can open the surrounding screen. Resolve I03/I11 before shipping reviewer access. The reviewer must retain legitimate demo-student writes; a blanket read-only redesign is not baseline parity.

### 4.3 WeChat subscriptions

Parent subscription authorization uses `wx.requestSubscribeMessage` in mini settings, in deduplicated batches of at most three templates per user gesture (`miniprogram/pages/settings/index.js:107`). There is no equivalent existing business authorization endpoint for the browser.

Provide a real mini-program handoff or clear instructions to open subscription settings, tied to the same parent identity. Do not fabricate a browser “subscribed” state from opening a QR/instruction panel. Preserve weekly/exam/semester/yearly notification destinations and server triggers. No new daily notifications, approval notifications, or delivery guarantees are implied. Exact handoff entry/link availability is an authentication/platform integration decision.

## 5. W02 — Role dashboards, student workspace, and parent navigation

Coverage: F05–F08, F13–F14, F42; C1/C2/C7/C8/C10. Reuse `src/pages/Dashboard.tsx`, `Students.tsx`, `StudentProfile.tsx`, and admin aggregate views after fixing their data and permission assumptions.

| Read | Use |
|---|---|
| `GET /api/students`, `GET /api/students/:id` | Server-scoped roster and student context. |
| `GET /api/daily-progress/missing?date=...` | T/A missing daily queue; R denied. |
| `GET /api/feedback/missing?weekStarting=...` | Explicit seven-day missing weekly queue; R denied. |
| `GET /api/exams/upcoming?date=...` | Strict-teacher per-subject reminder window; R denied. |
| `GET /api/weekly-tasks/incomplete?date=...` | Strict-teacher cycle counters; R denied; uses the separate weekly targets model. |
| `GET /api/admin/student-management` | Admin metrics, student histories, filters, and pending counts. |
| `GET /api/students/:studentId/subjects/full` | Assigned subjects and chapter/condition tree. |

Parent landing behavior: zero children shows a truthful unlinked/empty state; one child opens that workspace; multiple children show a chooser and persistent switcher. Include secondary-only bindings. Remove the current React re-filter by `parentId`; trust the scoped list and enforce authorization on every child request. Switching children resets private form/view state appropriately and prevents stale responses from the prior child displaying.

Teacher home includes date/week controls, expand/collapse queues, and links prefilled with the chosen student and date. An absent daily row still counts as a submitted active record; pending weekly feedback still satisfies the missing-feedback check. A failed/forbidden request must not render “all complete.” Use the returned task cycle and exam subject/date instead of substituting the weekly reporting range.

Student overview includes profile, authorized bindings controls, subject expansion, chapter conditions, daily/weekly/assessment/legacy/structured histories, plan record, task configuration, and bin entries as authorized. Parent chapters are read-only. Preserve student list search/grade filters and empty/error/retry behavior.

Local unread markers mirror the mini entry behavior: weekly uses latest `weekStarting`; exams use latest row modification/date metadata; structured reports use latest update/create/end metadata. Namespace by account and child. Mark at the corresponding successful list/view entry, not background prefetch. Daily unread helper is retained/uninvoked code, not a new mandatory parent notification feature. Do not claim cross-device continuity or precise unread counts.

Acceptance: ordinary T, M-teacher, A, P with 0/1/2 children and secondary binding, and R all land correctly; direct unauthorized IDs are rejected; child switching/back/reload never cross-displays data; creating/deleting a relevant record updates the correct queue; failures remain distinguishable from empty results.

## 6. W03 — Student and parent management

Coverage: F09–F12 and relevant F42; C2/C11. Reuse `AddStudent.tsx` and admin profile fields, replacing their single-parent assumptions.

| Action | Existing request |
|---|---|
| Create | `POST /api/students` `{name,grade,parentIds?,parentId?}`, then assignment PUT if selected. |
| Update | `PUT /api/students/:id` with complete intended profile/binding set. |
| Bind/unbind | `POST /api/students/:id/parents` `{parentId}`; `DELETE /api/students/:id/parents/:parentId`. |
| List parents / inspect links | `GET /api/parents`; `GET /api/parents/:id/students`. Relation GET `/api/students/:id/parents` can supply DTOs to eligible management UI without adding a new business capability. |
| Delete parent | `DELETE /api/parents/:id`; linked account must fail. |
| Delete student | `DELETE /api/students/:id`; permanent operation, no bin. |

Form fields: name 2–100 characters; grade required by UI and at most 20; retain existing/custom grade strings rather than enforce the prototype's sample taxonomy. Parent selection is multi-select with all intended IDs retained. The ordinary student DTO supplies IDs, not full parent objects; do not render nonexistent nested DTOs. Offer approved parents in the UI and identify the current backend approval-validation gap separately.

Creation is sequential: save student, capture ID, then save assignments. On assignment failure show “student created; subjects not saved,” preserve the created ID, and retry only the assignment stage after reconciliation. Never repeat POST blindly and create another student.

Management edit must preserve secondary bindings even if changing only name/grade. Bind/unbind refreshes relation state and the student's primary parent. Parent directory provides search, linked-student inspection, and deletion confirmation. Separate directory access from broad approved-parent list fetching used by creation.

Student deletion needs the I02 cascade/atomicity correction before it can pass acceptance. Include active/deleted papers, task config, weekly targets and plan records in the isolated fixture. The UI confirmation identifies the student and irreversible associated-data impact; success requires a confirmed complete outcome. A temporarily blocked delete is an unfinished F12 dependency, not parity completion.

Acceptance: ordinary T create remains available, M controls edit/delete/binding, R is denied; secondary parents survive profile edits; removing a primary link retains remaining access; linked-parent deletion is refused for both relation models; failed assignment does not duplicate the student; hard deletion either completes its intended cascade or rolls back after the separate correction.

## 7. W04 — Curriculum, assignments, and chapter progress

Coverage: F15–F18; C3. Reuse `src/components/ui/SubjectTopicsPanel.tsx`; add the missing catalog editors using prototype tree/form styles.

| Operation | Existing endpoint family |
|---|---|
| Catalog reads | `GET /api/subjects?includeInactive=true`, `GET /api/subject-levels`, `GET /api/subjects/hierarchy`. Default subject list is active only. |
| Levels | `POST /api/subject-levels`; `PUT/DELETE /api/subject-levels/:id`. |
| Subjects | `POST /api/subjects`; `PUT/DELETE /api/subjects/:id`. |
| Topics | `POST /api/subjects/:subjectId/topics`; `PUT/DELETE /api/topics/:id`. |
| Student assignment | `GET/PUT /api/students/:studentId/subjects`; PUT `{subjectIds,resetProgress?}`. |
| Student catalog/progress | `POST /api/students/:studentId/subjects/sync-catalog`; `GET /api/students/:studentId/subjects/full`; `PUT /api/students/:studentId/topics/:topicId/progress`. |

Level editor: name, description, sort order, default/active flags. Protect default/occupied levels and surface duplicate conflicts. Subject editor: uppercase code, display/bilingual names, level, order, required/active flags, and draft topic rows. Topic editor: code, title, parent, string order index, applicable subject. Preserve parent-child structure and backend length/range bounds from C3; do not convert string order into a lossy integer.

Subject and topic edits may be separate writes. Track which draft rows have persisted after partial failure. Subject deletion is a hard cascading deletion of topics/progress/assignments/papers; its confirmation cannot say “hide.” Required/ENGLISH subjects are protected. Topic deletion refuses children and started progress; do not silently delete a subtree.

Assignment UI auto-selects required subjects; server always inserts ENGLISH. Default `resetProgress='removed'` wipes removed-subject progress, `all` wipes all student topic progress, `keep` preserves progress. Baseline assignment UI must disclose the actual selected behavior. Exposing every backend reset variant as a new choice is optional, but the client must not accidentally send `all` or assume `keep`.

Catalog sync upserts shared catalog topics and returns synced/skipped information. It is not a student progress reset. Chapter progress uses `definitionRecited` and `chapterExerciseCompleted`; both true means completed. Completing a parent completes descendants; undoing the parent does not undo descendants. Refetch the tree after save. Do not require client `updatedAt` or display fabricated per-condition timestamps: current handler does not write those timestamp columns (`server/index.ts:5845`).

Acceptance: occupied/default/core protections; duplicate code/name; inactive subject reactivation; topic child/start protection; partial topic save; assignment removed/all/keep contract fixtures; ENGLISH retained; sync result display; all condition combinations and descendant behavior; P read-only and A excluded from strict-teacher progress mutation.

## 8. W05 — Shared historical data, dates, and score display

Build these adapters before the daily/weekly/report screens. Coverage: F19–F22, F28, F30–F31, F36–F41; C4/C5/C8/C9. Sources include `miniprogram/pages/daily-progress/detail.js`, `miniprogram/pages/weekly-feedback/detail.js`, `server/utils/englishNormalize.ts:235`, `server/utils/inputValidation.ts:8`, and `server/utils/scoreGrade.ts:21`.

### 8.1 Historical activity compatibility

| Stored shape | Read behavior and edit preservation |
|---|---|
| Generic legacy `{subject,description,performance,notes}` | Render existing text with fallbacks. Do not drop the record because modern required narratives are absent. When editing, explicitly collect missing required fields; never fabricate a teacher's evaluation. |
| Current generic subject narrative | Preserve subject ID/name, taskSummary, strengths, improvements, practiceProgress/compatibility fields, definitionRecitation, comment, and any retained embedded-paper history. |
| Legacy English strings / `englishFields` | Normalize for display while retaining meaningful original text. Avoid interpreting every old string as a numeric exercise. |
| English V2 | Preserve editing/reading/grammar counts and exercise arrays, vocab words/sentences, recitation, essay title/completed/score/text, and loss-point IDs/snapshots/other text. |
| Configured `englishTasks[]` | Preserve recorded ID/key/name, enabled field snapshot, target/count/score/problems/exercises/completed data. Read historical labels/targets from the record, not today's task configuration. |
| Structured report JSON string/object | Safely parse known JSON string forms, prefer finalReport then structuredReport, and retain summary fallback. Parse failures render available content plus a warning rather than erase it. |

The read adapter must be non-destructive. A write serializer is separate, validates against the current endpoint, and preserves untouched data supported by that endpoint. Keep unknown-but-valid historical metadata where the contract allows it; do not blindly forward an entire server object into a narrow PATCH.

### 8.2 Date-only rules

Represent business dates as validated `YYYY-MM-DD` strings. Use Asia/Shanghai for business “today” and explicit calendar arithmetic; avoid converting a date-only string through UTC serialization and shifting its calendar day. Test in more than one browser timezone. Retain actual timestamp values for concurrency and sort/modified metadata.

| Context | Rule |
|---|---|
| Daily entry | Selected date; shared supported years 2000–2100; no requirement to align to a task cycle. |
| Weekly authored feedback and source cards | Sunday start plus six days = Saturday. Server permits ordered ranges up to 10 inclusive days; UI retains the current seven-day workflow. |
| Missing weekly queue | Explicit `weekStarting` uses seven days. `date` fallback instead resolves a study cycle; do not substitute one query for the other. |
| English incomplete tasks and grade-plan cycle context | Use returned cycle; default cycle is Sunday–Thursday, with Friday/Saturday still referring to that Sunday. Explicit stored cycle can override defaults. |
| Quarterly/semester AI and legacy custom range | Maximum 220 inclusive days. Four legacy quarter slots are not academic-term records. |
| Yearly AI | Year or explicit range, maximum 380 days for generation. |
| Manual structured report POST | Maximum 370 days; do not reuse the larger AI limit. Manual creation UI remains retained/optional. |
| Range report and bounded term/task exports | Maximum 370 days. Legacy yearly export date controls are independent of its year-based AI request. |
| Admin term plan summary | Inclusive selection by plan start date; current student grade determines grouping. |

### 8.3 Grade/percentage display

Prefer the returned score/total/percentage/grade when valid. When a compatibility fallback is required, mirror `server/utils/scoreGrade.ts:34`: fraction or explicit positive total → percentage rounded to two decimals before grade assignment; a numeric-only legacy score in 0–100 means percentage; otherwise no inferred percentage/grade. Blank/null and numeric zero are distinct.

| Percentage | Grade |
|---|---|
| ≥75 | A1 |
| ≥70 and <75 | A2 |
| ≥65 and <70 | B3 |
| ≥60 and <65 | B4 |
| ≥55 and <60 | C5 |
| ≥50 and <55 | C6 |
| ≥45 and <50 | D7 |
| ≥40 and <45 | E8 |
| <40 | F9 |

Do not manufacture a zero/F9 for a scoreless scheduled exam. Explicitly test null coercion because the mini fallback's `Number(rawPercentage)` can turn null into zero (`miniprogram/pages/grades/index.js:27`); reproducing that coercion defect is not a parity requirement. Test threshold rounding, fractions, zero scores, total zero, and numeric-only legacy scores.

## 9. W06 — English configuration and study defaults

Coverage: F24–F26; C6. Sources: `miniprogram/pages/english-tasks-manage/index.js:65`, `miniprogram/pages/admin-settings/index.js:76`, `server/utils/englishTasks.ts:18`, `server/index.ts:2934`.

Build one reusable task configuration editor with explicit `global` or `student` scope. Its controls include preset/custom task creation, stable key/ID, display and Chinese/English names, enable switch, weekly target, enabled fields, order/reorder, removal, save, and reset. Use the server-normalized response after saving.

| Scope/action | Existing request and response |
|---|---|
| Global load/save | `GET/PUT /api/admin/english-tasks`; PUT `{tasks}`; response includes tasks, isDefault, updatedAt, updatedByName. |
| Global reset | `POST /api/admin/english-tasks/reset`; replaces config with built-in defaults. |
| Student load/save | `GET/PUT /api/students/:studentId/english-tasks`; PUT `{tasks}`; response includes studentId, tasks, isDefault, updatedAt, updatedBy. |
| Student reset | `POST /api/students/:studentId/english-tasks/reset`; removes override and returns current global defaults. |
| Study defaults | `GET /api/study-settings`; `PUT /api/admin/study-settings` `{enabled,days,startTime,endTime}`. |

Default task counts are editing 5, reading 5, grammar 5, vocab 50, recitation 5, essay 1. Follow server normalization for names/keys, up to 30 configured entries where validated, target clamp 0–500, enabled fields, default fallback and ordering. Student overrides merge by key: matching student values win; missing global keys append. `isDefault` comparison is against built-in defaults, not simply “no override exists.” Show the returned state truthfully.

Reset confirmation names its scope and explains that saved daily records, chapter progress, and cycle targets remain intact. Do not implement reset by deleting daily activities or setting all target counters to zero. Global changes must not rename historical daily snapshots.

Study defaults: enabled unless literal false, default days Sunday–Thursday `[0,1,2,3,4]`, 18:00–21:00; invalid/empty values fall back according to the current handler. Use these defaults only when initializing an eligible new daily form. This is not a scheduler, absent-record generator, or enforced attendance policy.

The incomplete-task dashboard uses separate weekly-cycle targets, not these global/student task settings. Label the two concepts distinctly. Do not wire the prototype's single target UI to both models or promise its change immediately alters the incomplete queue.

Acceptance: all bound editor controls persist after reload; student/global reset differences; matching overrides/missing keys; rename/disable/reorder; empty/invalid normalization; target boundaries; reviewer scope; admin global access; historical records unchanged; no unintended modification of an already dirty daily form.

## 10. W07 — Daily progress, embedded papers, and local drafts

Coverage: F19–F23; C4/C5/C8. Existing `DailyProgressForm.tsx` and `ProgressForm.tsx` have different partial functionality and omit update versions. Consolidate them behind one shared editor and serializer.

### 10.1 Load and edit flow

1. Resolve authorized student/date from route. Load student, current single-day record (`GET /api/progress/student?studentId=...&date=...`), assigned full topic tree, and authorized supplementary data.
2. For a teacher session, load loss catalog (`GET /api/loss-points`), student task config, day papers, paper types and schools. Respect strict-teacher and reviewer restrictions; an admin cannot call every dependency.
3. A null daily response means no active record. Existing record stores its ID and original `updatedAt` in immutable form metadata.
4. Normalize historical data for display, then initialize editable fields without replacing recorded snapshots with current defaults. Apply study defaults only for an eligible new form.
5. Find the local draft for this account/student/date. Offer restore/discard explicitly; show draft date/version and reconcile against current server data. Never overwrite current server versions with stale draft timestamps silently.
6. Keep cancel/back behavior distinct from save draft and publish. Confirm abandoning dirty fields where needed; restore the last loaded form on cancel.

History uses `GET /api/students/:studentId/progress` (or the equivalent existing scoped list). Preserve student search/grade selection, week/month/all filters, pagination, and selected-student deep links. Current mini list page size is 10; use that default unless an intentional UI change is documented. Do not rely on ignored query filters on `GET /api/progress`.

### 10.2 Form and validation

Form sections: attendance present/late/absent; date; arrival/departure times; summary; subject add/remove; generic narrative fields; English tasks; per-activity/day papers; chapter controls where authorized.

Current mini publish requires both attendance times and at least one activity even for absent attendance. API accepts HH:mm/null under its schema, 1–40 activities, summary ≤5000, usual narrative ≤1000 and short fields ≤120. Current generic activities require task summary, strengths, and improvements. Preserve the difference between server allowance and the existing UI rule; changing the absent-day requirement is a product/correctness decision.

English controls must support six canonical skills and configured custom tasks, enabled fields, counts, score/positive total, exercise rows, per-exercise problems, loss-point IDs/label snapshots/other text, vocabulary word/sentence data, recitation, essay title/completed/text/score, and historical task snapshots. Counts/scores follow C5 and `inputValidation.ts`, including up to 30 exercise rows and score ≤ positive total. Do not simplify the UI to the prototype's static totals table.

The server's imperfect-score loss requirement covers editing/reading/grammar; mini validation additionally checks exercise problems and essay cases. Port the actual mini form validations with explicit fixtures, distinguish full/null scores from imperfect scores, and avoid making up identical validation across all task types.

### 10.3 Save protocol and partial-success recovery

The baseline save is two independent operations:

```text
Validate form and preserve a recovery draft
  → POST /api/progress, or PUT /api/progress/:id with original updatedAt
  → retain returned daily ID and updatedAt
  → PUT /api/students/:studentId/papers/batch
       { date, papers: completeIntendedDaySet, expectedUpdatedAt }
  → only after both confirmed successful: clear draft, refresh views, show success
```

Current daily writes strip paper rows from the main payload and always perform the batch call, including an empty list. Batch replaces **all active papers for the student/date**, including standalone-entered papers. Load and preserve the complete day set, carry its newest active timestamp, and make removal deliberate. An empty list deletes the active set; replaced IDs are not soft-deleted into the bin. Soft-deleted papers remain separate.

Batch returns a saved message/count for nonempty input and a no-papers message for empty input; neither should be mistaken for a daily row. Preserve the daily response separately. New paper IDs and timestamps mean the post-save form must reload the resulting rows before another edit.

Implement explicit save-stage state, including `dailySavedPaperPending` and `outcomeUnknown`. After a known second-stage failure, keep the daily ID/version and local paper draft; display partial success and reconcile/retry the paper stage rather than POST daily again. If a response is lost, refetch and compare current content before offering a retry. Never automatically replace a newly changed paper set with a stale local array. If a race remains ambiguous, present reload/cancel while preserving the draft.

The batch handler itself is not transactional. UI recovery cannot guarantee rollback after its delete/insert failure. Track transaction hardening as a separate backend fix with failure-injection testing. Likewise, resolve admin daily authoring's strict-teacher paper/loss/topic dependency (I06); do not impersonate a teacher, broaden middleware silently, or treat a known 403 as a successful full publish. An approved admin-only daily save policy or a narrowly scoped backend correction is required before this path is complete.

Normal daily deletion uses `DELETE /api/progress/:id` with original version and soft-deletes only daily progress, not day papers. Show that distinction and invalidate the bin/missing queue. Neither daily save nor delete sends a subscription message.

### 10.4 Browser-local draft storage

Use a versioned envelope keyed by application/account/role/student/date, compatible in intent with `miniprogram/utils/dailyProgressDraft.js:1`. Store form content, paper set, stage/recovery metadata, and saved time; do not store credentials in draft objects. Use browser storage with graceful quota/unavailable handling. Local draft save must report a storage error rather than a fake success.

Support manual save, restore, discard, dirty-state warning, and clearing only after full successful publish or explicit discard. A browser cannot import device-local mini drafts automatically. Autosave, server drafts, and cross-device synchronization remain optional additions. Sanitize rendered narrative text; draft content is user data, not executable HTML.

Acceptance: old generic/English/V2/custom-task rows display; required modern fields are collected without invented text; absent UI rules; null/zero/imperfect scores; add/remove exercise and paper; draft across reload/user/date switch; duplicate active day; stale update/delete; action lock; stage-two 403/500/conflict/network loss; empty batch; preservation of standalone papers; no duplicate daily on recovery; admin dependency explicitly resolved.

## 11. W08 — Weekly feedback and long-text preview

Coverage: F27–F29 and F41; C7/C10. Reuse weekly panels while replacing the version-less write path.

| Action | Existing request |
|---|---|
| History/detail | `GET /api/feedback/list?studentId=...`; `GET /api/feedback/one?studentId=...&weekStarting=...`. Null detail means no active row. |
| Sources | `GET /api/progress/list?studentId=...`; `GET /api/students/:studentId/papers`; filter selected Sunday–Saturday range inclusively. |
| Generate summary | `POST /api/ai/weekly-summary` `{studentId,weekStarting,weekEnding}`. |
| Save | `POST /api/feedback` or `PUT /api/feedback/:id`, with original updatedAt for PUT. |
| Delete | `DELETE /api/feedback/:id` with original version. |

Build student/month/all filtering, history pagination, summary preview, edit/cancel, week selection, daily expand/collapse cards, and same-range paper groups. Daily cards use the shared historical activity adapter, including attendance/absence, scores/problems, custom tasks, and paper evaluations. Apply the agreed parent presentation rules; current source permits raw daily API reads and does not implement the brief's proposed strict server projection.

AI response may include summary and six additional arrays; mini uses summary. Generating must populate the form without persisting weekly feedback. Preserve the user's current text until a successful response is accepted; AI_NOT_CONFIGURED, provider errors, and action locks leave the editor recoverable. Long-running requests have progress/error states, without an invented persistent job API or automatic retry.

Save sends studentId, weekStarting/weekEnding, summary, strengths, areasToImprove, teacherNotes, nextWeekFocus. For existing rows, preserve legacy fields not edited in this summary-only UI instead of reproducing the mini's empty-array/string data-loss behavior (I08). For new rows, use the current appropriate empty defaults. Keep this corrective behavior documented and tested.

Every successful save returns to pending and invisible, including edits of previously published feedback. There is no server weekly draft/submitted state and no notification on ordinary save. Use precise labels such as “Save for review”; do not show the prototype's unsupported state pipeline. Delete is soft deletion.

Preview is local text; copy and file-save use the shared browser preview component. A parent sees only published/visible weekly records through the existing server filter. Do not interpret a protected detail failure as a new editable blank record.

Acceptance: Sunday and Saturday included, next Sunday excluded; null versus forbidden; parent pending exclusion; historical fields preserved on edit; AI does not persist; published edit hides; stale version/action lock/duplicate outcomes; delete/bin restoration; preview/copy/download with long Chinese text.

## 12. W09 — Exams, scores, and standalone papers

Coverage: F07, F30–F31; C8. Use two distinct prototype tabs and shared score/date controls. Read access includes linked parents; writes are strict teacher and reviewer demo-scoped where allowed, not admin by implication.

### 12.1 Exams

Requests: `GET/POST /api/students/:studentId/exams`; `PUT/DELETE /api/exams/:id`; upcoming is `GET /api/exams/upcoming`. Read returns grouped exams with subject scores and parsed grade metadata. PUT/DELETE retain original `updatedAt`.

Form fields: name, selected/custom subject names, per-subject date and optional score; earliest retained subject date becomes main examDate. Match the current mini omission rules for empty subject rows while supporting scoreless schedules. Limit name to 1–50 and subjects to 30; validate score strings as allowed numbers/fractions up to 500 with numerator ≤ denominator. Confirm exact row inclusion using fixtures from `miniprogram/pages/grades/index.js:302` before serializing.

Backend also supports examType, reminderDate, and subject scope. These are not current bound mini form controls, so do not invent mandatory new fields. When editing an existing row, retain supported metadata the UI does not expose instead of clearing it inadvertently. PUT replaces the subject score rows; preserve intended unchanged rows.

Reminder window is inclusive reminder date through per-subject exam date, defaulting to seven days beforehand (`server/utils/examWindow.ts:31`). Creating an exam with a nonempty score triggers a parent notification; adding scores with PUT does not. Soft delete keeps score rows for restore. Do not introduce review/publish visibility flags for exams.

Acceptance: scoreless create, scored create, schedule later scored via PUT with no create notification, earliest date, custom subject, remove one subject, null/zero/fraction/grade boundaries, metadata preservation, reminder boundaries, conflict, soft-delete/restore, parent read and write denial.

### 12.2 Papers and dictionaries

Requests: `GET/POST /api/students/:studentId/papers`; `PUT/DELETE /api/students/:studentId/papers/:paperId`; `GET/POST /api/paper-types`; `GET/POST /api/paper-schools`. Batch replacement belongs to W07, not individual paper save.

Paper form: subject ID/name, date, type, school, description, strengths, improvements, optional score/total. Require type/school and both evaluation texts; description ≤200, each evaluation ≤1000; optional score 0–500, total 1–500, score ≤total; handlers convert paper numeric values to integers. Reflect server-normalized values after save and test decimal input handling rather than silently displaying a value the server did not store.

Dictionary create trims name and can return 409 with an existing row. Offer/select that existing option after confirmation rather than duplicate it. R cannot create shared dictionaries. Current mini has no bound dictionary deletion UI; DELETE endpoints stay optional F50. Referenced soft-deleted papers can also prevent dictionary deletion.

Individual paper update/delete requires original version and student scope; deletion is soft. It sends no notification. A subsequent daily batch can replace active standalone papers for that date, so invalidate/reconcile both editors and preserve day-set semantics.

Acceptance: complete form and cancellation; catalog duplicate, denied reviewer creation, optional scores, required evaluations, server-normalized integers, stale update/delete, parent read-only, daily batch interaction, bin round trip, and no unsupported publication status.

## 13. W10 — Plans, completion records, and administrator summaries

Coverage: F32–F35; C10. Add missing React functionality using the prototype planning layout plus administrator tabs.

| Surface | Existing request and important fields |
|---|---|
| Grade weekly plan | `GET /api/grade-weekly-plans?weekStarting=...` → `{cycle,plans}`; `POST /api/grade-weekly-plans` `{grade,weekStarting,weekEnding?,topic,notes?}`. |
| Student record | `GET /api/students/:studentId/weekly-plan-record?weekStarting=...` → `{cycle,student,plan,record,completed}`. |
| Save completion | `POST /api/student-weekly-plan-records` `{studentId,gradeWeeklyPlanId,score,completed,comment?}`. |
| Admin weekly | `GET /api/admin/weekly-plan-summary?weekStarting=...` → cycle/groups/metrics. |
| Admin term | `GET /api/admin/term-plan-summary?startDate=...&endDate=...` → current-grade grouped period summary. |

Grade plan editor selects week and grade, edits required topic and optional notes, and upserts grade+resolved cycle start. Use returned cycle boundaries. There is no plan delete endpoint or original-version check; do not invent either.

Student completion supports student/week selection, no-plan state, score, completed checkbox, and comment. Score is integer 0–100 or null; completed requires a score; zero is valid. Verify plan grade matches current student grade. Upsert by student+plan; no notification or delete action.

Admin weekly summary must distinguish no plan, no record, scored but unchecked, and completed with score. Term summary selects plan start dates inclusively, calculates average over scored records (not just completed), and uses current grade. An empty term does not have the same missing-week semantics as the weekly no-plan state. Show missing topics/status detail and period controls.

Add all three existing export controls with the current month/recent-month/custom-range options for learning tasks; use W14's authenticated download behavior. Do not substitute the prototype's expanded student XLSX product for these exports.

Reviewer global plan scope is I03. Fix or explicitly resolve it before exposing global planning in reviewer mode; preserve scoped student completion if authorized. Explicit `/weekly-cycles` and student `/weekly-targets` editors are backend-only F49, not prerequisites for grade plan UI.

Acceptance: create/update same grade/week without duplicate, returned cycle dates, week/student navigation, grade mismatch, null versus zero, completed without score rejection, term boundary/current-grade/average fixtures, all summary states, all three downloads, and concurrent update behavior honestly represented without an invented version token.

## 14. W11 — Legacy and structured reporting

Coverage: F36–F41; C9/C10. Implement clearly separated tabs or sections for legacy semester/yearly summaries and structured reports. Use the same prototype visual vocabulary while retaining both data models.

### 14.1 Legacy quarterly/semester and yearly summaries

| Action | Existing request |
|---|---|
| Quarter list | `GET /api/students/:studentId/quarterly-summary?year=...` → active array, P visible-only. |
| Quarter save/delete | `PUT/DELETE /api/students/:studentId/quarterly-summary`; save `{year,quarter,summary,startDate?,endDate?,updatedAt?}`; delete year/quarter/version as supported by the handler. |
| Year read | `GET /api/students/:studentId/yearly-summary?year=...` → row or `{}`. |
| Year save/delete | `PUT/DELETE /api/students/:studentId/yearly-summary`; save `{year,summary,updatedAt?}`; delete year/version. |
| Legacy AI | `POST /api/ai/quarterly-summary` with student/range; `POST /api/ai/yearly-summary` with student/year; omit saveReport or send false. |

Keep quarter choices 1–4 and year 2000–2100, custom semester dates up to 220 days, summary ≤5000, original versions for existing rows, pending/invisible after every save, and soft deletion. Existing backend `summaries[]` bulk support is retained; reproducing it as a new UI is not necessary for the bound single-summary workflow.

AI fills the editor only. Explicit legacy PUT persists the summary; do not accidentally use a shared structured-generation helper whose default saveReport is true. Parent reads remain available for visible legacy records. Preview/copy and range-export controls remain available; yearly export uses selected dates while yearly AI uses year.

### 14.2 Structured report generation and list

Requests: `GET /api/students/:studentId/reports?reportType=...&year=...&visibleToParent=...`; `GET /api/reports/:reportId`; `POST /api/ai/quarterly-summary` or `/api/ai/yearly-summary` with `saveReport:true` and the selected date/year fields.

List responses are lightweight metadata/summary preview; detail is the heavy parsed response. Preserve report type/year/visibility filters, modified ordering, empty/loading/error states, and per-child seen markers. Parents receive only visible reports; raw AI and parse diagnostics must not be newly exposed to them.

Generation persists a draft/invisible structured row and returns `savedReport`/`reportId` with generated content. Capture the saved ID and navigate/refetch it; **do not then POST `/api/reports` again**. Repeated intentional generation may create multiple reports for the same period. A lost response requires list reconciliation before retry; no existing idempotency key guarantees exactly one row under an ambiguous failure.

Show parse warnings and summary fallback to eligible managers. Provider/configuration failure leaves selected inputs intact. Term configuration is not required by current generation; do not block on `academic_terms` or make period analytics a mandatory pre-generation API.

### 14.3 Detail, editing, and nested field preservation

Render actual available attendance/study hours, English count/average rows, subject summaries, and overall evaluation. No data is distinct from zero. Read `finalReport` first, then `structuredReport`, then textual summary. Reuse/port pure logic from `miniprogram/utils/reportViewModel.js:96`, `:131`, `:187` and `reportMarkdown.js`.

Current bound editing controls edit the overall summary and each subject summary (`miniprogram/pages/report-detail/index.wxml:66`, `:95`). Helper support for other fields is not proof of additional active controls. Preserve those other fields while editing the bound fields; broader narrative editing is an optional UI extension.

| Data | Quarterly mapping | Yearly mapping |
|---|---|---|
| Overall editable summary | `finalReport.executiveSummary` | `finalReport.annualExecutiveSummary` |
| Subject editable summary | `subjectReports[].summary` | `subjectReports[].annualSummary` |
| Highlights to preserve | `keyHighlights[]` | `annualGrowthHighlights[]` |
| Concerns to preserve | `keyConcerns[]` | `longTermConcerns[]` |
| Recommendations to preserve | `nextStageRecommendations[]` | `nextYearRecommendations[]` |
| Teacher comment to preserve | `teacherComment` | `teacherAnnualComment` |
| Subject detail to preserve | strengths, areasToImprove, nextSteps, evidence | growth, challenges, nextYearFocus, evidence |
| Shared nested content | `englishSpecialAnalysis`, including summary, teacherSuggestion, skill reports and other existing fields | Same preservation rule |

Retain subjectRawName/subjectName identity separately from localized display text. Recommendations have area/recommendation/priority fields; preserve their object structure. Preserve supported unknown nested content through edits rather than reconstruct a reduced report from visible controls.

Build PATCH `{finalReport,summary}`; derive the textual summary consistently with the existing helper, including preserved highlights/concerns/recommendations/comments. Cancel restores the loaded report. PATCH supports title/status/visibility too, but content edit must not alter them accidentally. No original timestamp is compared; do not claim conflict protection that the server lacks.

### 14.4 Publication and review state

| Operation | Result and notification behavior |
|---|---|
| Structured AI generate with saveReport | Draft, invisible; no publication notification. |
| Content PATCH on visible report | Visibility remains true; save is not a resubmission and does not inherently notify. |
| Mini-style admin publish from list/detail | PATCH report `{status:'final'}`, then PATCH `/api/reports/:reportId/visibility` `{visibleToParent:true}`. Two independent writes. |
| Queue publish of structured draft | Existing admin review endpoint sets visibility only; draft may become visible. |
| False → true via visibility/content PATCH or queue | Existing structured notification path; unchanged true does not repeat that transition's send. |
| Unpublish | Visibility false; status unchanged; no notification. |
| Normal structured POST visible=true | No notification on that create path; manual create UI is not required baseline. |
| Delete | `DELETE /api/reports/:reportId`; scoped soft deletion, no version parameter. |

Show draft/final and visible/hidden as two independent badges. Support all four combinations rather than invent submitted/reviewed/returned. If step one of publish succeeds and step two fails, show final-but-hidden and retry/reconcile visibility only. Do not represent “final” as proof that parents can see the report.

Use accurate save text instead of the mini's misleading “pending administrator publication” toast for an edit that remains visible. Re-review-on-edit, publication version histories, and queue finalization changes remain explicit decisions with backend work if adopted.

Acceptance: legacy and structured records coexist; parent-visible legacy rows are reachable; AI false versus true persistence; no redundant report insert; quarter/year range limits; nested round-trip preservation; null/malformed historical JSON; edit/cancel/reload; visible edit retains visibility; two-step failure; all four status/visibility combinations; queue draft publish; unpublish/republish notification distinction; delete/bin recovery; local Markdown copy.

## 15. W12 — Administration, approvals, roles, and review

Coverage: F42–F46; C2/C7/C10. Reuse the existing admin aggregate, approval, and legacy edit code in `src/pages/admin/AdminDashboard.tsx`, but split it into maintainable screens without losing drilldowns.

### 15.1 Student administration

Use `GET /api/admin/student-management` for metrics, search/grade/status filters, histories and pending counts. Count legacy and invisible structured reports according to the existing aggregate rather than assume only structured final reports need review. Student detail links open the shared authorized daily, weekly, legacy and structured editors; preserve original versions where the editor requires them.

The admin profile editor must send all intended parent IDs. Keep wellbeing download alongside student detail, with its actual XLS format and contents. Do not remove administrator daily/weekly authoring simply because the prototype's role table excludes it; resolve strict-teacher dependencies as described in W07.

### 15.2 Approval and identity-grouped role editing

| Action | Existing request |
|---|---|
| Pending accounts | `GET /api/admin/pending` → parents/teachers arrays. |
| Users and groups | `GET /api/admin/users` → identity groups and roles. |
| Approval/rejection | `POST /api/admin/approve` or `/api/admin/reject` `{id,role}`. |
| Set roles/display name | `POST /api/admin/users/set-roles` `{sourceRole,sourceId,roles,displayName?}`. |

Build user search, role filter, pending state, approve/reject, display-name edit, multi-role checkboxes, save/cancel, and current result refresh. Preserve identity grouping by unionid/openid/role-ID fallback; do not merge arbitrary same-name accounts in the UI.

Roles must be nonempty/valid; display name 1–40 when submitted; source requires WeChat identity. Explain that role assignment changes authorization. Server protects self/last-admin removal and clears password fields while upserting approved T/P roles. Retain these behaviors in tests and account-continuity decisions; do not assume password sessions remain valid forever after role edits.

Fix parent-role removal protection for secondary bindings and multi-table consistency (I05) separately before that destructive transition is accepted. Errors keep the proposed role selection visible for correction, while server refresh establishes actual current roles after an unknown/partial outcome. There is no existing audit-history screen to display.

Approval/rejection does not send a subscription notification or email. Status changes affect subsequent authenticated checks/login. The additive `/api/admin/users/assign-role` endpoint is distinct backend-only functionality; do not substitute it for set-roles and silently lose removal semantics.

### 15.3 Four-type review queue

Requests: `GET /api/admin/feedback-review`; `POST /api/admin/feedback-review/:type/:id/publish`; `DELETE /api/admin/feedback-review/:type/:id`. Type values are `weekly`, `quarterly`, `yearly`, `report`.

| Queue type | Open/edit destination | Publish semantics |
|---|---|---|
| weekly | Shared weekly detail by student/week | reviewStatus published + visible; every successful repeat invocation can notify. |
| quarterly | Legacy summary by student/year/quarter | published + visible; repeat invocation can notify. |
| yearly | Legacy summary by student/year | published + visible; repeat invocation can notify. |
| report | Structured detail by report ID | visibility only; false→true notification; does not necessarily finalize draft. |

Queue membership for legacy records is pending **or** invisible; structured membership is invisible, including drafts. Route each row using its returned type and identity. Don't collapse all rows into a structured report detail route. Queue delete is soft deletion but bypasses the normal editor's version/lock checks; make its distinct behavior explicit in tests and I07/I12 corrective work.

Disable duplicate submit while an operation is pending. Do not retry publish after timeout without checking current state and considering duplicate notification risk. A successful API response means the publish operation completed; it does not prove WeChat delivery.

### 15.4 Notification test table

Use a stubbed notification sender and assert recipient selection includes deduplicated binding parents plus legacy parent. Never use live subscriptions for ordinary tests.

| Event | Existing send expectation |
|---|---|
| Daily save/delete, paper create/update/delete, plan save | No send. |
| Weekly/legacy ordinary save or AI-only generation | No send. |
| Weekly/legacy admin publish | Send path on successful publish, including repeats. |
| Structured visibility false→true | Send path; unchanged true does not trigger another transition send. |
| Structured unpublish/content-only edit/delete/restore | No new publication send solely for that operation. |
| Scored exam POST | Send path. |
| Scoreless exam POST or later scored exam PUT | No corresponding scored-create send. |
| Approval/rejection, profile changes, local seen markers | No send. |

Missing template/openid and sender failures are logged/skipped by existing code; no durable delivery ledger exists. Correcting duplicate publication behavior is optional unless separately adopted as a release correction; do not claim exactly-once delivery from button disabling.

Acceptance: all four types load/open/publish/delete correctly; draft appears in structured queue; parent visibility changes after publish; historical editors retain data; last/self-admin protection; both binding models protected on role removal; approval states; identity grouping; no false notification claims; exact send/no-send cases using mocks.

## 16. W13 — Recycle bin and permanent deletion

Coverage: F47; C11. Requests:

- `GET /api/students/:studentId/bin` → `{studentId,retentionDays:30,groups}`.
- `POST /api/students/:studentId/bin/restore` `{recordType,recordId}`.
- `DELETE /api/students/:studentId/bin/permanent` with the same JSON shape.

| Display group | recordType values |
|---|---|
| Daily progress | `dailyProgress` |
| Weekly reports | `weeklyReport` |
| Reports | `studentReport`, `quarterlySummary`, `yearlySummary` |
| Exams | `exam` |
| Papers | `paper` |

Show title/summary, original business date, deletion time, deleting user, and remaining days from the response. Use recordType+recordId as the key; IDs alone can collide across tables. Current report sublists are concatenated, not guaranteed globally date-sorted. A deliberate display sort is fine, but do not infer a new backend order or pagination contract.

Restore requires ownership and deleted state. Current handlers do not enforce the list's age cutoff, acquire action locks, or compare a client version. Restoring clears deletion metadata, retains existing review/status/visibility, refreshes modified metadata, and sends no notification. Warn appropriately that a previously visible restored report may immediately reappear for parents. Active unique-key collisions need a clear conflict result; do not overwrite the active row or auto-permanently-delete the older row.

Permanent deletion is irreversible. Confirm exact item and resource type, then refresh bin and affected live views. Exam permanent deletion also removes score rows. Subject hard deletion and daily paper batch replacement can remove records outside the bin path; the UI must not promise everything is recoverable.

The 30-day display window is not proof of automatic cleanup. Manual admin cleanup exists as F51, without a bound mini action or scheduler. Keep it outside baseline UI unless selected. Student hard deletion remains W03 and is never presented as a restorable bin operation.

Acceptance: seven types/five groups; hidden legacy records included; restore visible record; deleted/nondeleted ownership failures; active-key collision; strict 29/30/31-day list boundaries; permanent exam scores; repeated click/error refresh; parent denial; reviewer demo scope; no notification; no automatic cleanup claim.

## 17. W14 — Downloads, previews, copying, and local indicators

Coverage: F04, F14, F23, F35, F41, F46; C10. Implement browser platform behavior separately from business services so all pages use the same tested mechanisms.

### 17.1 Export inventory to implement

| Action | Existing source | Output and parameters |
|---|---|---|
| Legacy/range learning report | `GET /api/students/:studentId/report-export` | `startDate,endDate,format=markdown`; JSON with hasData/fileName/content/stats, or hasData false/message. Maximum 370 days. |
| Student wellbeing/weekly reports | `GET /api/admin/students/:studentId/wellbeing-export` | Excel 2003 XML `.xls`; no date filter. Actual builder uses weekly reports with related daily/paper content. |
| Admin weekly plan | `GET /api/admin/weekly-plan-summary/export` | `weekStarting`; XML `.xls`. |
| Admin term plan | `GET /api/admin/term-plan-summary/export` | `startDate,endDate`; XML `.xls`, maximum 370 days. |
| Learning task completion | `GET /api/admin/learning-task-completion/export` | `startDate,endDate`; real OOXML `.xlsx`, maximum 370 days. |
| Weekly/legacy text preview save | Local prepared content | Text/Markdown Blob; no additional business API. |
| Structured report Markdown copy | Local report renderer | Format current report, including supported nested content; manager-only current mini action. No separate export endpoint. |

The range report aggregates current source data and current chapter snapshot for dates; it is not a download of a selected saved structured report. Weekly source selection is by week start. Respect parent filtering implemented by the server and the privacy decision register. Do not name all server outputs `.xlsx` or add unsupported date fields to wellbeing export.

### 17.2 Browser behavior

For binary endpoints use authenticated fetch, check status/content type, and create an object URL from the successful Blob. Derive a safe filename from exposed Content-Disposition where available, otherwise use the known resource/format; do not assume cross-origin response headers are exposed. Revoke the URL after triggering a browser download. An error JSON body must never download as a spreadsheet.

For JSON Markdown export, check `hasData` first; no-data displays its message without an empty fake download. Preserve Unicode content and appropriate extension. Clipboard uses browser support with a selectable-text fallback. Preview remains readable if clipboard/file sharing is unavailable.

The current mini preview share action points to the dashboard. Preserve that meaning with an authorized app link or copy-link fallback; do not invent a public report URL or public sharing endpoint. Browser Web Share support is an optional enhancement over a reliable copy/download fallback. All linked private pages authenticate normally.

Local drafts and seen indicators cannot be transferred from mini storage on another device. Document this transition in relevant UI help without pretending there is an existing migration API. Account namespaces prevent cross-user disclosure on a shared browser; a new server unread/draft system is optional.

Acceptance: all four admin files have the right format/content and Unicode filename handling; JSON no-data does not create a file; 401/403/500 does not create a corrupt download; text/Markdown copy and fallback; range boundaries; object URL cleanup; no public sharing of private data; reload/account/child behavior for local indicators and drafts.

## 18. Backend dependencies and decisions kept separate from frontend parity

The following are not requests to duplicate business services. Implement narrowly scoped fixes with their own review and regression tests when the web implementation is authorized. Preserve shared mini compatibility unless a behavior change is explicitly chosen.

| Dependency | Work and release effect | Audit finding |
|---|---|---|
| Browser identity mechanism | Choose and implement real identity-preserving browser authentication; verify provider availability and account mapping. Required for full F01 completion. | C1, I04 |
| Session scope DTO | Preserve reviewer flags on authenticated refresh; validate cached sessions; correct frontend child filtering. Required for reliable reviewer/parent routes. | I11 |
| Reviewer authorization | Validate existing record ownership as well as submitted studentId; resolve global catalog/plan/cycle/term scope. Required before reviewer release. | I03 |
| Exposed credential/diagnostic behavior | Protect unauthenticated teacher update; remove browser token logging/long-lived URL handoff; resolve signing/credential defaults and live diagnostic exposure through separate security review. Source presence is not proof of deployed exposure. | I01, I04 |
| Student hard deletion | Complete intended relation cascade and ensure atomic result/rollback; test every relation. Blocks completion of F12. | I02 |
| Parent role removal | Protect secondary bindings and ensure consistent multi-role changes. Blocks unsafe removal transition, not unrelated read pages. | I05 |
| Admin daily dependencies | Decide valid admin save behavior across strict-teacher paper/loss/topic endpoints; preserve allowed daily authoring without impersonation. Blocks full admin daily parity. | I06 |
| Daily/paper consistency | Frontend recovery state is mandatory; backend transactional batch or stronger two-stage semantics is a separate fix. Do not claim atomic full-save behavior until implemented and tested. | I06 |
| Legacy weekly data preservation | Browser serializer preserves untouched historical fields; duplicate POST errors should have truthful UI handling. Optional server error normalization is separate. | I08 |
| Publication concurrency/semantics | Accurate UI is mandatory; re-review, finalization, version checks and idempotent notification changes require explicit contracts. | I07, I12 |
| Targets/completion history | Label actual cycle target source and snapshot basis. Target unification or historical completion tracking needs a separate model/change. | I09 |
| Parent data projection | Default to audited access with accurate UI; any stricter server projection must be chosen per resource, including exports/analytics, without accidental data loss. | I10 |
| Bin policy/locking | Preserve truthful restoration visibility/retention behavior; stronger retention enforcement, locks, scheduler or history is separately scoped. | I12 |

Security/correctness findings are not acceptance criteria for deliberately recreating faulty behavior. Every approved deviation from the existing implementation should identify its reason, affected mini/web callers, request/response compatibility, data impact, and test evidence. Do not smuggle a permission redesign into a frontend helper.

### 18.1 Decision register

| ID | Decision | Working implementation position | Must settle before |
|---|---|---|---|
| D01 | Website WeChat versus mini-authorized handoff; token storage/transport | Browser identity unresolved; implement session abstraction and isolated fixtures first, not fake login. Preserve existing business auth contract unless explicitly extended. | Production browser login |
| D02 | Existing password users and retired auth pages | Preserve usable password entry until deliberate deprecation; replace 410 workflows with honest explanations. Credential hygiene is separate required review. | Authentication cutover |
| D03 | Ordinary-teacher creation with parent IDs versus M-only incremental binding | Preserve current create scope; do not adopt admin-only prototype binding rule. Decide any backend permission change explicitly. | Changed binding policy, if any |
| D04 | Admin daily paper behavior | Unresolved dependency; shared editor must distinguish capability and partial save. No silent middleware widening. | Admin full daily workflow |
| D05 | Parent daily detail/export/analytics privacy | Audited server access is the factual baseline; stricter projection is not assumed. | Any reduction/new projection |
| D06 | Reviewer demo writes/global scope | Keep legitimate scoped writes, fix scope leaks and refresh metadata. | Reviewer release |
| D07 | Visible structured edits, queue drafts, repeat legacy sends | Display current behavior accurately; no new submitted/returned states or notification ledger by default. | Any altered publication semantics |
| D08 | Transactional deletion, role removal and paper replacement | Fix unsafe destructive operations separately; test rollback/reconciliation. | Affected destructive acceptance |
| D09 | English target source and historic completion dates | Keep separate models and source-derived snapshot labels. | Any unified target/history feature |
| D10 | Optional backend-only screens and product additions | Excluded from baseline UI until selected. | Starting their implementation |
| D11 | Hosting/base path/origin/auth callback configuration | Respect current application setup; decide deployment separately after implementation evidence. | Deployment/cutover |

The UI and contract work not dependent on an unresolved decision can proceed against fixtures and existing endpoints. A blocked feature remains marked incomplete; do not ask for decisions already resolved by the user's migration objective.

## 19. Implementation sequence and reviewable delivery units

Each unit should produce working code plus focused evidence for its behavior. These are dependency-ordered implementation tasks, not claims that work has already passed. Avoid a giant replacement of all screens in one change.

| Phase | Deliverable | Depends on | Exit evidence |
|---|---|---|---|
| P0 — Baseline and fixtures | Source-diff check, feature checklist, isolated test roles/data, decisions D01–D11, tracked backend blockers. | Audit and plan | Every baseline F row assigned; destructive/security issues separated; test execution cannot reach production. |
| P1 — Foundation and shell | Shared transport/errors/query keys/date helpers; prototype theme/shell/mobile layout; session state; route guards and compatibility routes. | P0 | Real or isolated-fixture authenticated read, rejected direct URL, profile refresh, cache isolation, responsive keyboard navigation; no mock production identity. |
| P2 — Browser identity and scope corrections | Chosen authentication bridge; reviewer DTO/ownership corrections; account continuity and secure handoff. Can overlap with fixture-driven UI development. | D01/D02, P1 | Same existing account/student bindings before/after browser login; role/approval/reviewer refresh cases; no duplicate identity. |
| P3 — Roster and curriculum | W02–W04: dashboards, child switching, M-aware roster/parents, tree/catalog/assignment. | P1; P2 for real login | Multi-parent, parent tree, required subject, reset and scope scenarios. Hard-delete acceptance waits for I02. |
| P4 — Shared data and settings | W05–W06: historical adapters, scoring/dates, global/student English config/reset, study defaults. | P1/P3 data context | Legacy fixture display, date boundaries, field round-trip, global/student merge/reset. |
| P5 — Assessments and daily | W09 paper/dictionary primitives, W07 full editor/drafts/batch recovery; exam editor may proceed alongside. | P3/P4 | Successful persisted reload and two-client/partial-save fixtures; strict-teacher/admin dependency resolved for affected path. |
| P6 — Weekly and planning | W08/W10: source cards, AI/save/delete/preview; grade plans, student records, admin summaries. | P4/P5 | Seven-day source boundaries, AI no-save, pending/visibility, plan/score/summary tests. |
| P7 — Reports and admin | W11/W12: legacy and structured reports, four-type review, accounts and student drilldowns. | P3–P6 | Both report families, nested preservation, real state/notification matrix, multi-role/binding protections. |
| P8 — Recovery and browser completion | W13/W14 and integration of all exports/local markers/subscriptions. Shared helpers can be implemented earlier; this phase closes their cross-feature coverage. | P5–P7 | Seven bin types, all existing exports, local draft/seen/copy/download behavior, subscription handoff. |
| P9 — Parity acceptance | Full role journeys, two-client conflicts, browser responsive/deep-link checks, dependency fixes, source regression. | All baseline units | All F01–F47 acceptance rows pass or have explicit accepted exceptions; no toast-only controls counted as complete. |
| P10 — Separate release decision | Hosting/callback/environment review, controlled staging validation, cutover/rollback plan. | P9 and D11 | Explicit release approval and deployment evidence; not implied by this document or a passing build. |

Within each domain, implement read/list/detail first, then edit/create, then destructive actions and recovery. This lets existing records validate adapters before writes are enabled. Do not delete an old route/component until its replacement covers its callers and acceptance cases.

### 19.1 Expected file change areas during future implementation

| Existing area | Intended change |
|---|---|
| `src/App.tsx`, layout/Navbar | Consolidate shell/guards/routes; preserve base path and old URLs. |
| `src/context/AuthContext.tsx`, `src/utils/auth.ts`, `src/pages/WebAuth.tsx` | Unified verified session, admin/reviewer metadata, safe handoff, cache cleanup and token-log removal. |
| `src/config/api.ts`, `src/services/api.ts` | Reuse base configuration; extract typed transport/domain clients; migrate component fetches without changing route contracts. |
| `src/pages/Students.tsx`, `StudentProfile.tsx`, `AddStudent.tsx` | Complete server-scoped child navigation and multiparent management. |
| `src/components/ui/SubjectTopicsPanel.tsx` | Reuse tree/progress/assignment behavior with precise permission and reset handling. |
| `src/components/ui/DailyProgressForm.tsx`, `src/pages/ProgressForm.tsx` | Converge on complete editor, versions, historical/task/paper support and draft recovery. |
| Weekly forms/panels | Shared adapters, version-aware writes, AI, delete, source cards and historical-field preservation. |
| `src/pages/admin/AdminDashboard.tsx` | Extract screens while retaining current aggregate, authoring and legacy features; add roles/review/settings/exports. |
| New domain feature modules | Implement missing assessment, plan, report, bin, configuration and parent-management screens. |
| Existing translation/style files | Prototype tokens and consistent bilingual shell/new controls; no runtime mutation of reference HTML. |
| Narrow server/auth/handler changes | Only chosen auth adaptation and separately reviewed defect fixes, with compatibility tests; no duplicate business routing tree. |

## 20. Verification plan and definition of done

### 20.1 Test environments and existing harness limits

Use current Vitest tests for pure helpers and mocked handler contracts. Existing examples include `tests/unit/dailyProgressRequest.test.ts`, `englishNormalize.test.ts`, `lossPointValidation.test.ts`, `chinaDate.test.ts`, `weeklyCycles.test.ts`, `studentAnalytics.test.ts`, and `tests/integration/student-reports.api.test.ts`.

The existing report integration suite mocks the DB and action locks and stubs fetch; it is not real database concurrency or browser evidence. `test:e2e` currently runs `tests/business` through Vitest, not an installed browser automation suite. `vitest.config.ts` uses the Node environment and `tests/**/*.test.ts`; do not claim React DOM interaction or browser coverage from that command. Add a browser/DOM harness deliberately when implementing, or execute and record controlled manual browser journeys until one exists. Do not install tooling as part of this document task.

Before running any future suite that imports `server/index.ts`, verify its DB/provider/notification isolation. `tests/setup/env.ts` sets some test defaults but is not by itself a production-network guard. The default `npm run dev` also starts the API and Drizzle Studio; do not use it casually against unknown environment configuration. Future UI development can use `npm run dev:vite` with an explicitly isolated mock/API target.

### 20.2 Fixture matrix

Create fixtures with ordinary teacher, M-teacher, admin, pending/rejected accounts, reviewer+demo student, and parents with zero/one/multiple children. Include secondary-only binding and an unlinked parent.

Required records include: old generic and string English; V2 and custom tasks; renamed/disabled historical tasks; null/zero/imperfect scores; scoreless exam; standalone and daily papers on the same day; old feedback with nonempty legacy fields; legacy summaries visible/hidden/deleted; structured string/object/malformed JSON; every draft/final × visible/hidden combination; all seven bin types; active restore collision; plan missing/unscored/scored-unchecked/completed; student relations covering the full hard-delete cascade.

### 20.3 Focused automated tests

| Test layer | Behavior to establish |
|---|---|
| Pure adapters/serializers | Historical reads, non-destructive edits, nested report preservation, parent ID set preservation, date-only/weekly-cycle boundaries, grade rounding, null versus zero, endpoint-specific payloads. |
| Transport/service contracts | Exact method/path/query/body, actual response shapes, 401/403/410, conflict/lock metadata, binary versus JSON handling, no unsafe mutation retries. |
| Session/capability tests | Profile restore before private render, revoked approval, admin/reviewer metadata, direct-route denial, per-account cache cleanup, per-student response race handling. |
| Stateful workflow tests | Daily two-stage recovery, created-student/failed-assignment recovery, AI persistence true/false, two-step publication partial failure, nested edits, bin restore collision. |
| Backend regression tests for approved fixes | Anonymous/wrong-role rejection; original and submitted student ownership; role removal through secondary bindings; complete deletion rollback; paper replacement failure handling. |
| Concurrency tests with isolated real DB where needed | Two clients using the same updatedAt, student/catalog/AI locks, unique active rows, restore collision and transactional fixes. Mocked locks cannot certify these. |
| Browser tests | Real inputs/dialogs, keyboard/focus, reload/back/forward, mobile forms, parent child switching, clipboard fallback, files and expired sessions. |
| Notification tests | Stub sends, verify exact recipient set and trigger/no-trigger matrix; no live WeChat or mail. |

Relevant future commands, after isolation is verified and dependencies are already installed:

```sh
npm run test:unit
npm run test:api
npm exec --offline -- tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```

Run targeted tests during each unit, then appropriate full checks at integration. Record baseline failures separately from introduced failures. A Vite build is not a replacement for TypeScript checking, and the current tsconfig is not strict. Do not impose the earlier brief's new 90% numerical coverage gate as an accepted requirement; use feature acceptance plus existing configured checks, and measure any new gate explicitly if adopted.

### 20.4 End-to-end acceptance journeys

1. **Identity and continuity:** existing approved parent signs in through the selected browser mechanism, sees all existing children including secondary bindings, logs out, and does not expose cached data to the next account. Pending/rejected states and reviewer scope survive refresh.
2. **Management:** eligible teacher creates student with multiple parents and subjects; assignment-stage failure recovers without duplicate student; ordinary profile edit preserves bindings; protected parent deletion fails; authorized hard delete passes corrected all-relations behavior.
3. **Curriculum:** create level/subject/topic, assign, sync, toggle independent conditions, complete descendants, undo parent only, view as parent, and validate protected destructive operations.
4. **Settings/daily:** change global config, override/reset a student, retain old snapshots, initialize a new day from study defaults, create every canonical/custom task shape, save/restore a local draft, publish with all day papers, and recover a failed/conflicting batch.
5. **Weekly:** select Sunday week, verify daily/paper source cards through Saturday, generate summary without saving, save pending, admin publish, parent read, edit back to hidden, then delete/restore.
6. **Assessments:** create scoreless schedule, view upcoming reminder, add results by PUT without scored-create send, create a scored exam with send, edit/delete/restore exam and standalone paper, and reconcile a same-day daily batch.
7. **Planning:** create grade plan, mark student complete with zero/other valid score, inspect no-plan/scored-unchecked states in admin weekly/term summaries, and download all three plan/task exports.
8. **Reports:** read and edit legacy quarter/year without converting them; use legacy AI without structured save; generate structured draft once, edit nested summary fields without losing other content, publish/unpublish, exercise queue-visible draft, and confirm parent filtering.
9. **Administration:** approve/reject users, edit identity-grouped roles/name, exercise last/self admin and secondary-parent protections, review all four content types, and export student wellbeing XLS.
10. **Recovery/platform:** restore and permanently delete all seven types in isolated fixtures; verify retention boundaries; copy/preview/download text and real files; verify per-child local seen indicators, subscription handoff, narrow browser layout, deep links and expired sessions.

For every journey, verify the persisted result through a subsequent read and, where relevant, another authorized account. A success toast, screenshot, or successful request alone does not prove the full workflow.

### 20.5 Completion evidence

Each baseline feature must have: reachable route/action; correct role/student scope; complete inputs and validation; confirmed endpoint response and persisted reload; loading/empty/error handling; applicable conflict/partial-save recovery; correct delete/restore/notification effects; prototype-consistent presentation; and a passing acceptance case or a specifically accepted exception.

Record source revision, environment, fixtures, commands/results, browser/device coverage, remaining decisions and known defects. Do not label unrun tests as passed. Keep the original mini program operational while shared-handler fixes are tested. Deployment and production-data validation require a separate authorized release step.

## Appendix A. Feature-to-work-unit completion checklist

Use the audit's detailed rows and action ledger alongside this checklist. Check a row only when its complete behavior passes; W numbers refer to this document's implementation units, not new API versions.

| Done | Audit feature | Implementation unit |
|---|---|---|
| [ ] | F01 WeChat/account continuity and first/pending login | W01 + P2 |
| [ ] | F02 Reviewer login and demo scope | W01 + backend I03/I11 |
| [ ] | F03 Profile refresh/edit/cancel/logout | W01 |
| [ ] | F04 Subscription authorization adaptation | W01, W14 |
| [ ] | F05 Role home and parent child chooser | W02 |
| [ ] | F06 Daily/weekly missing queues | W02 |
| [ ] | F07 Upcoming exams and incomplete tasks | W02, W09 |
| [ ] | F08 Student list/search/grade/detail | W02 |
| [ ] | F09 Add/edit student, parents and subjects | W03, W04 |
| [ ] | F10 Parent bind/unbind | W03 |
| [ ] | F11 Parent directory/linked students/deletion | W03 |
| [ ] | F12 Student hard deletion | W03 + backend I02 |
| [ ] | F13 Parent child switching and chapters | W02, W04 |
| [ ] | F14 Local unread/seen indicators | W02, W14 |
| [ ] | F15 Hierarchy and levels | W04 |
| [ ] | F16 Subjects and topic draft/editor/deletion | W04 |
| [ ] | F17 Student assignments/reset behavior | W04 |
| [ ] | F18 Catalog sync and topic conditions | W04 |
| [ ] | F19 Daily history/filter/pagination/context | W07 |
| [ ] | F20 Daily form/save/cancel/delete | W07 |
| [ ] | F21 English/custom tasks/exercises/loss points | W05, W07 |
| [ ] | F22 Embedded paper/dictionaries/batch replacement | W07, W09 |
| [ ] | F23 Local draft save/restore/discard | W07, W14 |
| [ ] | F24 Student English config/reset | W06 |
| [ ] | F25 Global English config/reset | W06 |
| [ ] | F26 Study defaults | W06 |
| [ ] | F27 Weekly list/filter/detail/preview | W08 |
| [ ] | F28 Weekly historical daily/paper cards | W05, W08 |
| [ ] | F29 Weekly AI/edit/save/delete | W08 |
| [ ] | F30 Exams/schedules/scores | W05, W09 |
| [ ] | F31 Standalone papers and dictionaries | W09 |
| [ ] | F32 Grade weekly plans | W10 |
| [ ] | F33 Student completion records | W10 |
| [ ] | F34 Admin weekly/term summaries | W10 |
| [ ] | F35 All plan/task downloads | W10, W14 |
| [ ] | F36 Legacy semester/quarter summaries | W11 |
| [ ] | F37 Legacy yearly summaries | W11 |
| [ ] | F38 Structured generation/list/filter | W11 |
| [ ] | F39 Structured detail/edit/copy | W05, W11, W14 |
| [ ] | F40 Structured publish/unpublish/delete | W11 |
| [ ] | F41 Long-text preview/copy/save/share/range export | W08, W11, W14 |
| [ ] | F42 Admin metrics/roster/detail/profile/drilldowns | W02, W03, W12 |
| [ ] | F43 Approval/rejection | W12 |
| [ ] | F44 User search/filter/display name/multi-role | W12 + backend I05 |
| [ ] | F45 Four-type content review | W12 |
| [ ] | F46 Student wellbeing XLS | W12, W14 |
| [ ] | F47 Bin/restore/permanent deletion | W13 |
| [ ] | F54 Existing web auth compatibility disposition | W01; explicit retained/deprecated routes and account path |

## Appendix B. Preserved capabilities and deferred additions

The audit's Appendix B remains the deduplicated authoritative inventory for all 144 API/operational route registrations and conditional SPA fallback. This plan groups required client operations by workflow instead of duplicating that inventory and risking divergence. Every active mini action maps to Appendix A above; every other inventory category has a disposition below.

| Feature/category | Disposition |
|---|---|
| F48 Terms and term/half/year analytics | Preserve existing `/api/academic-terms` and `/api/analytics/student/...` handlers. New configuration/analytics screens are optional; structured report generation does not require them. |
| F49 Explicit weekly cycles and student targets | Preserve `/api/weekly-cycles`, `/current`, and student `/weekly-targets`. Existing incomplete calculations still consume their model. New editors require scope and reviewer-policy decisions. |
| F50 Paper dictionary deletion | Preserve DELETE paper-types/schools endpoints and dependency checks. Optional management control; baseline includes existing create/select. |
| F51 Expired-bin cleanup | Preserve admin cleanup endpoint. No scheduler or routine automatic call added by this plan; optional admin UI and operating policy. |
| F52 Low-level account CRUD/additive role assignment | Preserve authorized backend capabilities; fix public teacher update separately. Do not expose general teacher/parent CRUD screens solely because handlers exist. |
| F53 Retained preview draft/chart/detail-delete helpers | Retain supported report APIs. Do not count unbound helpers as required screens; active list deletion and generated draft persistence are already baseline. Manual POST-report UI and extra charts are optional. |
| Compatibility aliases | Preserve plural single-day progress alias and unprefixed reviewer-login alias while moving new clients to canonical paths. |
| Retired signup/password/verification routes | Keep intentional 410 compatibility behavior unless separately redesigned; frontend explains or redirects old workflows. |
| Health/diagnostics/static fallback | Health and static routing are infrastructure, not student workflows. No user-facing diagnostic/mail buttons; separately secure diagnostics. |
| Google/provider linking | Separate identity project; no baseline Google button that simulates success. |
| Expanded per-student XLSX | Separate export product with its own datasets/ranges/permissions; existing XLS and XLSX exports ship first. |
| Audit histories, submitted/returned reports, read receipts | New data/workflow design and migrations, not inferred from prototype labels. |
| Cloud/autosaved drafts, notification center, new channels | Optional browser/product enhancements. Local drafts and existing WeChat sends remain baseline. |
| New permission matrix or `/api/web/v1` | Not adopted. Propose only if a concrete requirement cannot be met by shared handlers plus narrow auth/security changes. |

The future implementer should start at P0/P1, keep the audit open as the factual contract reference, and close the feature checklist through persisted and role-scoped behavior rather than visual resemblance alone.
