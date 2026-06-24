## Plan: Fix viewer rendering + allow testing with a specific operator's QPassport

### Issue 1 — Viewer page rendered as raw HTML

Your screenshot shows the browser displayed the HTML as plain text instead of rendering it. That means the `Content-Type: text/html` header was not honored end-to-end. The likely cause: Supabase's edge-function gateway can override or strip headers when responses don't include the standard CORS headers, falling back to `text/plain`.

**Fix in `supabase/functions/download-qpassport/index.ts`:**
- Merge `corsHeaders` into every Response (viewer page, PDF responses, error pages) — Access-Control-Allow-Origin, etc. Right now only the OPTIONS preflight returns CORS headers; the other responses don't, which can cause the gateway to substitute the Content-Type.
- Add `X-Content-Type-Options: nosniff` is already implicit — instead, make Content-Type fully explicit: `text/html; charset=utf-8` (already set) AND ensure no other middleware path is being hit.
- Add a `Content-Type-Options` exemption is not needed; the real fix is consistent header merging.
- Sanity log on first request so we can confirm in `edge_function_logs` which branch served the response.

After redeploy, hitting the same URL should render the dark viewer page with the iframe.

### Issue 2 — Test with a specific operator's QPassport (Emma Mueller)

Right now `send-test-email` picks **the most recently uploaded** QPassport across all operators and sends the link to a hardcoded `emma@mysupertransport.com`. To test against Emma's actual portal QPassport (operator account `emmafmueller@gmail.com`):

**Change in `supabase/functions/send-test-email/index.ts`:**
- Accept an optional JSON body: `{ "operator_email"?: string, "to"?: string }`.
- If `operator_email` is provided: look up `auth.users` → `operators.user_id` → `onboarding_status.qpassport_url` for that email. If found, mint the download link against that operator. If not found or no QPassport on file, return a clear 404 with the reason (don't silently fall back).
- If `to` is provided, send the email there; otherwise default to `emma@mysupertransport.com`. Validate it's an email.
- Defaults stay identical when called with no body, so existing behavior is preserved.

**After build:**
1. Deploy `download-qpassport` and `send-test-email`.
2. Invoke `send-test-email` with `{ "operator_email": "emmafmueller@gmail.com", "to": "emma@mysupertransport.com" }` — this finds Emma's operator record, mints a token bound to **her** QPassport, and emails the link to your inbox.
3. Open the email → click **"Open QPassport"** → confirm the dark viewer page renders (PDF in iframe + auto-download).
4. If the lookup returns 404, I'll report it so you know whether Emma's `onboarding_status.qpassport_url` is empty (separate data issue, not a code issue).

### Out of scope
- No changes to the production `send-notification` flow.
- No DB schema changes.
- Token format unchanged.
