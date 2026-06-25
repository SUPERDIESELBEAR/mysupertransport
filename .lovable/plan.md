## Plan: Fix the broken "View My Documents" button in the Document Received & Confirmed email

### What's broken
The email's CTA points to `https://mysupertransport.lovable.app/dashboard?tab=documents` (set in `supabase/functions/notify-onboarding-update/index.ts` under the `document_received` milestone).

That URL fails in two real cases:

1. **Clicked while signed out.** `/dashboard` redirects to `/login`. Login does not preserve the original URL, so after sign-in the driver lands on plain `/dashboard` and the `?tab=documents` deep link is lost — the button appears to do nothing.
2. **`/dashboard` route isn't the canonical operator URL.** The rest of the operator portal uses `/operator?tab=...` for deep links; `/dashboard` only works as a side effect of role-based redirects, which has caused similar deep-link drops elsewhere.

### Fix

1. **Point the CTA at the canonical operator deep link.**
   In `supabase/functions/notify-onboarding-update/index.ts`, change the `document_received` and `decal_photos_requested` CTAs from `/dashboard?tab=documents` to `/operator?tab=documents`. `OperatorPortal` already reads `?tab=` on mount and switches to the Documents view.

2. **Preserve the destination through login.**
   - In `src/App.tsx`, when an unauthenticated user hits `/dashboard`, `/operator/*`, `/owner/*`, `/staff/*`, `/dispatch/*`, `/management/*`, or `/status`, redirect to `/login?next=<encoded pathname+search>` instead of bare `/login`.
   - In `src/pages/LoginPage.tsx`, read `next` from the URL after a successful sign-in. If it is present and starts with `/` (same-origin only, no protocol), navigate there; otherwise fall back to `/dashboard`.

3. **Redeploy `notify-onboarding-update`** so the new URL takes effect immediately.

### Out of scope
- No copy or layout changes to the email itself.
- No changes to the Documents view in the operator portal.
- No changes to other milestone emails beyond the two that currently route to `?tab=documents`.

### Validation
- Send a test `document_received` email via the existing preview tool.
- Signed in: clicking the button lands on Operator Portal → Documents view.
- Signed out: clicking the button lands on Login; after sign-in, lands on Operator Portal → Documents view (not the home view).
