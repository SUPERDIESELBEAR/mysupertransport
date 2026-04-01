

## Fix "Resend Invite" Failure for Non-Applicant Operators

### Problem
The edge function logs show: `Resend invite error: User with this email not found`. The `resend-invite` function looks up the application email (`marcsmueller@gmail.com`) and passes it to `generateLink({ type: 'recovery' })`. But Marcus's auth account was created with a different email (via "Add Driver"), so the auth system can't find a user with that email.

### Root Cause
Marcus was added via "Add Driver" with one email. Later, a synthesized `applications` record was created through the contact-info save, which may have stored a different email. The `resend-invite` function blindly uses the application email for auth operations.

### Solution
In `supabase/functions/resend-invite/index.ts`, when the application has a `user_id`, resolve the auth user's actual email via `supabaseAdmin.auth.admin.getUserById(app.user_id)` and use **that** email for `generateLink` instead of the application email. This ensures the recovery link targets the correct auth account.

### Changes

**`supabase/functions/resend-invite/index.ts`** (~line 109-120):

After finding the application (line 70-75), if `app.user_id` exists:
1. Call `supabaseAdmin.auth.admin.getUserById(app.user_id)` to get the auth user
2. Use the auth user's email for `generateLink` instead of `normalizedEmail`
3. Also use the auth email for the Resend email `to` field

This is a ~5-line addition before the existing `generateLink` call. No other files need changes.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/resend-invite/index.ts` | Resolve auth email from `user_id` before calling `generateLink` |

