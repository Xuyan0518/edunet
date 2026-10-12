# Web authentication setup

The login page supports email/password, Google and WeChat QR authorization. `/signup` creates an email account; first-time social sign-in also creates an account. Teachers and parents remain pending until approved in the existing administrator account screen. Public signup cannot create administrators or grant access to student records.

## Database

Run `npm run db:migrate` against the intended database before deploying the updated API. Migration `0037_web_auth` adds Google subject IDs and separate WeChat website OpenIDs and widens password columns. Mini-program OpenIDs are preserved. Website and mini-program accounts are matched only when WeChat supplies a shared UnionID under the same Open Platform account.

New email passwords use salted scrypt hashes. Existing teacher/parent plaintext passwords are upgraded on successful password verification. Administrator passwords now use salted scrypt hashes and login throttling; run `npm run db:migrate-admin-passwords -- --apply` against each explicitly configured deployment database before release. Production administrator login rejects plaintext credentials. Email verification and administrator approval are separate requirements; password recovery never approves an account.

## Server configuration

Set these on the API server, never in Vite client variables:

```dotenv
JWT_SECRET=<long-random-secret>
API_PUBLIC_URL=https://your-app.example
WEB_APP_URL=https://your-app.example
CORS_ORIGIN=https://your-app.example
GOOGLE_CLIENT_ID=<web-client-id>
GOOGLE_CLIENT_SECRET=<web-client-secret>
WECHAT_WEB_APP_ID=<approved-website-app-id>
WECHAT_WEB_APP_SECRET=<website-app-secret>
```

`API_PUBLIC_URL` is the external API origin without `/api`. `WEB_APP_URL` is the frontend URL, optionally including its deployment base path. Use HTTPS in production, and host the API and frontend on the same site so SameSite cookies work. Cross-origin deployments on that site require the exact frontend origin in `CORS_ORIGIN`. Local development can use `http://localhost:3003` for the API and `http://localhost:5173` for the web app.

Register the Google callback URL `https://your-app.example/api/auth/web/google/callback` in a Google OAuth web client. Configure the consent screen and test users if the Google app is in testing mode. See [Google's server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

WeChat requires an approved **Website Application** in the WeChat Open Platform; mini-program AppID/secret credentials do not enable website QR login. Register the callback domain for `https://your-app.example/api/auth/web/wechat/callback`. The button opens WeChat's hosted QR page; the user scans and confirms on their phone. See [WeChat's website login guide](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html).

If either provider is unconfigured, its button is disabled and the page explains why. No secret or provider access token is sent to the frontend. Callbacks validate signed browser-bound state; a short-lived HttpOnly cookie hands the app session to the frontend without putting tokens in redirect URLs. Independent accounts are never automatically linked by matching email addresses. Email signup queues an ownership-verification link when delivery is configured; password recovery proves ownership using a separate, single-use link. Social-only accounts use their original provider instead of adding a password through recovery.

The API includes a per-process limit of 30 authentication attempts per IP per 15 minutes. For multiple API replicas, enforce a shared rate limit at the ingress. Configure Express proxy trust narrowly for your deployment before using forwarded client IPs; otherwise a proxy may cause users to share a limit.

## Verification

Run `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and `npx vitest run tests/integration/auth-web.api.test.ts tests/unit/password.test.ts`.

Then test with real configured providers: create an account, confirm pending approval, approve it, sign in, refresh, and log out. Repeat with Google and a real WeChat mobile scan. Check cancellation, an expired callback, and a rejected account. Automated provider tests mock external responses; they do not validate production credentials or WeChat application approval.

## Local setup on this Windows checkout

The local app uses Vite on port 3001, with `/api` proxied to the API on port 3003. Use **http://localhost:3001** consistently for sign-in; cookies are host-specific. Keep these values in the ignored root `.env`:

```dotenv
NODE_ENV=development
API_PUBLIC_URL=http://localhost:3001
WEB_APP_URL=http://localhost:3001
VITE_API_URL=/api
CORS_ORIGIN=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173
```

Retain the existing `DATABASE_URL`, `JWT_SECRET`, and mini-program credentials. `NODE_ENV=development` allows the OAuth cookies to work on local HTTP. Never use these development settings for a public deployment.

### Google console steps

1. Open [Google Auth Platform clients](https://console.cloud.google.com/auth/clients) and select the project that owns the existing `GOOGLE_CLIENT_ID` in `.env`.
2. Open the matching **Web application** client. Add this exact **Authorized redirect URI**:
   `http://localhost:3001/api/auth/web/google/callback`.
   This app uses the server OAuth flow; a JavaScript origin alone does not register the callback.
