## Answer to your additional question

**No** — the PEI workflow built so far does **not** actually email previous employers. The "Send" button in the PEI tab and queue is a stub: it flips the request status to `sent` and stamps a timestamp, but no email is delivered, and **no PEI email templates exist yet**. (The only email templates in the project today are the auth templates: signup, magic-link, recovery, invite, email-change, reauthentication.)

Your domain `notify.mysupertransport.com` is verified, so we can wire up real sending now.

---

## Plan: Wire PEI sending to real email + add a template viewer

### 1. Stand up app-email infrastructure
- Run the one-time setup so transactional emails can be sent from `notify.mysupertransport.com` through the durable queue (retries, suppression, unsubscribe handling).
- Generic sender Edge Function `send-transactional-email` becomes available.

### 2. Create the 3 PEI email templates
React Email components in `supabase/functions/_shared/transactional-email-templates/`:

1. **`pei-request-initial`** — first request to the previous employer.
2. **`pei-request-follow-up`** — sent on day ~15 if no response.
3. **`pei-request-final-notice`** — sent on day ~25; explicitly states a Good Faith Effort will be filed at day 30 if no response (per your Q3 confirmation).

Each template includes:
- Carrier letterhead (SUPERTRANSPORT brand, gold `#C9A84C`, `#0D0D0D` text — matches existing email styling).
- Applicant full name, DOB last 4, dates of employment claimed.
- Plain-English §391.23 explanation of why the data is required.
- Secure response button → `https://mysupertransport.lovable.app/pei/respond?token=…` (page already exists).
- Deadline date (computed from `date_sent + 30d`).
- Signed by carrier compliance team.

**Sender identity (Q1 / Q2):** From `SUPERTRANSPORT Compliance <compliance@notify.mysupertransport.com>`, Reply-To same address. Generic mailbox, not per-staff.

### 3. Replace the stub sender
Rewrite `src/components/pei/sendPEIEmail.ts` to:
1. Look up the request, applicant, and employer contact info.
2. Invoke `send-transactional-email` with the matching template, `templateData`, and an idempotency key of `pei-${requestId}-${kind}`.
3. On success, patch `pei_requests` with the appropriate status + date stamp (existing logic).
4. Stamp `last_email_message_id` on the request for traceability.
5. Loud failure on send error — do not advance the status if the email did not enqueue.

### 4. PEI Email Template Viewer (new)
A new staff-only view so you can read/preview the actual templates being sent.

**Location:** Management Portal → new "PEI Email Templates" sub-page (or a tab inside the existing PEI queue panel — confirm preference; default = sub-page under Management).

**What it shows, per template:**
- Template name + when it's used (initial / day 15 / day 25).
- Live HTML preview rendered in an iframe using realistic sample data (applicant "Jane Doe", employer "Acme Trucking", deadline computed from today).
- Plain-text fallback view toggle.
- Read-only — editing templates still requires a code change (templates are versioned in the repo).

Implementation: a small Edge Function `render-pei-email-preview` that takes a template name + sample data and returns the rendered HTML, called by the new React page.

### 5. Out of scope (deferred, unchanged from prior)
- Auto-cron escalation from initial → follow-up → final notice → GFE.
- In-app WYSIWYG template editor (templates remain code-managed).
- Per-staff sender identity.

---

## Technical Summary

| Area | Change |
|---|---|
| Infra | Set up app-email infrastructure on `notify.mysupertransport.com`. |
| New Edge Functions | `send-transactional-email` (scaffolded), `handle-email-unsubscribe`, `handle-email-suppression`, `render-pei-email-preview` (custom, for viewer). |
| New templates | `pei-request-initial.tsx`, `pei-request-follow-up.tsx`, `pei-request-final-notice.tsx` + registry update. |
| Edited | `src/components/pei/sendPEIEmail.ts` (real send + message-id stamp). |
| New UI | `src/pages/management/PEIEmailTemplatesView.tsx` + route entry in management nav. |
| Schema | Add nullable `last_email_message_id text` to `pei_requests` (single migration). |
| Unsubscribe | A `/unsubscribe` page is required by the email infra; will be added with neutral branded styling (employers won't typically unsubscribe, but compliance requires the link). |

No changes to authentication, RLS on application tables, or the application form itself.