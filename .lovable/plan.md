# Why email functions keep breaking — and how to stop it

## The recurring failure patterns (found in the audit)

Across ~20 email-sending edge functions in `supabase/functions/`, three categories account for almost every incident we've hit:

1. **Auth / RPC drift** — functions authorize staff by calling `get_user_roles({ user_id })` or reading `app_metadata.roles`. The DB function actually expects `_user_id`, and the JWT rarely has roles populated. This is exactly what broke `send-osas-to-operator` (just fixed), and previously ICA sync. Several other functions still use `has_role` / `get_user_roles` inconsistently, or skip the auth check entirely.
2. **Two parallel sending paths** — 7 functions call the Resend REST API directly (`send-deactivation-notice`, `send-dot-consultant-request`, `send-insurance-request`, `send-lease-termination`, `send-return-receipt-pdf`, `invite-applicant`, `invite-staff`, `resend-invite`). The other ~13 go through `send-transactional-email` / `enqueue_email`. Direct-Resend functions bypass the queue, suppression list, retry logic, and `email_send_log` — so transient 429/5xx errors surface as hard `non-2xx` toasts, and bounces aren't suppressed on retry.
3. **Errors surface as generic "Edge Function returned a non-2xx status code"** — several functions throw before CORS headers are set, or return the raw Resend/PostgREST error body without status. The browser never sees the real cause, so we debug from logs every time.

Minor recurring bits: sender `from:` addresses hardcoded in each file (drift risk if the sending domain changes), attachment size not validated before Resend, and no shared idempotency-key convention so retries can double-send.

## The fix — one shared helper, then migrate

### Part 1 — Build the shared helper

Create `supabase/functions/_shared/email/`:

- `sender.ts` — single source of truth for `FROM_ADDRESS`, `SENDER_DOMAIN`, `REPLY_TO`, and the "Marcus + sender in CC" rule used by deactivation/DOT notices. Reads env, exposes typed `buildFrom(role: 'onboarding' | 'management' | 'recruiting')`.
- `auth.ts` — `requireStaff(req, { roles?: StaffRole[] })` helper. Uses `getClaims(token)` from the Authorization header, then queries `user_roles` with `.limit(1)` and the correct `_user_id` parameter. Returns `{ userId, roles }` or a ready-made 401/403 `Response` with CORS headers. Kills the RPC-parameter-drift class of bug.
- `respond.ts` — `ok(data)`, `fail(status, message, details?)`, `preflight()`. All responses include `corsHeaders` unconditionally. `fail` always returns JSON `{ error, details, status }` so `FunctionsHttpError.context.text()` in the browser shows the real cause.
- `send.ts` — `sendEmail({ templateName, recipient, templateData, idempotencyKey, attachments? })`. Default path enqueues via `send-transactional-email` / `enqueue_email` (queue, retries, suppression, `email_send_log`). Escape hatch `sendEmailDirect(...)` wraps Resend for the small set of cases that legitimately can't use a registered template (large PDF attachments today) — but it validates size (<40MB), checks `suppressed_emails` first, writes to `email_send_log`, and surfaces provider errors verbatim.
- `README.md` — short "how to add a new email function" template referencing the helper.

### Part 2 — Migrate existing functions

Two passes, so nothing breaks silently:

**Pass A — wrap auth + response (all 20 functions):**
Replace ad-hoc `getClaims` / `get_user_roles` / raw `new Response(...)` with `requireStaff` + `ok` / `fail`. This alone fixes the OSAS-class bug everywhere and makes browser errors readable. No behavior change to sending.

**Pass B — route through the helper for sending:**
- Direct-Resend functions that already have a template equivalent (`invite-staff`, `resend-invite`, `invite-applicant`, `send-insurance-request`, `send-lease-termination`, `send-dot-consultant-request`, `send-deactivation-notice`) → migrate to `sendEmail(...)` with a registered template. Register any missing templates in `_shared/transactional-email-templates/registry.ts`.
- `send-return-receipt-pdf` stays on `sendEmailDirect` (large base64 PDF attachment), but gains size validation, suppression check, and logging.

### Part 3 — Verify

- Redeploy every touched function in one batch.
- Smoke test the three highest-traffic paths via `curl_edge_functions`: OSAS send, deactivation notice, insurance request. Confirm 200 on happy path, and that a forced failure returns a readable JSON error in the browser (not "non-2xx").
- Spot-check `email_send_log` shows rows for the previously-direct senders.

## Files touched (technical)

New: `supabase/functions/_shared/email/{sender,auth,respond,send,README}.ts`
Modified (Pass A auth/response wrapper): all `send-*`, `notify-*`, `invite-*`, `request-*`, `revert-*`, `resend-*`, `launch-superdrive-invite`, `pei-auto-cadence`, `cron-cert-reminders`, `check-*-expiry` functions.
Modified (Pass B send-path migration): the 7 direct-Resend functions listed above (except `send-return-receipt-pdf`, which keeps direct but hardened).
Registry: `supabase/functions/_shared/transactional-email-templates/registry.ts` — register any missing templates surfaced during Pass B.

## Out of scope (say so up front)

- No changes to the auth email hook or Lovable-managed auth templates.
- No changes to `process-email-queue`, pgmq config, or DNS/domain setup.
- No UI changes — this is a backend consolidation. Existing callers keep the same `functions.invoke(name, ...)` signatures.
