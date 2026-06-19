## Goal

Verify the new email flow end-to-end, send live mock emails to `emma@mysupertransport.com` for visual sign-off, then clean up the in-app Content Manager (`EmailCatalog.tsx`) so it shows only the emails that actually fire today.

---

## 1. Backend test pass (read-only, no code changes)

Run smoke tests against the three updated edge functions and read their logs:

- `send-notification` — POST with `kind: "application_submitted"` using a mock applicant payload. Confirm 200 + a delivery log line. Also confirm the deprecated `application_approved` branch returns the expected "deprecated" response (no email).
- `launch-superdrive-invite` — POST with a real test operator id (existing test account). Confirm a single email is generated with the new "You're approved, {FirstName}" subject and a `/welcome` recovery link.
- `invite-operator` — POST with a new throwaway email. Confirm it uses `createUser` (no auto Supabase invite email) and returns a recovery link pointing at `/welcome`.

For each call: `supabase--edge_function_logs` is checked for errors / unhandled rejections. Any failure is reported back before moving on.

## 2. Mock emails to emma@mysupertransport.com

Send 3 live test sends via the existing `send-test-email` function so Emma can eyeball the rendered HTML in her inbox:

1. **Application Submission Confirmation** (new) — warm "We've got your application, {FirstName}".
2. **Approval + SUPERDRIVE Welcome** (consolidated) — new subject, single CTA → `/welcome`, expectation-setter line, install fallback footer.
3. **Operator Invite (recovery link)** — the `invite-operator` flavor, so Emma sees the new password-set link instead of the old generic Supabase invite.

All three go to `emma@mysupertransport.com`. The previously-implemented templates are reused; no copy is changed during the test send.

## 3. Content Manager cleanup (`src/components/management/EmailCatalog.tsx`)

The catalog is the staff-facing list of "emails the system sends." It currently lists two entries that no longer fire and is missing the new applicant confirmation.

**Remove**
- `invite_operator` — "Operator Welcome — Application Approved" / subject "Your SUPERTRANSPORT Application Has Been Approved!" with the broken `/login` CTA. Deprecated; replaced by the consolidated approval email.

**Update in place**
- `welcome_superdrive` — rename to **"Approval + SUPERDRIVE Welcome"**, update subject to **"You're approved, {FirstName} — welcome to SUPERTRANSPORT"**, change CTA URL to `/welcome`, replace the in-email install block with the one-liner expectation-setter ("After you set your password, we'll walk you through installing SUPERDRIVE on your phone — takes about a minute.") and a small footer fallback ("Need to install on a different device later? Go to mysupertransport.com/install"). Body copy matches what `launch-superdrive-invite` now sends.

**Add**
- New entry `application_submitted` under the `invitations` (or new `applicant` if cleaner) category — "Application Submission Confirmation," warm thank-you body, no CTA, mirrors the HTML now produced by `send-notification`.

No other catalog entries are touched. No DB migrations. No changes to send-time logic — only the staff-facing preview list and copy.

## 4. Reporting back

After the test run + sends, post a short summary: pass/fail for each function, the message IDs (or "queued") for Emma's three emails, and the list of catalog changes that landed.

## Technical notes

- Tools used: `supabase--curl_edge_functions`, `supabase--edge_function_logs`, `code--apply_patch` (only for `EmailCatalog.tsx`).
- No schema changes, no new secrets, no new routes.
- `send-test-email` already handles auth + Resend delivery; no edits needed there.
- If any of the three smoke tests fail, stop and surface the error instead of proceeding to the catalog edit.
