# Google Sign-In Plan

This document is research and implementation guidance only. Google authentication is not implemented in this iteration.

## Recommendation

Use Google Identity Services (GIS) directly and keep the existing EduNet JWT/session model. The web client receives a Google ID token, sends it to a new backend endpoint, and the backend verifies it before issuing the same EduNet JWT used by the current web and WeChat sessions.

Do not adopt Google Cloud Identity Platform unless EduNet later needs a hosted identity-management product. Direct GIS avoids introducing a second session system and has no published per-login charge. Identity Platform is a separate optional product with MAU pricing; its current free tier covers the first 50,000 Tier 1 monthly active users.

## Proposed Flow

1. Create separate Google Cloud projects or OAuth clients for development and production.
2. Configure the production homepage, privacy policy, authorized domain, and authorized JavaScript origins.
3. Render the official GIS button on the web login page using a public `VITE_GOOGLE_CLIENT_ID`.
4. POST the returned `credential` ID token to `POST /api/auth/google`.
5. On the server, verify signature, issuer, expiry, and audience with Google's supported Node client library.
6. Use the token's `sub` claim as the permanent Google identity key. Do not use email as the primary key.
7. Resolve the EduNet user and role, apply the same approval rules as WeChat login, then return the existing EduNet JWT and user payload.
8. Keep `/api/auth/wechat` unchanged so the mini-program service is unaffected.

## Account Linking

The current schema stores WeChat identity columns directly on the admin, teacher, and parent tables and limits `authProvider` to WeChat in validation. For two-provider login, prefer a separate identity table instead of adding more provider columns to every role table:

- `user_id` or role-table reference
- `role`
- `provider` (`wechat` or `google`)
- `provider_subject` (WeChat UnionID/OpenID or Google `sub`)
- provider email and profile metadata as non-authoritative display data
- unique constraint on `(provider, provider_subject, role)`

Existing WeChat identities can be backfilled without changing their IDs or active sessions. Linking should require a signed-in user to explicitly add the second provider. Automatic linking by matching email is unsafe because WeChat may not supply email and some Google Accounts use third-party email addresses.

## Production Requirements

- Request only identity scopes (`openid`, `email`, `profile`). Sensitive Google API scopes are unnecessary for login.
- Publish a public homepage and privacy policy on a verified domain.
- Configure exact HTTPS JavaScript origins and redirect URIs for production.
- Complete Google brand verification if the production consent experience should show the app name/logo.
- Verify GIS CSRF tokens when using the HTML POST flow; for the JavaScript callback flow, send the credential to the backend over HTTPS and enforce normal origin/CORS protections.
- Store any client secret only on the server. The browser only receives the OAuth client ID.

## Official References

- GIS setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Server-side ID token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- OAuth production readiness: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Verification overview: https://support.google.com/cloud/answer/13463073
- Optional Identity Platform pricing: https://cloud.google.com/identity-platform/pricing
