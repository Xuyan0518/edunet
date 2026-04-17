# EduNet

EduNet is a teacher‑parent learning management platform that includes a WeChat Mini Program (for teachers and parents) and a web admin app (for internal management). It captures daily learning activity, turns it into structured weekly/semester/yearly reports, and keeps families informed with minimal teacher overhead.

## What the app is about
EduNet helps teachers track student learning across subjects and topics, record assessments, and publish reports that parents can view in a clear, read‑only format. It is designed for multi‑teacher collaboration with conflict protection and optional AI‑assisted summaries.

## How the app works
### Roles
- **Teachers** create and update student records, log daily progress, and publish reports.
- **Parents** can view their child’s learning history and reports (read‑only).

### Daily flow
- Teachers create a **daily progress** entry for a student.
- Each entry includes attendance time window, subject activities, and optional comments.
- Practice **papers/quizzes** can be added during the daily flow (type, school, description, score).

### Weekly flow
- Daily progress entries roll up into a **weekly report**.
- Teachers can write the report manually or generate a draft with AI.
- Parents receive a notification when a new weekly report is published.

### Semester (term) flow
- A **semester summary** aggregates daily progress, weekly reports, exams, and papers within a date range.
- Teachers can generate AI drafts and then edit.
- Parents can only view published summaries.

### Yearly flow
- A **yearly summary** aggregates the entire year’s daily/weekly records, exams, and semester summaries.
- Teachers can generate AI drafts and then edit.
- Parents can only view published summaries.

### AI‑powered summaries (optional)
- AI uses structured context (student profile, daily progress, weekly reports, exams, papers) to draft weekly/semester/yearly summaries.
- Teachers can edit before publishing.

### Multi‑teacher safety
- The system uses **optimistic locking** across daily/weekly/semester/yearly records, exams, and papers.
- If two teachers edit the same record, the later save is blocked with a conflict prompt.

### Notifications
- Parents receive **WeChat subscribe messages** when new weekly reports, exams, semester summaries, or yearly summaries are published.

## Tech stack
- **Web admin:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router
- **Mini Program:** WXML/WXSS + JavaScript, WeChat SDK
- **Backend:** Node.js, Express, TypeScript (tsx), Zod
- **Database:** PostgreSQL (Neon) + Drizzle ORM + Drizzle Studio
- **AI (optional):** DeepSeek API
- **Notifications:** WeChat Subscribe Messages

## Project structure
- `src/` Web admin (React + Vite)
- `miniprogram/` WeChat Mini Program
- `server/` Express API + Drizzle ORM
- `server/migrations/` Database migrations

## Getting started
```sh
npm i
npm run dev
```
Starts the web app, API server, and Drizzle Studio.

For Mini Program development:
```sh
npm run dev:wechat
```
Then open the `miniprogram/` folder in WeChat DevTools and ensure `project.config.json` uses your AppID.

For Mini Program preview on real devices:
```sh
npm run preview:wechat
```
This starts the API on port `3900` and creates a public Cloudflare Tunnel URL.

Update `miniprogram/utils/env.js`:
- Set `API_BASE_URL` to `https://<your-tunnel-domain>/api`

Important notes for preview:
- The `trycloudflare.com` quick tunnel domain is temporary and changes often.
- For stable WeChat preview/testing, use a fixed HTTPS domain (deployed backend or a named Cloudflare tunnel).
- Add your API domain (without `/api`) to WeChat Mini Program server domain allowlist:
  - `request合法域名`
  - `uploadFile合法域名` (if used)
  - `downloadFile合法域名` (if used)
- Ensure backend `.env` has matching `WECHAT_APP_ID` and `WECHAT_APP_SECRET`.

## Deploy API To Render (Recommended for beta)
This repo includes `render.yaml` so you can deploy a stable HTTPS API domain without buying a domain first.

1. Push this repo to GitHub.
2. In Render, click **New +** -> **Blueprint** and select your repo.
3. Render will detect `render.yaml` and create `edunet-api`.
4. Fill required env vars in Render:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `WECHAT_APP_ID`
   - `WECHAT_APP_SECRET`
   - `CORS_ORIGIN` (optional, comma-separated)
   - You can copy from `.env.render.example`
5. Deploy and wait for green health check on `/api/health`.
6. Copy the Render URL (for example `https://edunet-api.onrender.com`).
7. Update `miniprogram/utils/env.js`:
   - `API_BASE_URL = "https://<render-domain>/api"`
8. In WeChat public platform, add `<render-domain>` into `request合法域名`.

Note:
- `localhost` / `http` is only for local devtools debugging, not beta (体验版).
- If Render free plan sleeps, first request may be slower.

## Database & migrations
```sh
npm run db:migrate
```



## Scripts
- `npm run dev` Start web + API + Drizzle Studio
- `npm run dev:wechat` Start API + Drizzle Studio (for Mini Program)
- `npm run start:api` Start API once (for production/deployment)
- `npm run db:migrate` Run database migrations

## API overview
Key endpoints live in `server/index.ts` for:
- Students, subjects, and topic progress
- Daily progress
- Weekly feedback
- Semester/yearly summaries
- Exams and scores
- Practice papers/quizzes
- AI summary generation
- WeChat notification triggers
