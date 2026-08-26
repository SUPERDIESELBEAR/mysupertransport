# Rate Confirmation Inbound Email Ingestion

Rate confirmations emailed to a dedicated address land in a shared dispatcher queue, already parsed and verbatim-verified server-side. Manual upload on Create Load is untouched — this is a second front door.

## 0. DNS — what you must create, in order (your action, before anything can be tested)

The existing sender subdomain `notify.mysupertransport.com` is NS-delegated to Lovable's nameservers, so Resend cannot receive mail there. Inbound uses a **new, separate subdomain** — no conflict with outbound.

1. **Add the domain in Resend**: create an inbound domain, e.g. `parse.mysupertransport.com`. Resend's dashboard will show the exact MX (and SPF TXT) record values — copy them from there; do not use remembered values.
2. **At your DNS provider**, create the MX record for `parse.mysupertransport.com` pointing at the Resend inbound SMTP host(s) exactly as shown, plus the TXT record if Resend asks for one.
3. **Verify in Resend** (their dashboard re-checks DNS; propagation can take minutes to hours).
4. **Create the inbound route/address** (e.g. `ratecons@parse.mysupertransport.com`) — leave the webhook URL unset until step 5.
5. After the ingest function is deployed (built below), paste its URL into Resend as the webhook endpoint for that address, and store the signing secret it issues.

Order matters: MX first, verification second, webhook last — mail arriving before the webhook exists is dropped by Resend, not queued.

## 1. pdfjs in Deno — verification step before building

The plan assumes a text layer can be extracted inside an edge function. pdfjs-dist's legacy build is the candidate (it can run `getTextContent` without a browser DOM when the worker and canvas are disabled), but this is not guaranteed to be clean under Deno.

- **Gate task**: a throwaway probe function that loads the Nationwide fixture PDF and asserts a non-empty text layer. Run before anything else is built.
- If pdfjs fails under Deno: fall back to a self-contained pure-TS/JS PDF text extractor (no native deps), still server-side. The constraint stands: **silently skipping verification is not acceptable** — if no extractor works, the plan stops here rather than shipping parse-without-verify.

## 2. Shared extraction + verbatim core (refactor)

- Move the pure verbatim functions (`verbatimVerify.ts`, `verbatimAdopt.ts`, `verbatimRegions.ts`, `textNormalize.ts` as needed) from `src/lib/` into `supabase/functions/_shared/verbatim/` and have the client import them from there (the client already tolerates cross-boundary imports of pure code; edge functions cannot import `src/`).
- Extract the AI-calling core of `parse-rate-confirmation/index.ts` (prompts, schema, sampling pins, contract meta) into `_shared/ratecon/extract.ts` so it is callable in-process. The existing HTTP function keeps its staff auth and becomes a thin wrapper — manual upload behavior is byte-identical.

## 3. Auth for the server-side parse — recommendation

**No HTTP call, no shared secret.** The ingest function is already a verified context (Resend webhook signature verified with its signing secret). It invokes the extraction core **directly in-process** with the service-role client — there is no staff JWT and no new publicly reachable parser surface.

Rationale: an internal shared secret on a public endpoint turns "verify one HMAC" into "anyone holding the secret is staff." In-process invocation removes that surface entirely; the only public endpoint is the webhook, guarded by Resend's signature verification, and a failed signature is a 401 with no processing.

## 4. Ingest webhook: `receive-rate-con-email`

New edge function, `verify_jwt = false`, signature-verified against the Resend inbound signing secret (same verification library pattern as `handle-email-suppression`, but with the Resend-provided secret stored via `add_secret`).

For each inbound message:

1. Verify signature → 401 on failure.
2. Fetch/parse the message payload; compute SHA-256 of each PDF attachment.
3. **Duplicate collapse**: if an attachment hash already exists on a queue item, record the duplicate occurrence on that item and stop — one item per document.
4. Extract text layer (section 1) → run extraction core → run verbatim verify + adoption server-side → adopted values are what get stored. Verdicts and origins are stored with the item so the queue shows "verified / repaired / needs eyes" exactly as the upload path does.
5. **No usable attachment** (portal link, plain-text tender, image-only body): still create a queue item, status `needs_manual`, with sender/subject/date and a link to the stored email. Nothing is silently dropped.
6. **Junk tolerance**: any parse or extraction failure still creates a queue item with the error recorded, dismissible in one click. The endpoint never errors to Resend in a way that causes redelivery loops — always 200 once the signature verifies.
7. Attachments and the raw email stored in a private storage bucket (`inbound-rate-cons`), paths recorded on the queue row.

## 5. Queue table: `rate_con_ingest_queue`

UUID pk, `created_at`/`updated_at`, `source_message_id` (Resend id, unique), `from_address`, `subject`, `received_at`, `attachment_paths jsonb`, `attachment_sha256 text` (dedupe key), `status` enum (`pending`, `needs_manual`, `dismissed`, `converted`, `auto_handled`), `parse_result jsonb`, `verbatim_checks jsonb`, `error text`, `load_id uuid null` (set on conversion), `broker_reference text null`. GRANTs + RLS: dispatcher/management/owner read and update status; insert only via service role (the webhook). Audit log entry on convert/dismiss with actor.

**Auto-handled rule**: a scheduled (or on-read) check — when a queue item's parsed broker reference equals the broker reference of a load that already exists (created manually), status flips to `auto_handled` and it leaves the open count. Match is exact on normalized reference; a fuzzy match is surfaced for human dismissal instead.

## 6. Dispatcher UI

- New "Rate Con Inbox" list page under Dispatch: one row per open item — sender, received time, parse health chip (verified / repaired / needs eyes / no attachment), extracted broker + reference.
- Row actions: **Review parse** (opens the existing Create Load review screen pre-filled from `parse_result`, identical confidence markers as manual upload), **Retrieve manually** (opens the stored email/attachments, then blank Create Load), **Dismiss** (one click, confirmation-free, undoable from a dismissed filter).
- Shared queue: no claiming, no routing. Menu badge = count of `pending` + `needs_manual`. The only notification.
- **No driver guessing**: the parse fills the load; driver assignment stays a human step, exactly as the manual path.

## 7. Conversion

"Review parse" reuses the Create Load save path unchanged. On save, the queue item gets `status = converted`, `load_id` set, and the source PDF is attached as the load's `rate_confirmation` document (same as manual upload). Dismissed and auto-handled items are excluded from the badge count.

## Technical notes

- Migration: `rate_con_ingest_queue` table + enum + grants + RLS; private storage bucket `inbound-rate-cons` with service-role-only access.
- New functions: `receive-rate-con-email`, throwaway `probe-pdfjs-deno` (deleted after the gate passes).
- Refactor: verbatim libs → `_shared/verbatim/`; extraction core → `_shared/ratecon/extract.ts`; `parse-rate-confirmation` becomes a wrapper (contract number unchanged — response shape does not change).
- Secrets: `RESEND_INBOUND_SIGNING_SECRET` via `add_secret`.
- Client: new page + route, nav badge from a count query; reuse of existing parse-review components.
- Tests: dedupe hash collapse, auto-handled reference match, no-attachment item creation, junk tolerance (malformed payload → 200 + error row), verbatim adoption runs in the ingest path with a fixture, signature rejection.
- Out of scope: driver assignment changes, manual upload changes, any outbound email changes.
