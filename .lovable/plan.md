# Allow password reuse on reset and change password

Goal: a user resetting or changing their password may set any password they want — including their current one or one they used before. No history checks, no "must be different" rule.

## Current state

The app itself does not compare a new password against any history: `src/pages/ResetPassword.tsx` and `src/components/ChangePasswordModal.tsx` only check minimum length (8 characters) and that the two fields match, then call the auth update directly. There is no password-history table and no reuse rule in app code.

The one place reuse can still fail is the auth service itself: when the new password is byte-identical to the account's current password, the update call returns a `same_password` error ("New password should be different from the old password"). Today both screens surface that raw message as a red error, so it looks to the user like reuse is blocked.

## What to change

Treat "same as current password" as a success, not an error, on both screens:

- Reset-password link page (`src/pages/ResetPassword.tsx`): if the update returns the `same_password` error, show the normal "Password Set!" confirmation and continue the redirect to the dashboard. The account's password already equals what the user typed, so the outcome they asked for is true.
- In-app Change Password modal (`src/components/ChangePasswordModal.tsx`, used by both management staff and drivers): same handling — show "Password updated successfully!" and close normally.
- Any other auth error (weak password, expired session, network) keeps showing its real message.

No change to the length/confirm-match validation, and no new database tables, migrations, or backend functions.

## Technical notes

- Detect the case by the Supabase error `code === 'same_password'`, with a fallback substring match on "different from the old password" so older responses are also caught.
- Previously used (non-current) passwords are already accepted with no work needed — nothing in the codebase or database stores password history.
- Scope is limited to the two screens the user named; the new-driver welcome setup page is untouched.