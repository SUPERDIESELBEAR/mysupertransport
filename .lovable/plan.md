

## Promote PWA install via email + visible tracking

### What's already in place (no work needed)

After auditing the codebase, most of the requested functionality already exists:

- **`notify-pwa-install` edge function** — already built. Sends an in-app notification + branded email with iOS/Android install steps. Supports both single-operator and bulk sends.
- **`/install` route + `InstallApp` page** — full install guide already deployed.
- **`pwa_installed_at` tracking** — `OperatorPortal` auto-stamps this column the first time an operator opens the portal in standalone (installed) mode.
- **"Send install instructions" button** — already wired into the `OperatorDetailPanel` (single-operator send).
- **Driver Roster install indicator** — green/grey smartphone icon per driver + an "App not installed" compliance filter chip.

So the foundation is solid. The remaining gaps are about **getting the install link in front of new users earlier** and **giving staff a bulk action + visibility**.

### What this change adds

**1. Install CTA in the applicant invitation email** (`invite-applicant`)
Add a small secondary section under the main "Start Your Application" CTA: "While you're here — install the SUPERDRIVE app on your phone for the smoothest application experience." with a link to `${APP_URL}/install`. Same gold accent styling, but visually subordinate to the main CTA so it doesn't compete.

**2. Auto-fire install email on operator approval** (`invite-operator`)
Right after a successful approval (the existing `send-notification` fire-and-forget block around line 351), also fire-and-forget a call to `notify-pwa-install` with the new `operator_id`. New operators get the install email on day one, alongside their auth invite.

**3. Bulk "Send install email" action in Management → Overview**
Add a small card/button in the Management Overview titled **"App Install Status"** showing:
- Count of active operators with the app installed (e.g. "23 of 41 operators")
- A simple progress bar (gold) showing install rate
- A button: **"Email install instructions to remaining 18"** which calls `notify-pwa-install` with no `operator_id` (the bulk path, which already skips operators who've already been emailed and operators already installed via the existing idempotency check).

**4. Install column in Driver Roster** (light enhancement)
The smartphone icon already exists. Add a tooltip showing the install date when installed ("Installed Mar 14, 2026") and "Not installed yet" when not — so staff can see install recency at a glance. No new data needed.

### Out of scope

- Re-sending install emails to the same operator more than once (the bulk function already enforces idempotency via the `notifications` table — operators who got one notification won't get another in a bulk send). A "Force re-send" button would be a follow-up if you want it.
- Push notifications when a user installs (the `pwa_installed_at` timestamp is enough for the dashboard view).
- Tracking installs for staff/dispatcher accounts — only operator installs are tracked, since the install promo is operator-focused.
- Tracking installs for applicants who haven't been approved yet (no `operators` row exists for them, so there's nowhere to store the timestamp).

### Files touched

- `supabase/functions/invite-applicant/index.ts` — add install CTA to email body.
- `supabase/functions/invite-operator/index.ts` — fire `notify-pwa-install` after approval.
- `src/pages/management/ManagementPortal.tsx` — add "App Install Status" card to Overview with bulk send button.
- `src/components/drivers/DriverRoster.tsx` — enrich the existing smartphone icon tooltip with install date.

### Technical notes

- The `notify-pwa-install` function already requires no auth changes — it accepts an optional `operator_id` body param. Single-target sends bypass the idempotency check; bulk sends respect it.
- The bulk send button will use a confirm dialog (`AlertDialog`) before firing, since it can hit dozens of operators.
- The Overview card uses the same data source as the Driver Roster's "App not installed" filter (already loaded by `DriverRoster.tsx`), so no new query patterns needed — Management Overview already loads operators.

