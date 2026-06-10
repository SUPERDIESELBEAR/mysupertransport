# Fix: Staff invite email "Accept Invitation" button does nothing

## Root cause

When staff invite a new staff member (e.g. Emma), `supabase/functions/invite-staff/index.ts` does two things:

1. Calls `supabaseAdmin.auth.admin.inviteUserByEmail(...)` — this triggers the `auth-email-hook`, which sends the **real** Supabase invite email (with a valid one-time `action_link` that lets the recipient set their password).
2. Then sends a **second**, custom-branded "You've Been Invited" email via Resend whose gold button is hard-coded to `${appUrl}/login`.

Emma clicked the button on the custom email. `/login` requires a password she hasn't set yet, so nothing happens — the button appears broken. (The other email in her inbox has the working link, but the branded one is the obvious call-to-action.)

## Fix

Make the branded email's button carry a real invite link instead of `/login`, and stop sending two emails for one invite.

### Changes in `supabase/functions/invite-staff/index.ts` (invite path only — manual-create path is unaffected)

1. Replace `auth.admin.inviteUserByEmail(...)` with the non-emailing pair:
   - `auth.admin.createUser({ email, email_confirm: false, user_metadata: { first_name, last_name, invited_as: role } })` to create the user without sending Supabase's default email.
   - If the user already exists (re-invite), fall back to looking them up via `listUsers`.
   - Then `auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: `${appUrl}/welcome` } })` to mint a fresh `action_link` without dispatching an email.
2. Pass the returned `action_link` into `buildInviteEmail(...)` as `inviteUrl`, so the gold button points at the real one-time invite link.
3. Keep everything else identical (profile upsert, role assignment, audit log, Resend send, validations).

Net effect:
- Only one email arrives (the branded one).
- The gold "Accept Invitation & Set Up Account" button works — it lands on `/welcome` with the recovery token, the same flow operators already use.
- No DB schema, RLS, or client-side changes needed.

## Verification

After deploy, re-invite a test staff email and confirm:
- Exactly one email arrives.
- Clicking the gold button opens `/welcome`, prompts for a password, and signs the new staff member in with the assigned role.
