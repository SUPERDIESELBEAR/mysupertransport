## Bug

The "View Pipeline" button in the **Onboarding Milestone Reached** staff email (and every other quick-link CTA rendered by `supabase/functions/send-notification/index.ts`) lands on a broken page. Reporters see either a marketing 404 or a page that never opens the pipeline.

## Root cause

Every quick-link button is built from the `APP_URL` env var via `supabase/functions/_shared/app-url.ts`:

```ts
const appUrl = new URL(buildAppUrl('/')).origin;
// …
{ label: 'View Pipeline', url: `${appUrl}/staff` }
```

`APP_URL` in this project's secrets is currently pointing at the **marketing domain** (`https://mysupertransport.com`), not the app host (`https://mysupertransport.lovable.app`). The marketing site has no `/staff`, `/management`, `/operator`, `/dispatch`, `/apply/ssn`, etc. routes, so every emailed button dies on that host — even though the button HTML itself is well-formed and clickable.

Confirmed by:
- Footer of the screenshotted email uses `support@mysupertransport.com` (marketing domain).
- App routes (`/staff/*`, `/management/*`, `/dispatch/*`, `/operator/*`) exist and work at `mysupertransport.lovable.app`.
- `buildAppUrl` only falls back to the lovable URL when `APP_URL` fails URL parsing — a valid-but-wrong host (marketing site) passes the sanitizer and is used verbatim.

Every email built with `${appUrl}/…` in `send-notification`, `send-cert-reminder`, `cron-cert-reminders`, `check-cert-expiry`, `check-inspection-expiry`, `notify-upload-attention`, `send-release-note`, `resend-invite`, `notify-pwa-install`, `launch-superdrive-invite`, etc. has the same failure mode — so the user's suspicion that "many other emails" are broken is correct.

## Fix

Two changes, done together:

### 1. Point `APP_URL` at the app host (primary fix — no code change)

Update the `APP_URL` secret to:

```
https://mysupertransport.lovable.app
```

(Or, if a dedicated app subdomain like `app.mysupertransport.com` is preferred, use that — but it must be a host where the React app is actually served, not the marketing site.)

Once updated, every emailed quick link resolves correctly with no code change. The fix is retroactive for new emails; historical emails still contain the broken URL.

### 2. Harden `supabase/functions/_shared/app-url.ts` (safety net for the future)

Add a small guard so a marketing-only host can't silently break every email again:

- Introduce an env var `MARKETING_HOSTS` (comma-separated hostnames, e.g. `mysupertransport.com,www.mysupertransport.com`).
- In `buildAppUrl`, if the parsed hostname matches any entry in `MARKETING_HOSTS`, log a warning and fall back to `FALLBACK` (the lovable app URL) instead of using the marketing host.
- Keep the existing sanitizer behavior (scheme, IP, localhost checks) intact.

No changes to any email template or call site are needed.

## Verification

1. After updating `APP_URL`, trigger a test milestone (e.g. re-fire `send-notification` for an existing operator, or use the built-in test-email edge function) and click **View Pipeline** in the received email — it should land on the Staff Portal at the Applicant Pipeline (or route through `/login?next=/staff` when signed out and then land there).
2. Spot-check other CTAs from that email family: `Review Application`, `Review Document`, `View in Pipeline`, `View My Portal`, `Open Dispatch Board`, `View Message` — all should now open real app pages.
3. As a regression guard, temporarily set `APP_URL` to a marketing host with `MARKETING_HOSTS` populated and confirm `buildAppUrl` logs the warning and falls back to the lovable app URL.
