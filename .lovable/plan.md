## Problem
`send-test-email` hardcodes `name = 'Emma Mueller'` and, when no `operator_email` is provided, falls back to "the most recently uploaded QPassport across all operators." That means any test send risks:
- Greeting the wrong person ("Hi Emma Mueller,") regardless of recipient.
- Linking to whichever operator most recently had a QPassport uploaded — not the recipient's.

## Fix
Make the email always match the operator whose QPassport is being sent:

1. **Require `operator_email`** (or `operator_id`) on the request. Remove the "most recent QPassport" fallback so we never silently send the wrong driver's QPassport.
2. **Look up the operator's real name** from `operators` (and/or `profiles`) for that user, and use it in the greeting instead of the hardcoded "Emma Mueller".
3. **Default the `to` field to the operator's own email** when no override is supplied, so a test send goes to that driver. Only use a different `to` when the caller explicitly passes one (for internal QA).
4. **Clear error responses** when:
   - `operator_email` missing
   - no auth user found
   - no operator record
   - operator has no QPassport on file
5. Keep the existing signed `/qpassport/view?token=...` link generation unchanged — it's already per-operator.

## Out of scope
- No change to `QPassportView.tsx`, `buildQPassportDownloadUrl`, or the email layout/branding.
- No new UI; this is an edge-function-only change. If you want a staff-facing "Send test QPassport email to this operator" button later, that's a separate task.

## Verification
- Call `send-test-email` with `{ "operator_email": "emma@mysupertransport.com" }` → email greets "Emma …", links to Emma's QPassport.
- Call with a different operator's email → email greets that operator, links to their QPassport.
- Call with no `operator_email` → 400 error, nothing sent.
- Call with an operator that has no QPassport → 404 error, nothing sent.
