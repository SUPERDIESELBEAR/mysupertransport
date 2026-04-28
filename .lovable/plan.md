# Send Password Reset Link from Staff Directory

Give management/owner the ability to email a fresh password recovery link to any staff member directly from the Staff Directory — solving the case where a staff member (e.g. Leo Wallace) cannot get the self-serve "Forgot Password" flow to work.

## What the user will see

1. In **Management → Staff Directory**, clicking a staff row opens the existing manage-member modal.
2. A new **"Send Password Reset Link"** button appears in that modal (next to the existing Deactivate / Delete actions).
3. Clicking it shows a confirmation dialog: *"Email a password reset link to leo@mysupertransport.com?"*
4. On confirm:
   - A toast confirms: *"✅ Reset link sent to Leo Wallace"*
   - The action is recorded in the audit log
   - Leo receives the standard branded SUPERTRANSPORT recovery email (1-hour link → `/reset-password`)
5. Only users with `management` or `owner` role can see/use the button. The button is hidden for the `owner` row (Marcus Mueller) per existing owner-authority rules.

## Backend changes

### Extend `get-staff-list` edge function
Add a new `action: 'send_password_reset'` branch that:
- Verifies the caller has `management` or `owner` role (existing pattern in the function)
- Refuses the action if the target user is the `owner`
- Looks up the target user's email via `supabaseAdmin.auth.admin.getUserById(user_id)`
- Calls `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` } })` — same pattern already used in `resend-invite` and `bootstrap-admin`
- Supabase auto-sends the recovery email through the existing `auth-email-hook` (uses the branded `recovery.tsx` template — no new template needed)
- Inserts an `audit_log` row with `action: 'password_reset_sent'`, target user, and actor
- Returns `{ ok: true }`

No new edge function, no new template, no DB migration required — everything reuses existing infrastructure.

## Frontend changes

### `src/components/management/StaffDirectory.tsx`
- Add `handleSendPasswordReset()` handler that invokes `get-staff-list` with `action: 'send_password_reset'`
- Add a confirmation `AlertDialog` for the action
- Add the **"Send Password Reset Link"** button inside the existing `managingMember` modal, styled as a secondary action (not destructive)
- Add a loading state while the request is in flight
- Hide the button when `managingMember.roles.includes('owner')`

## Out of scope
- Bulk password resets (one-at-a-time only — keeps audit trail clean)
- Resetting passwords for operators/drivers (this plan covers staff only; can be added later in the operator profile if needed)
- Setting a manual temp password (the recovery email is more secure)

## Files touched
- `supabase/functions/get-staff-list/index.ts` — add `send_password_reset` action
- `src/components/management/StaffDirectory.tsx` — add UI button, handler, and confirmation dialog