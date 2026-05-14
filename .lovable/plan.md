## Goal

Implement reply suppression for the 3 PEI request emails so replies bounce harmlessly, and add a clear "this inbox is not monitored" notice directing recipients to the secure response button. No fallback contact address.

## Changes

### 1. Reply-To header
In `supabase/functions/send-transactional-email/index.ts` (or wherever the PEI templates are dispatched), set `Reply-To: compliance@notify.mysupertransport.com` (same as the From sender). Replies will bounce back to the unmonitored sending address rather than landing in a non-existent inbox.

If Reply-To is currently template-agnostic and applied globally, scope this so it only applies to the 3 PEI templates (`pei-request-initial`, `pei-request-follow-up`, `pei-request-final-notice`) — or confirm the global default already matches the From address (in which case no code change is needed).

### 2. Unmonitored-inbox notice in all 3 PEI templates

Files:
- `supabase/functions/_shared/transactional-email-templates/pei-request-initial.tsx`
- `supabase/functions/_shared/transactional-email-templates/pei-request-follow-up.tsx`
- `supabase/functions/_shared/transactional-email-templates/pei-request-final-notice.tsx`

Add a small notice block directly under the "Submit Response Securely" / "Complete the investigation" button, styled as a muted callout (smaller text, gray, with a subtle icon or border). Wording:

> 📭 This inbox is not monitored. Please use the secure response button above to submit your verification.

No fallback email address. No "if you have questions, contact…" line.

Add a shared style constant (`unmonitoredNotice`) to `_pei-shared.ts` so all 3 templates render identically.

### 3. Template viewer
The notice will automatically appear in the existing PEI Template Viewer (`PEITemplateViewer.tsx`) since it renders the same templates via the `preview-transactional-email` Edge Function — no viewer changes needed.

## Out of scope

- No changes to the response page (`PEIRespond.tsx`), token flow, queue, or suppression logic.
- No changes to the GFE / day-30 logic.
- No new Google Workspace mailbox required.

## Verification

After deploy:
1. Open PEI Template Viewer → render each of the 3 PEI templates → confirm notice appears under the CTA button on each.
2. Send a test PEI request to a real address → confirm From and Reply-To both show `compliance@notify.mysupertransport.com` in the email headers.
