# Fix: Passenger Authorization "Send to driver" delivers wrong email

## Root cause (confirmed from logs)
When Send to driver runs, `send-passenger-auth` successfully creates the tokenized row, then calls `send-transactional-email` with template `passenger-auth-request`. That call returns **404 "Template not found in registry"** (seen in `send-passenger-auth` logs and in `send-transactional-email` logs: `Template not found in registry { templateName: "passenger-auth-request" }`).

The template file and its entry in `registry.ts` exist in the codebase, but `send-transactional-email` bundles the registry at deploy time. The deployed bundle predates the passenger-auth template addition, so the running function doesn't know about it. The "Document Shared With You / Download File" email that arrived is the unrelated generic resource-share email from an earlier envelope-icon test.

## Fix
1. Redeploy `send-transactional-email` so its bundled `TEMPLATES` map includes `passenger-auth-request` (and the equipment/PEI templates already in `registry.ts`).
2. Also redeploy `send-passenger-auth`, `get-passenger-auth`, and `finalize-passenger-auth` together to make sure the whole flow is on the latest code (cheap safety).
3. Re-test Send to driver as Marcus Mueller and confirm:
   - The email subject reads "Action needed: Passenger Authorization for Unit …" (from the template).
   - The body has the gold "Complete Passenger Authorization →" button (not a plain "Download File" button).
   - The button opens `/passenger-auth/<token>` in SUPERDRIVE where the form can be filled and signed.
   - After signing, the executed PDF appears in Marcus's Driver Hub documents.
4. Verify via `email_send_log`: the latest row for that recipient should be `template_name = 'passenger-auth-request'` with status `sent` (not `failed`).

## Follow-up recommendation (optional, ask before doing)
Hide the generic envelope "Send by email" icon on the Passenger Authorization card in the Resource Library so the only send action for that specific resource is the fillable "Send to driver" flow. This prevents accidentally emailing the blank template as a download in the future. I'll only do this if you say yes — it's a small UX guard, not part of the bug fix.

## Out of scope
No changes to the signing page, PDF layout, storage buckets, DB schema, or template contents — only a redeploy.
