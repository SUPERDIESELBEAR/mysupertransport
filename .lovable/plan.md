# Recover Stuck Applicants

Goal: get the recently-invited applicants who hit the blank white page back into the onboarding flow using the new streamlined install process — without requiring any action from them other than clicking a fresh email link.

## Why they got stuck

The previous build sent applicants to `/dashboard` after install with a manifest `start_url` of `/`. When their original invite link was consumed (or expired) and the PWA opened to the splash route without a session, the app rendered a blank screen instead of falling back to login. That is now fixed in code (manifest → `/dashboard?source=pwa`, `/welcome` has a token-error UI, install step is integrated). But the *already-sent* invite emails still point at the old flow and several have expired or already been clicked once.

The cleanest recovery is to **re-issue invitations** so each affected applicant gets a brand-new link that lands them in the new flow.

## Recovery Plan

### 1. Identify the affected applicants

Run a read-only query against `applications` + `auth.users` to list approved applicants who:
- have `review_status = 'approved'`
- have a `user_id` (invite was sent)
- have `last_sign_in_at IS NULL` (never successfully signed in)

I'll surface the list (name, email, days since invite) so you can confirm who to re-invite before any emails go out.

### 2. Bulk resend via the existing edge function

`resend-invite` already supports staff-triggered resends with `staff_override: true`. It:
- generates a fresh recovery (set-password) link
- routes to `/welcome` (which now has the install step + token-error fallback)
- writes an `audit_log` entry per send
- bypasses the 5-minute rate limit for staff

Two options for triggering it — pick one:

**Option A — One-click "Resend to all stuck applicants" button** (recommended)
- Add a small admin action in the Management Portal → Pipeline view that lists the stuck applicants and lets you resend to all (or per-row) with one click.
- Each click calls `resend-invite` with `staff_override: true`.
- Shows per-applicant success/failure and the new audit entries.

**Option B — Manual one-shot script**
- I run a one-off script that loops the identified list and invokes `resend-invite` for each, then reports results in chat. No UI changes. Faster, but no repeatable tool for next time.

### 3. Update the email copy for resends (small polish)

The current resend email subject is *"Your Invitation to SUPERTRANSPORT — Action Required"*. For re-sends specifically, tweak the body to acknowledge the prior issue, e.g.:

> "We've upgraded the install experience — please use this fresh link to set your password and install the app. The previous link is no longer needed."

This avoids confusion for anyone who saw the blank page and assumed something was broken on their end.

### 4. Verify in production

After resends go out:
- Watch `audit_log` for `invite_resent` entries (already written by the function).
- Watch `auth.users.last_sign_in_at` to confirm each applicant signs in.
- Spot-check edge function logs for any Resend API failures.

## What I'll build (Option A)

- **New section in Management → Pipeline**: "Pending Invite Acceptance" panel listing approved applicants who have not yet signed in, with columns for name, email, invite age, and a per-row **Resend** button plus a **Resend All** action.
- **Reuse**: calls existing `resend-invite` edge function with `staff_override: true` — no new backend code.
- **Polish**: updated email body for the re-send case (one-line copy change in `resend-invite/index.ts`).
- **Toast feedback**: success/failure per applicant.

## What I won't change

- Manifest, `/welcome`, and `InstallStep` — already fixed last round.
- The applicant-facing self-service "Resend Invite" form on `/welcome` — unchanged; still works for anyone who finds their way there.
- Auth/RLS rules — no schema changes needed.

## Confirm before I proceed

1. **Option A or B?** (Admin panel vs. one-shot script.)
2. **Should I run the read-only query first** so you can review the list before any resends go out? (Strongly recommended.)
