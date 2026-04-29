# Plan: Test Launch SUPERDRIVE before bulk send

You have **35 pre-existing operators** queued (all active, all have emails, all have user accounts, **none invited yet** — audit log is empty for `superdrive_invite_sent`). Before you mass-send, here's a safe verification approach.

## What I already verified (read-only checks)

- **Eligibility query works**: 35 operators match `reviewer_notes = 'Pre-existing operator added directly'`, all active, all have user accounts and emails.
- **No prior sends**: `audit_log` has zero `superdrive_invite_sent` entries → no one is in the 30-day cooldown.
- **Edge function looks correct**: auth gate (management/owner), per-operator processing, idempotent via audit log, generates a Supabase recovery link, sends branded HTML, writes audit row.
- **Dialog wiring correct**: `DriverHubView` → `LaunchSuperdriveDialog` → invokes `launch-superdrive-invite` with the user's bearer token.

## Recommended live test (3 steps)

**1. Add a test recipient I control** (you'll do this in the UI)
- In Driver Hub, add a single "pre-existing operator" pointing at an email **you own** (e.g. your own Gmail or a `+test` alias). This guarantees we can read the actual email without spamming a real driver.
- Tell me the email you used.

**2. I'll trigger the send via the Launch SUPERDRIVE flow against just that test row**
- I'll call the deployed `launch-superdrive-invite` edge function with that single operator_id, using your auth token.
- I'll verify the response shape: `{ success, summary: { sent: 1, ... }, results: [{ status: 'sent', email }] }`.
- I'll check the edge function logs for any warnings.
- I'll confirm an `audit_log` row was written so the 30-day cooldown takes effect.

**3. You confirm the email + link**
- Open the email in your inbox.
- Click "Set Your Password & Open SUPERDRIVE" → should land on `/reset-password` with a valid recovery token.
- Set a password → should drop you into `/dashboard` as that operator.
- Confirm the install callout (iOS Safari / Android Chrome) reads correctly.

## What I'll watch for

- **Cooldown enforcement**: re-running the same send should return `recently_invited` (not a duplicate email).
- **Email source-of-truth**: function prefers `auth.users.email` over `applications.email` — fine, but worth confirming the test row's auth email matches what you typed.
- **Recovery link redirect**: must hit `https://mysupertransport.lovable.app/reset-password` (the `APP_URL` env var). If your `/reset-password` page expects the recovery token in the URL hash, we'll see it work in step 3.
- **Rate limits**: function caps at 100 per request — your 35 fits in one batch.
- **Audit log writes**: needed so the dialog's "Last sent" badge populates and the cooldown holds.

## After the test passes

- Open Launch SUPERDRIVE dialog → "Select all never-invited (35)" → Send.
- Expected result: `35 sent · 0 cooldown · 0 errors`.
- Watch the summary banner; any errors will list per-operator with reasons.

## Technical notes

- Function: `supabase/functions/launch-superdrive-invite/index.ts`
- Trigger UI: `LaunchSuperdriveDialog` (opened from `DriverHubView`, management/owner only)
- Cooldown: 30 days, enforced both client-side (UI disables checkbox) and server-side (audit log lookup)
- Email template: inline HTML in the function, uses shared `buildEmail` from `_shared/email-layout.ts`

---

**Approve this plan and tell me the test email address you used**, and I'll run the live single-recipient test.
