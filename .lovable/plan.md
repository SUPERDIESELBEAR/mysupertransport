## What's actually happening

Two separate problems combined into the symptom Craig is experiencing.

### Problem 1 — The "Welcome" email points to the wrong domain

When Stage 1 was completed today (5/1) for Craig, the database trigger fired `notify-onboarding-update` with `milestone_key = 'background_check_cleared'`. That function builds the email's CTA from:

```ts
const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
// CTA → `${appUrl}/dashboard`
```

`mysupertransport.com` is a separate marketing/PHP site (just confirmed: it returns HTTP 404 on `/dashboard`). The actual app is at `https://mysupertransport.lovable.app`. So the link in his email lands on a non-app domain that returns 404 / blank.

Other edge functions (`launch-superdrive-invite`) already default to the right URL:
```ts
const APP_URL = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';
```

This affects **every operator** who completes a milestone (not just Craig). Anyone clicking the email CTA hits the wrong domain.

### Problem 2 — Craig never received an invite, so he has no password

Checked `email_send_log` for `cepate60@gmail.com` — zero rows. There is no `invite` email or `recovery` email on file for him. His application was approved 2026-04-27 by `invite-operator`, which calls `supabase.auth.admin.inviteUserByEmail(...)`. The auth user exists (`d21ccd0b-…`) with role `operator`, but the invite email apparently never made it into the queue/log. He has no way to set a password, so he can't sign in.

The "Welcome email" he describes is almost certainly the milestone email from Problem 1, not a true invite.

---

## The fix

### Step 1 — Default `APP_URL` to the correct host in `notify-onboarding-update`

Change the fallback so the link works even if the secret is missing/misconfigured:

```ts
// supabase/functions/notify-onboarding-update/index.ts (line 234)
const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
```

Also audit the `APP_URL` secret in Lovable Cloud — if it's set to `https://mysupertransport.com` it should be updated to `https://mysupertransport.lovable.app` (or whatever the published URL is). I'll surface a button so you can check.

### Step 2 — Send Craig a password reset link

Trigger a Supabase password recovery for `cepate60@gmail.com` so he gets a fresh email with a working link to `/reset-password` on the app domain. Two options:

- **A.** Run a one-shot from the staff side (you click "Resend Invite" in the operator drawer — uses existing `resend-invite` function).
- **B.** I run an admin recovery directly via the Cloud DB/edge call.

I recommend **A** — you push a button, audit log captures it, and Craig gets the standard branded recovery email pointing at the app.

### Step 3 — Verify

After the fix:
1. Trigger a test milestone for any test operator and confirm the email CTA opens `https://mysupertransport.lovable.app/dashboard` (not the marketing site).
2. Confirm Craig receives the resend, can set a password at `/reset-password`, and lands on `/dashboard` (operator portal).

---

## Files to change

- `supabase/functions/notify-onboarding-update/index.ts` — change one line (the fallback URL).

No DB migration, no other code changes required.

## Open question for you

Question for you before I implement:

- Should the `APP_URL` env secret in Lovable Cloud also be updated, or is the code-level fallback enough? (If the secret is currently wrong, the fallback alone won't help — the secret will keep overriding it.)
