## Goal

Fix the post-approval email mess with one clean approval email, a working set-password link, a friendly post-password install nudge, and the UX polish folded into the build (not bolted on later).

## What's wrong today

Three emails fire within seconds of approval:

1. **"Welcome to SUPERDRIVE"** (`launch-superdrive-invite`) — working recovery link + install cards.
2. **"Your SUPERTRANSPORT Application Has Been Approved!"** (`send-notification` → `application_approved`) — **broken** "Set Up Your Account" → `/login`.
3. **"You've Been Invited"** (Supabase auth invite) — duplicate set-password link + install cards.

Two competing password links, one broken, install steps duplicated three times, no submission-confirmation email to the applicant.

## The new flow

### Stage 1 — After application submission

**Email A — Application Submission Confirmation (NEW, to applicant)**
- Subject: "We've got your application, {FirstName}"
- Warm tone, uses first name in subject and greeting
- Body: confirmation + what happens next (review timeline) + signature
- Preview line: "Thanks {FirstName} — we'll be in touch within 1–2 business days."
- No password CTA, no install nudge yet
- Fires from the application submit handler

### Stage 2 — On approval

**Email B — One consolidated approval email** (replaces all three current emails)
- Subject: **"You're approved, {FirstName} — welcome to SUPERTRANSPORT"**
- Preview line: **"Set your password and get into SUPERDRIVE in 60 seconds."**
- Greeting uses first name; one consistent voice: warm and direct (no formal/casual whiplash)
- One primary CTA: **"Set Your Password & Open SUPERDRIVE"** → recovery link → `/reset-password?welcome=1`
- One-line expectation-setter under the CTA: *"After you set your password, we'll walk you through installing SUPERDRIVE on your phone — takes about a minute."*
- Feature list from today's Welcome email
- Footer safety-net link: "Need to install on a different device later? Go to mysupertransport.com/install"
- **No install instructions in the body** — those live on the landing page

### Stage 3 — Post-password install interstitial

The "nudge to install" management asked for, in the right spot — operator just set password, is actively engaged, has device in hand.

1. Recovery link lands on `/reset-password?welcome=1`. Copy: "Welcome to SUPERTRANSPORT — set your password."
2. On submit success → **NEW** `/welcome/install`.
3. Interstitial wraps existing `<InstallStep />`:
   - **Phone, not installed:** big install instructions (iOS Share → Add to Home Screen, Android Install app).
   - **Phone, already standalone:** auto-skip to `/dashboard`.
   - **Desktop:** smaller "Use SUPERDRIVE on your phone for the best experience" card.
4. Soft-skip link wording: **"I'll install later → continue to my portal"** (not the abrasive "Skip").
5. Continue → `/dashboard`.

### Stage 4 — Safety nets for skippers

- **In-app install banner** — confirm `PWAInstallBanner` shows on the operator dashboard for non-standalone users. Skippers see a persistent (but dismissible) nudge.
- **Login page resend** — small "Didn't get your set-password email or link expired? Resend" link that calls `resetPasswordForEmail`. Handles 24-hour recovery link expiry.

## Auth "You've Been Invited" email

Switched to a recovery-link approach (your Q1 answer):
- `invite-operator` calls `admin.createUser` (no auto email) + `generateLink({ type: 'recovery' })`.
- The auth invite email stops firing for new operators.
- The auth invite template stays in place as a fallback for admin/dispatch staff invites.

## Implementation

### Frontend
1. **`src/pages/ResetPassword.tsx`** — detect `?welcome=1`; swap copy to welcome-mode; on success, route to `/welcome/install`.
2. **NEW** `src/pages/WelcomeInstall.tsx` — wraps `<InstallStep />`, auto-skips when install N/A, soft-skip link reads "I'll install later".
3. **`src/App.tsx`** — register `/welcome/install`, auth-only.
4. **`src/pages/LoginPage.tsx`** — add "Resend set-password link" affordance.
5. **`src/components/InstallStep.tsx`** — update the existing skip-link wording from "Skip for now → …" to "I'll install later → continue to my portal" to match the new tone.
6. **`src/pages/operator/OperatorPortal.tsx`** — verify `PWAInstallBanner` renders for non-standalone operators (likely already does — confirm only, no change if so).

### Edge functions
7. **NEW** `supabase/functions/send-application-confirmation/index.ts` — Email A. Invoked from the application submit handler. Uses `{FirstName}` in subject + greeting + preview line.
8. **`supabase/functions/invite-operator/index.ts`** — replace `inviteUserByEmail` with `createUser` + `generateLink({ type: 'recovery', options: { redirectTo: '<APP_URL>/reset-password?welcome=1' } })`. Pass URL to `launch-superdrive-invite`. Stop calling the `application_approved` notification email.
9. **`supabase/functions/launch-superdrive-invite/index.ts`** — rewrite the `full` template into Email B. New subject, preview line, first-name greeting, expectation-setter line, install cards removed.
10. **`supabase/functions/send-notification/index.ts`** — delete the `application_approved` email branch (keep the in-app notification). Removes the broken "Set Up Your Account → /login" button.
11. **`supabase/functions/_shared/email-templates/invite.tsx`** — keep as fallback for non-operator auth invites; stops firing in operator flow.

### Link audit pass
Click through every `href` in `invite-applicant`, `launch-superdrive-invite`, all `send-notification` branches, and `_shared/email-templates/*`. Confirm each route exists in `src/App.tsx`. Fix any stragglers found.

## What stays out of scope (explicit)

- "You're invited to apply" (staff-initiated only) — unchanged.
- The auth invite template — kept as fallback for staff/admin invites.
- The 8-stage downstream onboarding emails — separate pass.

## Ready to build on approval.