3. In **Branding**, provide the requested app name and contact details. In **Audience**, if the app is external and in Testing, add the Google accounts that will test sign-in. This implementation requests only `openid email profile`.
4. Use the matching client's existing secret if you saved it. Google states that newly created client secrets are displayed only at creation. If you cannot recover a secret, create an additional secret for that client if the console offers it, or create a new **Web application** client with the callback above. Preserve credentials used by any deployed app.
5. Enter the matching credentials directly in the local `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=<matching-client-id>
   GOOGLE_CLIENT_SECRET=<matching-client-secret>
   ```

   `VITE_GOOGLE_CLIENT_ID` belongs to an older browser integration; setting it does not configure this server OAuth flow. Never put the client secret in a `VITE_` variable or paste it into chat.
6. Restart the API and check `/api/auth/web/providers`. `google` should be `true`. Open the login page in your normal browser, select Teacher or Parent, and complete Google sign-in yourself. A first sign-in creates a pending account, requiring administrator approval.

See [Google's server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server) and [OAuth client management](https://support.google.com/cloud/answer/15549257).

### WeChat console steps

1. Open [WeChat Open Platform](https://open.weixin.qq.com/) and inspect **管理中心 → 网站应用**. This is separate from the mini-program console and its AppID/secret.
2. Use an existing approved website application, or submit a website application and complete the platform's current application and WeChat-login approval requirements. The console may require organization verification and website information; complete those account-owner steps yourself.
3. Choose the website domain that will receive the OAuth callback and register it in the website application's authorized callback-domain field. The app callback path is `/api/auth/web/wechat/callback`. A phone cannot reach this computer through `localhost`; use an approved reachable website domain for real QR sign-in.
4. Enter the website application's credentials in the API environment:

   ```dotenv
   WECHAT_WEB_APP_ID=<approved-website-app-id>
   WECHAT_WEB_APP_SECRET=<website-app-secret>
   API_PUBLIC_URL=https://<approved-domain>
   WEB_APP_URL=https://<approved-domain>
   CORS_ORIGIN=https://<approved-domain>
   ```

   Serve web and API under the same site and use `NODE_ENV=production` on that HTTPS deployment. Preserve `WECHAT_APP_ID` and `WECHAT_APP_SECRET` for the mini program; they are not substitutes for the website credentials.
5. Restart the API, confirm `wechat: true` in `/api/auth/web/providers`, and complete a real phone scan. Both providers share `API_PUBLIC_URL`; when switching to the HTTPS domain, also register `https://<approved-domain>/api/auth/web/google/callback` on the Google client.

The official guide is [WeChat website login](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html). The provider documentation could not be fetched during this setup, so verify current application and approval requirements in the console.

### Start and verify on PowerShell

Start these in two terminals from the repository root:

```powershell
node scripts/dev/server.mjs --web
```

```powershell
npm run dev:vite -- --host 127.0.0.1 --port 3001 --strictPort
```

The API launcher disables outbound notifications and uses the configured development database. Do not run `dev:seed` just to configure login. After credentials or URLs change, restart the API; Vite also needs restarting if its `.env` settings change.

```powershell
npm run dev:db:check
Invoke-RestMethod http://localhost:3001/api/auth/web/providers
```

`providers` reports only whether required configuration exists. It does not prove credentials, callback registration, provider approval, or successful sign-in. Complete a real provider sign-in to verify those.

## Account management and recovery — 12 October 2026

Migration `0039_account_management` adds explicit account identities, credential versions, single-use authentication tokens and a durable encrypted email queue. Existing role rows are linked only by proven Google/WeChat provider identifiers; matching emails alone do not join accounts. New provider signups reuse a proven identity across roles while retaining their separate approval status.

The administrator Accounts page supports role changes for email, Google, website WeChat and mini-program WeChat accounts. Retained roles keep their existing credentials. New roles inherit the selected account's sign-in methods and verified-email status; legacy plaintext source passwords are hashed before copying. An identity/email collision with an independent account is rejected instead of overwriting it. Role changes are transactional and protect the acting admin, the last admin, and parent roles with primary or secondary student bindings. Ordinary teacher/parent roles saved through the role editor are approved; verifying an email or recovering a password never approves an account.

Users can request recovery from **Forgot password?**, request a verification email from the login screen, and change their password from **Profile → Change password**. Recovery supports password-enabled parent, teacher and admin accounts. Reset links expire after 30 minutes; verification links expire after 24 hours. A newer request replaces the earlier link for that account and purpose. Password reset/change invalidates outstanding links and all existing sessions across linked roles. Users must sign in again; resetting a password does not automatically create a session.

Links use URL fragments, which are removed from the address bar after the page reads them. Token hashes are stored in the database, and queued email contents use authenticated encryption. Recovery requests return the same acknowledgement for eligible and unknown accounts, enqueue work without waiting on the email provider, and allow five requests per IP/email per 15 minutes. No token, password, email body or provider error body is logged.

### Resend production setup

Current setup, 12 October 2026: `mail.tongxin-eduhaven.com` is verified in Resend. The sender is `EduNet <no-reply@mail.tongxin-eduhaven.com>`, and the new API key is saved only in the ignored local `.env` file. Resend accepted one explicitly requested setup-test email (HTTP 200), and the user confirmed receipt in the destination inbox. This verifies the saved key, sending domain and delivery of that test message. This direct transport test did not drain the application email queue. The local development launcher still uses its private inbox. Production secret configuration, the deployed `WEB_APP_URL`, and the hosted recovery flow remain to be verified.

1. Create or sign in to your [Resend account](https://resend.com/).
2. Add a sending domain you own, preferably a subdomain such as `mail.your-domain.com`, in **Domains**. Add the DNS records Resend displays at your DNS provider and wait for **Verified**. Use the exact current records from the console, rather than copying example values. See [domain verification](https://resend.com/docs/dashboard/domains/introduction).
3. Create a **Sending access** API key scoped to that domain in **API Keys**. Save it directly in the production secret store; do not paste it into chat or place it in a `VITE_` variable. See [API keys](https://resend.com/docs/dashboard/api-keys/introduction).
4. Set these on the production API and, if separate, its mail worker:

   ```dotenv
   NODE_ENV=production
   AUTH_MAIL_MODE=resend
   RESEND_API_KEY=<sending-api-key>
   AUTH_EMAIL_FROM=EduNet <no-reply@mail.your-domain.com>
   WEB_APP_URL=https://your-app-domain.com
   JWT_SECRET=<existing-strong-production-secret>
   AUTH_MAIL_ENABLED=true
   ```

   `AUTH_EMAIL_FROM` must belong to the verified sending domain. Retain a stable encryption key: queued emails use `AUTH_MAIL_ENCRYPTION_KEY` if supplied, otherwise `JWT_SECRET`. A separate encryption key must contain at least 32 random characters in production. Rotating it without first draining the queue makes existing queued contents unreadable; request fresh links after a key change. Recovery mail does not require Google or WeChat credentials.

5. Run `npm run db:migrate` and `npm run db:migrate-admin-passwords -- --apply` against the explicitly chosen production database before starting the updated API. Use the production startup path, not `scripts/dev/server.mjs`.
6. The persistent Node API drains its email queue every five seconds. For deployments whose API processes do not stay alive, run **`npm run auth:mail-worker`** as a persistent worker service with the same database and encryption configuration. Multiple workers use database claims and Resend idempotency keys to avoid duplicate delivery. Failed sends retry with backoff up to five attempts; expired authentication links are not delivered. Queue rows in `failed` status require operator attention.
7. Verify delivery with your own test account: request a link, check the Resend delivery log and inbox/spam folder, complete the action, and confirm that old sessions and reused links fail. Keep link tracking disabled for authentication emails. The local tests do not establish real domain/DNS, spam placement or production delivery.

The prepared transport is Resend. SMTP/Gmail was not added as a second transport; the earlier Gmail verification utility belongs to the retired flow.

Authentication email delivery is independent of the WeChat notification switch. `AUTH_MAIL_ENABLED=false` disables Resend authentication email without changing other notification settings. The development marker prevents real Resend sends even if a key is present; the development launcher always selects its local inbox.

### Local development inbox

The development launcher forces `AUTH_MAIL_MODE=local` and disables outbound notifications. Authentication emails are written to the ignored **`.dev/auth-mail/`** directory instead of being sent externally. These JSON files contain working test links; keep them private. Production refuses local inbox mode. Local tests use synthetic accounts, and no real parent or teacher emails are sent.

If neither local mode nor Resend is configured, recovery/resend requests return HTTP 503 for all addresses. Registration can still create a pending account, but its screen explains that verification delivery is unavailable and offers a later resend. It does not falsely claim an email was sent.

API routes:

| Route | Access | Result |
| --- | --- | --- |
| `POST /api/admin/users/set-roles` | Admin | Transactionally replace selected identity's roles |
| `POST /api/admin/users/assign-role` | Admin | Add a role while retaining other roles |
| `POST /api/auth/web/forgot-password` | Public, throttled | Queue reset link without revealing account existence |
| `POST /api/auth/web/resend-verification` | Public, throttled | Queue ownership-verification link |
| `POST /api/auth/web/reset-password` | Valid single-use link | Set password and revoke old sessions |
| `POST /api/auth/web/verify-email` | Valid single-use link | Verify ownership without approving the account |
| `PUT /api/profile/password` | Authenticated, current password | Change password and require a new sign-in |

Signup remains restricted to parent/teacher accounts. Provider sign-in can enter an admin role only if an administrator already assigned it; a first Google/WeChat sign-in cannot create an administrator.
