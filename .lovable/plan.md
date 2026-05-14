## Goal

Send another test PEI email to `marcsmueller@gmail.com` (a non-Lovable address) and confirm the gold "Complete the investigation" button lands on the public response page without hitting a Lovable login wall.

## Steps

1. **Invoke `send-transactional-email`** via the edge-function curl tool with the same payload `SendTestPEIDialog` uses:
   - `templateName`: `pei-request-initial`
   - `recipientEmail`: `marcsmueller@gmail.com`
   - `idempotencyKey`: `pei-test-initial-marcsmueller-<timestamp>`
   - `templateData`: same sample data as the dialog (Test Applicant / Sample Trucking Co. / Jane Doe / 01/2022–06/2024 / `responseUrl = https://mysupertransport.lovable.app/pei/respond/test-token-preview` / deadline / 14 days)
   - This requires your logged-in admin session (the curl tool injects it automatically).

2. **Verify queueing** via a quick `email_send_log` lookup for that `recipientEmail` to confirm status `pending` or `sent` (no `dlq` / `suppressed`).

3. **Navigate the browser to the exact URL the email button uses**: `https://mysupertransport.lovable.app/pei/respond/test-token-preview` (the published site, not the preview sandbox). Capture a screenshot to confirm:
   - No Lovable login wall
   - Amber "Preview mode" banner renders
   - Form shows the mock applicant/employer data

4. **Report back** with: send status, log row, and screenshot of the public response page. You then click the gold button in your inbox to confirm end-to-end on real email.

## Notes

- No code changes — this is purely a verification run.
- The button URL is hard-coded to the published site in `SendTestPEIDialog.tsx`, so the real inbox click will hit the same page I screenshot.
- If the send returns `suppressed`, your address is on the suppression list from prior testing and we'll need to remove it before retrying.
