## Goal

Refocus the initial SUPERDRIVE rollout email around **the Inspection Binder** (the one feature drivers need on day one) and hide the rest of the app's features. Other features will be introduced later via push notifications.

To preserve the existing email (so we can still use it for new operators who haven't been driving with us yet), we'll add a **second template** and let staff pick which one to send.

## What gets built

### 1. New email variant in `launch-superdrive-invite/index.ts`

Add a second HTML builder alongside the existing `buildWelcomeEmailHtml`:

- **`buildBinderEmailHtml(firstName, recoveryUrl)`** — Inspection Binder focused.
  - Subject: `Your DOT Inspection Binder is now in your pocket`
  - Hero line: "We just rolled out a new tool to make your life at the scale house easier."
  - Single feature card explaining the Inspection Binder:
    - CDL, medical card, truck title, periodic inspection, registration — one tap away
    - Always current (we keep your docs synced)
    - Works offline once installed
    - Share-link option for officers
  - Same gold CTA button: "Set Your Password & Open SUPERDRIVE"
  - Same iPhone/Android install callout (critical — binder must be on the home screen to be useful at a scale)
  - Soft teaser at the bottom: *"More tools — settlement forecasts, dispatch status, direct messages, payroll calendar — are coming. We'll let you know in-app as each one goes live."*
  - Sign-off: "— The SUPERTRANSPORT team"

The existing `buildWelcomeEmailHtml` (full feature tour) stays untouched.

### 2. Template selector in the edge function

- Accept a new optional field in the request body: `template: 'binder' | 'full'` (default `'binder'` going forward, since that's the new rollout default).
- Branch to the matching builder when assembling each operator's email.
- Pass the template name into the `audit_log` metadata so we can see which variant was sent to whom.

### 3. UI toggle in `LaunchSuperdriveDialog.tsx`

Add a small radio group above the operator list:
- ◉ **Inspection Binder intro** (default) — "Focused on the new binder app. Recommended for the initial rollout."
- ○ **Full feature tour** — "Original welcome email covering every feature."

Pass the chosen value through to `supabase.functions.invoke('launch-superdrive-invite', { body: { operator_ids, template } })`.

### 4. Test send to King Kong

After deploy, I'll invoke the function with `operator_ids: ['d0e1ba38-2755-4baa-8634-e12ee40d72fe']` and `template: 'binder'`. Because King Kong already has a `superdrive_invite_sent` audit row from yesterday, the 30-day cooldown will block it.

**Two options for the test resend** — pick one:

- **A. One-time cooldown bypass for King Kong only.** I'll delete his existing `audit_log` row for `superdrive_invite_sent` before triggering, so the cooldown check passes. Clean, no code change.
- **B. Add a `force: true` flag** to the edge function (management-only) that skips the cooldown check. Useful long-term for re-sending to anyone who didn't receive the first email. Slightly more work but keeps the audit trail intact.

I recommend **A** for this test (simplest), and we can add **B** later if you want a permanent "resend" capability in the dialog.

## What I'll verify after the test

- Email lands in `marcsmueller+sdtest@gmail.com`.
- Subject line and hero copy match the binder focus.
- Recovery link still drops you onto `/reset-password` with a valid token.
- Install callout reads correctly on mobile.
- `audit_log` shows a fresh `superdrive_invite_sent` row with `metadata.template = 'binder'`.

## Files touched

- `supabase/functions/launch-superdrive-invite/index.ts` — new builder, template branching, audit metadata.
- `src/components/management/LaunchSuperdriveDialog.tsx` — radio toggle + pass `template` in invoke body.

No DB migration needed.

---

**Approve this plan and tell me whether to use option A (delete King Kong's audit row for the test) or option B (add a `force` bypass flag).**