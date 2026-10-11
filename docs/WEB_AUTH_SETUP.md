# Web authentication setup

The login page supports email/password, Google and WeChat QR authorization. `/signup` creates an email account; first-time social sign-in also creates an account. Teachers and parents remain pending until approved in the existing administrator account screen. Public signup cannot create administrators or grant access to student records.

## Database

Run `npm run db:migrate` against the intended database before deploying the updated API. Migration `0037_web_auth` adds Google subject IDs and separate WeChat website OpenIDs and widens password columns. Mini-program OpenIDs are preserved. Website and mini-program accounts are matched only when WeChat supplies a shared UnionID under the same Open Platform account.

New email passwords use salted scrypt hashes. Existing teacher/parent plaintext passwords are upgraded on successful password verification. Administrator credential handling is unchanged.

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

If either provider is unconfigured, its button is disabled and the page explains why. No secret or provider access token is sent to the frontend. Callbacks validate signed browser-bound state; a short-lived HttpOnly cookie hands the app session to the frontend without putting tokens in redirect URLs. Existing email accounts are not automatically linked to Google by email; use their password sign-in. Email signup does not verify email ownership, so email addresses must not be used for automatic linking or password recovery.

The API includes a per-process limit of 30 authentication attempts per IP per 15 minutes. For multiple API replicas, enforce a shared rate limit at the ingress. Configure Express proxy trust narrowly for your deployment before using forwarded client IPs; otherwise a proxy may cause users to share a limit.

## Verification

Run `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and `npx vitest run tests/integration/auth-web.api.test.ts tests/unit/password.test.ts`.

Then test with real configured providers: create an account, confirm pending approval, approve it, sign in, refresh, and log out. Repeat with Google and a real WeChat mobile scan. Check cancellation, an expired callback, and a rejected account. Automated provider tests mock external responses; they do not validate production credentials or WeChat application approval.
