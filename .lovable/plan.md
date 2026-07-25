## Problem
The "Review & Sign Sheet" button in the OSAS email points at the backend API host instead of the SUPERDRIVE app, so tapping it lands on a "requested path is invalid" JSON error page.

## Root cause
In `supabase/functions/send-osas-to-operator/index.ts`, the sign URL is built from the backend URL:
```
const signUrl = `${supabaseUrl.replace('/supabase', '')}/operator/onboard-systems?osas_token=...`
```
That resolves to `https://<project>.supabase.co/operator/onboard-systems?...`, which the backend rejects. It should point at the app, and the app reads `osas_token` on the `/dashboard?view=onboard-systems` route (via `OperatorPortal` + `OperatorOSASSign`), not `/operator/onboard-systems`.

## Fix
Update `send-osas-to-operator/index.ts`:
- Import `buildAppUrl` from `../_shared/app-url.ts`.
- Replace the `signUrl` line with:
  ```
  const signUrl = buildAppUrl(`/dashboard?view=onboard-systems&osas_token=${sheet.access_token}`);
  ```
- Redeploy the function.

This matches the pattern already used by other transactional emails and honors the `APP_URL` env (with fallback to `https://mysupertransport.lovable.app`).

No frontend changes needed — the operator portal already handles `osas_token` on the dashboard view.
