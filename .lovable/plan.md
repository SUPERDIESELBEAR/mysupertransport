# Send a test PEI to your personal email

## Goal

Let staff send a sample copy of any PEI template (initial / follow-up / final notice) to a specified email address — without touching real `pei_requests` rows or advancing any statuses.

## Where it lives

A new "Send test PEI" button in the **PEI Queue** header (`src/components/pei/PEIQueuePanel.tsx`), next to the existing controls. Clicking it opens a small dialog with:

- **Recipient email** (text input, defaults to the signed-in staff user's email)
- **Template** (radio: Initial request / Follow-up / Final notice)
- **Send test** button

On submit it calls `send-transactional-email` directly with realistic sample data and shows a success/error toast. It does NOT write to `pei_requests`, does NOT advance any status, and does NOT use a real applicant's data.

## Sample data used

Hard-coded, clearly-fake values so the recipient can tell it's a test:

- applicantName: "Test Applicant"
- employerName: "Sample Trucking Co."
- contactName: "Jane Doe"
- employmentStartDate: "01/2022"
- employmentEndDate: "06/2024"
- deadlineDate: "by December 1, 2026"
- daysRemaining: 14 (used by follow-up / final notice)
- responseUrl: a non-functional sample link to `/pei/respond/test-token-preview` so the button renders but the token won't validate

The email subject and body will look identical to a real send (same templates, same domain), with "[TEST]" prepended to the subject so it's obvious in the inbox.

## Files to change

1. `src/components/pei/PEIQueuePanel.tsx` — add the "Send test PEI" button + dialog state.
2. `src/components/pei/SendTestPEIDialog.tsx` (new) — small modal with the form + submit handler that invokes `send-transactional-email`.

No edge function or template changes — the existing `pei-request-initial`, `pei-request-follow-up`, and `pei-request-final-notice` templates are reused as-is.

## Out of scope

- Sending test copies to multiple recipients at once.
- Persisting test sends in `pei_requests` or `email_send_log` reporting UI (the row will still appear in `email_send_log` automatically — that's fine for verification).
- Adding a "[TEST]" watermark inside the email body (subject prefix is enough).

## Open question

Want the test dialog gated to admins/owners only, or available to any staff who can see the PEI Queue?

