## Goal

Add a tamper-evident audit trail for PEI (previous employer investigation) requests so we can prove when previous employers opened the response link, opened the FCRA release, and submitted their response — including IP address and user-agent. No CC/BCC of staff inboxes. Surface the trail in the PEI viewer for FMCSA audit defensibility.

## What we're adding

1. **Per-event log** of every interaction the previous employer has with our tokenized links (open + submit), with server-captured IP and user-agent.
2. **Signature provenance** stamped onto the response itself (precise `signed_at`, `signed_ip`, `signed_user_agent`).
3. **Audit trail panel** inside the existing PEI Response Viewer ("Sent → Delivered → Opened response link → Opened FCRA release → Signed") so staff (and any future auditor) see the full timeline in one place.

## Database changes

New table:

```text
pei_request_events
  id              uuid pk
  pei_request_id  uuid fk -> pei_requests(id) on delete cascade
  event_type      text   -- 'opened_response_link' | 'opened_release_link' | 'submitted'
  occurred_at     timestamptz default now()
  ip_address      inet
  user_agent      text
  metadata        jsonb  -- e.g. { response_id }
```
- Indexed on `(pei_request_id, occurred_at desc)`.
- RLS: staff can `select`; only the service role inserts (writes only happen from edge functions).

New columns on `pei_responses`:
- `signed_at timestamptz` (precise; existing `date_signed date` kept for backward compat)
- `signed_ip inet`
- `signed_user_agent text`

`submit_pei_response` RPC: extend signature to accept a `p_meta jsonb` with `signed_ip`, `signed_user_agent`, `signed_at`, and store them on the response row.

## New edge function

`log-pei-event` (POST `{ token, event_type, response_id? }`):
- Resolves `pei_request_id` from `response_token` (server-side, service role).
- Derives IP from `x-forwarded-for` / `cf-connecting-ip`, user-agent from `user-agent` header.
- Inserts a row into `pei_request_events`.
- Validates `event_type` against the allowed set.
- Silent failure on the client — logging never blocks the user flow.

Existing `pei-release-fcra` is updated to also log `opened_release_link` server-side as a defense-in-depth backup (in case the client-side call is blocked).

## Frontend wiring

- `src/pages/PEIRespond.tsx`
  - On mount (after token resolves, non-sample): fire `log-pei-event` with `opened_response_link`.
  - On successful submit: fire `log-pei-event` with `submitted` + the new `response_id`. Also pass `signed_at: new Date().toISOString()` and `user_agent: navigator.userAgent` into the `submit_pei_response` RPC via the new `p_meta` param. (IP is added server-side in the edge function event log; the response row's `signed_ip` is enriched by a tiny follow-up edge call so the row carries it too.)
- `src/pages/PEIRelease.tsx`
  - On mount (non-sample token): fire `log-pei-event` with `opened_release_link`. Skip for `token === 'sample'`.
- `src/components/pei/PEIResponseViewer.tsx`
  - New "Audit Trail" section listing all `pei_request_events` for the request plus the matching `email_send_log` rows by `last_email_message_id`. Format:
    ```text
    Sent        2026-05-15 09:14 CT  by Sarah K.
    Delivered   2026-05-15 09:14 CT  (Lovable Email)
    Opened      2026-05-15 11:02 CT  104.28.xx.xx · Chrome/macOS  (response link)
    Opened      2026-05-15 11:03 CT  104.28.xx.xx · Chrome/macOS  (FCRA release)
    Signed      2026-05-15 11:09 CT  104.28.xx.xx · Chrome/macOS
    ```
  - Adds a "Print audit trail" button alongside the existing print action.

## Deliberately NOT doing

- **Not** adding staff CC/BCC to outbound PEI emails. It creates inbox noise, leaks PII into staff mailboxes, and the audit trail above is stronger evidence than an inbox copy.
- Not changing email templates, not changing the responder's form UX, not touching GFE flow.

## Files touched

- `supabase/migrations/<new>.sql` — new table, new columns, RLS, updated `submit_pei_response`.
- `supabase/functions/log-pei-event/index.ts` — new function.
- `supabase/functions/pei-release-fcra/index.ts` — also log `opened_release_link`.
- `src/lib/pei/api.ts` — `logPEIEvent(token, eventType, responseId?)` helper + types for events.
- `src/lib/pei/types.ts` — `PEIRequestEvent` type, extended `PEIResponse`.
- `src/pages/PEIRespond.tsx` — call `log-pei-event` on mount + submit; pass meta to RPC.
- `src/pages/PEIRelease.tsx` — call `log-pei-event` on mount (skip for `sample`).
- `src/components/pei/PEIResponseViewer.tsx` — audit trail section + print.
- `mem://features/pei/fcra-release-link.md` — note the new event-logging behavior.

## Verification

1. Send a real PEI to a test inbox, open the response link from a different network, open the FCRA release, submit. Confirm three event rows appear with distinct event types, plus a `signed_ip` / `signed_user_agent` on the response.
2. Open the response viewer and confirm the audit trail renders in chronological order with IP + UA.
3. Confirm the `sample` token still bypasses all logging.