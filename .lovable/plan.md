# Purge path-column guard, §7 throttling finding, officer email merge

## Finding — Pass B §7 throttling was never shipped

Verified against the live database, not the migration files. `pg_get_functiondef('public.resolve_share_token')` contains no counting, no interval window, no rate check, and no raise — its only write is the `share_token_access_log` insert. No edge function fronts it: `InspectionSharePage.tsx` calls the RPC directly from the client, so there is nowhere a per-IP counter could run today.

Both halves of §7 are missing, and from the **shipped `inspection_document` scope**, not just the new branch:

- Per-token in the RPC, fail-closed — absent.
- Per-IP in the edge function, fail-open — absent, along with the edge function.

Recorded as shipped-behaviour, the same way the missing eld-sync-alert function was.

## Scope decision — the smaller change, stated plainly

**Only `officer_packet` goes through the new endpoint.** `InspectionSharePage` keeps calling the resolver directly. Fronting both scopes would change how every QR sticker already printed and stuck in a truck resolves, and that is not a change to make as a side effect of adding an officer packet.

So the finding closes by half:

- **Closed for every scope:** per-token, fail-closed, in the RPC.
- **Still open for `inspection_document`:** per-IP. Nothing throttles by source address on that path, and nothing will until it moves behind an endpoint.

### Register item — inspection_document per-IP gap (open)

Closing it requires an edge function fronting `resolve_share_token`, `InspectionSharePage` repointed at it, and — because 693 stickers are already printed — the raw RPC left executable during a transition or the sticker URLs redirected rather than replaced. That is a live-path change with a physical rollout, tracked separately and not bundled here.

### Binder-token behaviour does not change

Confirmed on the live table: 693 `inspection_document` tokens, **all with `expires_at` NULL**, none revoked. Those tokens are non-expiring by design and every printed sticker depends on it.

**The throttle migration touches the function body only.** No `ALTER TABLE share_tokens`, no write to `expires_at`, no default added, no backfill. The resolver's expiry branch (`expires_at IS NOT NULL AND expires_at <= now()`) is untouched, so a NULL expiry still means never expires. A test asserts every `inspection_document` token still has a NULL expiry after the migration, and that a binder token resolves normally under the new code.

### The throttling itself

1. **Per-token, in the RPC, fail-closed.** Count `share_token_access_log` rows for the token in a rolling window; over the ceiling the resolver logs a `throttled` outcome and returns no rows. If the count itself errors, it refuses — an unlogged compliance-document fetch is not something to serve.
2. **Per-IP, in the new officer_packet endpoint, fail-open.** Counting on `ip_hash`; if the counter is unavailable the request proceeds, because a legitimate roadside share 404ing on a dead counter is worse than an unthrottled window on a 4-hour token.

Both failure paths are driven by tests, not just the happy path.

## Part 1 — Purge coverage check (verified)

`rods_days` has four `_path` columns — `pdf_path`, `certification_signature_path`, `source_document_path`, `display_document_path` — and the live three-argument `purge_rods_day` collects all four. Nothing to repair, only the guard.

## Part 2 — The drift test

New `src/test/purge-path-coverage.test.ts`, shaped like `definer-live-catalog.test.ts`: reads the real database through `psql`, loud banner and skip only when `PGHOST` is absent.

1. **Column snapshot** from `information_schema.columns` equals a literal set in the test — a new column fails here first, by name.
2. **Function coverage:** parse `pg_get_functiondef`, extract every `v_day.<name>_path` appended to `v_paths`, assert equality with the column set minus a named `DELIBERATELY_EXCLUDED` list (empty today).
3. **Return shape:** still returns `storage_paths`.

Parsed rather than executed — the function deletes the row it reports on.

## Part 3 — Officer email merge

### Builder — `src/lib/eld/offline/buildOfficerPacket.ts`

Cover page (driver, carrier, USDOT/MC, truck, window, generation time, day order), then 8 days newest first: keyed + printable embeds cached `rods_pdfs` pages; `eld_document` + printable embeds the photo, preferring `display_bytes`; anything else gets a **named placeholder page** with the date and exact reason. Reuses `manifestBuild.ts`'s rules, built entirely from IndexedDB. Returns bytes, `included_dates`, and a per-day disposition list.

### Ceiling and downsampling

`sendResendDirect` rejects above 20 MB base64 (~15 MB raw); Resend's cap is ~40 MB base64. Target **12 MB raw**, measured. Over it, downsample **photo pages only** through `renderability.ts`'s canvas re-encode in four passes: q0.85→0.70, q0.55, max edge 2000 @0.70, max edge 1400 @0.70. No day dropped, no placeholder substituted for a page that has bytes, cover page states the reduction.

### Link fallback — share token, reached only after pass 4

Scope `officer_packet`, `resource_id` = the sync-queue entry id, so the existing `UNIQUE (scope, resource_id)` yields one token per send: a retry reuses it, a second officer gets a second. **Expiry 4 hours**, matching the roadside decision. The link resolves through the new edge function, which applies per-IP fail-open limiting, calls the resolver (logged, per-token throttled), and then **streams the object with the service role** — no signed Storage URL leaves the server. The roadside screen lists any live link with its expiry and a **Revoke now** button on the existing revoke RPC; the blocked attempt afterwards is logged.

### Two sends, reported separately

Officer first, its own Resend call. Carrier copy (`carrier_notification_settings`) second, separate and best-effort — not a CC, so a bad carrier address cannot fail the officer's copy. `officer_delivery` and `carrier_delivery` audited independently with their own provider errors. Status keys on the officer send; a carrier failure raises an office-side alert and never reads to the driver as "the packet didn't send." The queue retries officer failures, treats carrier-only failures as success.

### Idempotency and path scheme

`${operator_id}/officer-packets/${entry_id}.pdf` in `eld-notices`, mirroring `${operatorId}/${eventId}/notice.pdf`. No timestamp. `entry_id` is the `newSyncId()` uuid, persisted at enqueue and reused on retry, so a retry cannot double-send and a genuinely new send delivers. `event_id` rides in the payload only. The edge function records the entry id in `email_send_log` and returns the prior result if a `sent` row exists.

### UI and offline

Officer sheet in `RoadsidePacket.tsx` replacing today's placeholder alert: officer email required, name and agency optional, a pre-send list naming which days embed and which are placeholders. Offline, the send queues and Web Share or download is offered immediately.

### Tests

- Merge fixtures: keyed-only, photo-only, mixed, `display_conversion_failed`, empty event set, empty window — page count, order, named placeholder per non-embedded day.
- `included_dates` never names an unembedded date.
- Downsampling crosses under by pass 4; an incompressible fixture takes the link path.
- Token: 4-hour expiry, retry reuses one, two sends mint two, revoke blocks and logs.
- Throttle: per-token over-limit returns nothing and logs `throttled`; per-token counter failure refuses; per-IP counter failure still serves.
- Binder tokens: all `inspection_document` expiries still NULL after the migration, and one resolves normally.
- Idempotency: two enqueues, two paths; one entry retried three times, one path and one delivery.

## Technical notes

- Part 2 is database-backed and skips loudly without `PGHOST`.
- One migration (resolver body: per-token throttle + `officer_packet` branch — no table change), two edge functions (`send-officer-packet`, the token-gated stream), no new table. `merged_packets` is Dexie; `eld-notices` exists.
