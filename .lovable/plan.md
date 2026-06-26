## Root cause

The gold buttons in `_shared/email-layout.ts` are already plain `<a href="...">` tags — the HTML/CSS is fine. The reason "nothing happens" when a driver taps them is that the `href` resolves to a URL that fails silently in the driver's session:

1. **Wrong route for operator-facing CTAs.** `supabase/functions/notify-onboarding-update/index.ts` builds most driver CTAs as `${appUrl}/dashboard` or `${appUrl}/dashboard?tab=ica`. `/dashboard` is the staff portal — when a logged-in driver lands there, the route guards bounce them and the deep-link `?tab=ica` is dropped, so the click appears to do nothing. Operator routes live under `/operator` (already used correctly for `document_received` and `decal_photos_requested`).
2. **Unsanitized `APP_URL` env var.** Most notification functions still read `Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app'` directly. If `APP_URL` is set to a bare host, a value with whitespace, an IP, or a localhost variant, the resulting `href` is malformed and the link no-ops in mail clients. The shared `_shared/app-url.ts → buildAppUrl()` helper already handles all of this; it just isn't wired into most senders.

## Fix

### 1. Correct operator CTA routes in `notify-onboarding-update/index.ts`

Switch every driver-facing CTA from `/dashboard…` to the matching operator route:

| Milestone | New CTA URL |
|---|---|
| `background_check_cleared` | `/operator?tab=progress` |
| `background_check_flagged` | `/operator?tab=progress` |
| `ica_ready_to_sign` | `/operator?tab=ica` |
| `ica_complete` | `/operator?tab=progress` |
| `drug_screening_scheduled` | `/operator?tab=progress` |
| `mo_reg_filed` | `/operator?tab=progress` |
| `mo_reg_received` | `/operator?tab=progress` |
| `fully_onboarded` | `/operator` |
| `go_live_set` | `/operator` |
| `document_received` | `/operator?tab=documents` (already correct) |
| `decal_photos_requested` | `/operator?tab=documents` (already correct) |

Also replace the raw `appUrl` resolution with `buildAppUrl(path)` from `_shared/app-url.ts` so the URLs are sanitized.

### 2. Route all notification senders through `buildAppUrl`

Replace `Deno.env.get('APP_URL') ?? '…'` with `import { buildAppUrl } from '../_shared/app-url.ts'` in the functions that render gold CTAs in driver/staff emails:

- `notify-onboarding-update`
- `notify-document-update`
- `notify-upload-attention`
- `notify-pay-setup-submitted`
- `notify-new-message`
- `send-notification`
- `send-cert-reminder`
- `cron-cert-reminders`
- `check-cert-expiry`
- `check-inspection-expiry`
- `send-payroll-docs`
- `send-release-note`
- `invite-applicant`
- `invite-staff`
- `invite-truck-owner`
- `resend-invite`
- `resend-application-link` (already uses helper — verify)
- `bootstrap-admin`
- `launch-superdrive-invite`
- `get-staff-list`
- `send-operator-broadcast` (uses `PUBLIC_APP_URL` — leave alone unless audit shows breakage)

No copy/template changes — only the URL-building call is swapped.

### 3. Deploy & verify

- Deploy all touched functions in one batch via `supabase--deploy_edge_functions`.
- Trigger the ICA-ready notification on a test driver (Emma Mueller) and confirm:
  - Resend log shows `href="https://mysupertransport.lovable.app/operator?tab=ica"` (or the configured `APP_URL` origin).
  - Tapping the gold button on mobile lands on the operator portal ICA tab.
- Spot-check one other milestone (e.g. `document_received`) to confirm no regression.

### Out of scope

- No changes to the email HTML/CSS in `_shared/email-layout.ts` (button markup is already correct plain HTML).
- No changes to staff-only emails that legitimately point to `/dashboard`.
- The auto-flip "Ball in Court" follow-up remains removed.

### Verification checklist

- [ ] TypeScript build passes after edge function edits.
- [ ] `notify-onboarding-update` deploy succeeds.
- [ ] Test ICA email button opens `/operator?tab=ica` on mobile Safari and desktop Chrome.
- [ ] Resend dashboard shows valid absolute URLs for the test send.
