# Google login deployment

EduNet uses Google Identity Services only to verify identity. The API then
resolves the teacher or parent account and issues the existing EduNet token.
The Mini Program WeChat login endpoint is unchanged.

## Google Cloud setup

1. Open Google Cloud Console and create or select a production project.
2. In Google Auth Platform, configure Branding with the EduNet name, support
   email, homepage, privacy policy, and authorized domain.
3. Set the audience to External and publish the app when production testing is
   complete.
4. Create an OAuth client with application type **Web application**.
5. Add each web origin, including the scheme but no path:
   - `http://localhost:5173` for local development
   - the production website origin, such as `https://app.example.com`
6. Copy the Web client ID. No client secret is required by this ID-token flow.

## Environment

Set the same Web client ID in both variables:

```dotenv
GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
```

`GOOGLE_CLIENT_ID` is used by the API to validate token audience.
`VITE_GOOGLE_CLIENT_ID` is public and is compiled into the web application.
On Render, set it before running the build.

## Database and deployment order

1. Back up the production database.
2. Deploy or run `npm run db:migrate` to apply
   `0037_add_auth_identities.sql`.
3. Deploy the API and web build with both environment variables set.
4. Confirm the production website origin is present in the Google OAuth client.
5. Test a new parent account, approve it in the admin review queue, then sign in
   again.
6. Test an existing WeChat user by signing in normally and linking Google from
   Profile.

The migration is additive. It creates `auth_identities`, backfills existing
Mini Program WeChat identities, and does not change the `/api/auth/wechat`
request or response contract.

## Expected behavior

- First Google login creates a pending teacher or parent application.
- Approved returning accounts receive an EduNet session.
- Rejected and pending accounts cannot enter the application.
- Accounts are keyed by Google's immutable `sub`, not email.
- A matching email is not automatically linked; the user must authenticate to
  the existing account and link Google from Profile.
- Google cannot be unlinked when it is the account's only sign-in method.
