Send a one-off test "Drug Screening Scheduled" email to `emma@mysupertransport.com` so the fix can be verified on a real iOS device.

## Approach
Add a tiny ephemeral edge function `send-test-email` that:
1. Imports `buildEmail` + `sendEmailStrict` from `supabase/functions/_shared/email-layout.ts` (so it uses the exact same bulletproof CTA renderer we just fixed).
2. Reuses the literal `drug_screening_scheduled` copy from `notify-onboarding-update/index.ts` (subject, heading, body, CTA label/URL pointing to `https://mysupertransport.lovable.app/dashboard?tab=progress`).
3. Sends to `emma@mysupertransport.com` using the existing `RESEND_API_KEY` runtime secret.
4. Returns `{ ok: true, id }` on success.

Then deploy it and invoke it once via `supabase--curl_edge_functions`. Verify the response is 200/ok and ask the user to check Emma's inbox and confirm the gold "View My Portal" button is now tappable on iOS.

After verification, we can leave the function in place (harmless, only callable with the right invocation) or delete it on request.

## Why not invoke `notify-onboarding-update` directly
That function looks up an `operator_id`, reads the user's `notification_preferences`, and pulls the email from `auth.users`. Using a dedicated test sender avoids any risk of triggering real-operator side effects or being silently skipped by a preference toggle.