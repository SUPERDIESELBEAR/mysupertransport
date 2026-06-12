## Goal

Unblock Donald Alleyne (and any future truck owner) from getting stuck on the "Start Your Application" CTA, and confirm the resent invite link actually lands him in the ICA signing flow.

## 1. Resend Donald's invite (no code change)

Staff action via the existing Truck Owner card:
- Open Bilal Leggett's application → Truck Owner section → Donald Alleyne → "Resend invite"
- This calls the existing `resend-invite` edge function with `staff_override: true`, which:
  - Generates a fresh `/welcome` link via Supabase recovery
  - Emails it to `donald@…` with the upgraded invite copy
  - Writes an `invite_resent` row to `audit_log`

No rate limit applies for staff. After staff clicks, I will:
- Query `audit_log` for the `invite_resent` entry to confirm the function ran
- Query `email_send_log` (if present for this path) / inspect `resend-invite` edge logs to confirm Resend accepted the message
- Tell you when it's confirmed sent

## 2. Confirm the email link works (end-to-end)

The flow Donald will hit when he clicks the email button:

```text
Email "Accept Invitation" link
   → /welcome (Supabase processes recovery hash)
   → onAuthStateChange fires SIGNED_IN → sessionReady = true
   → Donald sets a password → supabase.auth.updateUser({ password })
   → Success screen → "Open My Portal" → /dashboard
   → useAuth sees activeRole = 'truck_owner'
   → OperatorPortal renders OperatorICASign in truck-owner mode
   → ICA is ready to review and sign — no application steps
```

I will verify each piece before saying "good to go":
- `truck_owners` row for Donald has the expected `operator_id`, `user_id`, and a non-null full name/email (already confirmed earlier)
- `user_roles` shows `truck_owner` for his `user_id` (already confirmed)
- `/welcome` token handling in `WelcomeOperator.tsx` accepts recovery links (already correct)
- `/dashboard` route correctly routes `truck_owner` → `OperatorPortal` → `OperatorICASign` (I'll re-read `OperatorPortal.tsx` + the truck-owner ICA path to confirm no application gate sneaks in)
- The ICA contract row exists / will be auto-created for him to sign

If any step is broken, I'll fix it as part of this same change.

## 3. UX fix on LoginPage + SplashPage

Problem: an invited owner who opens the app URL directly lands on `SplashPage` ("Begin Your Application") or `LoginPage` ("Applying to drive… Start your application"). Nothing tells him "you don't need to apply — you were invited."

Add a small, on-brand affordance in both places:

**SplashPage** (`src/pages/SplashPage.tsx`)
- Below the existing "Started an application?" resume banner, add a second banner:
  - Title: "Were you invited as a truck owner or driver?"
  - Subtitle: "Get a fresh sign-in link sent to your email."
  - Click → opens a small dialog (reusing the same pattern as `ResumeApplicationDialog`) that asks for email and calls `resend-invite` (public flow — already supported for any operator with an account)

**LoginPage** (`src/pages/LoginPage.tsx`)
- In the bottom card area (next to "Applying to drive…"), add a second line:
  - "Were you invited? Resend my sign-in link" → opens the same dialog
- Keep "Forgot your password?" for users who already set one

**New component** `src/components/auth/ResendInviteDialog.tsx`
- Small modal: email input + submit + success state
- Calls `supabase.functions.invoke('resend-invite', { body: { email } })`
- Generic success message (matches existing anti-enumeration behavior of the function)
- Reuses gold/dark theme tokens; no new colors

No backend or routing changes — the `resend-invite` edge function already supports the public flow for any operator (truck owners included, since they're stored under `applications` only when they also applied; for invite-only truck owners we'll need to verify the function finds them).

### Caveat I need to verify before building #3

`resend-invite` currently looks up the operator in the `applications` table (`appQuery = …from('applications')`). Donald has no `applications` row — he's only in `truck_owners`. So the public flow today would return generic success but never actually send him an email. Two options:

- **(a)** Extend `resend-invite` to also look up `truck_owners` by email when no `applications` match. Generates the same recovery link against the auth user's email. Small, safe change.
- **(b)** Leave the public flow as-is and document that truck owners must ask staff to resend.

I recommend **(a)** so the new "Resend my sign-in link" affordance actually works for truck owners too. I'll include it in the implementation.

## Technical details

- Files to add: `src/components/auth/ResendInviteDialog.tsx`
- Files to edit: `src/pages/SplashPage.tsx`, `src/pages/LoginPage.tsx`, `supabase/functions/resend-invite/index.ts` (fallback to `truck_owners` lookup)
- No DB migrations
- No new edge functions; only an addition to the existing `resend-invite`
- After editing the edge function, redeploy it
- No changes to ICA, OperatorPortal, or routing logic

## Deliverable

1. Confirmation (with audit-log + email-log evidence) that Donald's resent invite was sent
2. Donald can click the email and reach the ICA signing screen without seeing any application prompts
3. Any future invited truck owner who lands on `/` or `/login` has a one-click "resend my sign-in link" path
