# Stage 3, Pass B — Write Path

## Verified current state (read this turn)

- `pending_mutations` exists in Dexie v1 with an **auto-increment `++id`** primary key. Pass B needs a client-generated uuid id, and the additive-only Dexie rule forbids redefining a primary key — so Pass B adds a **new store `sync_queue`** (v3) and leaves `pending_mutations` untouched and unused until a later version can remove it. No bytes discarded.
- `certify_rods_day(_day_id, _legal_name, _signature_path, _pdf_path, _device_info)` — SECURITY DEFINER, tiling + 12-field §395.8 header guard, `total_mileage_today` deliberately excluded.
- `rods_days` has `main_office_address`, `home_terminal_timezone`, `period_start_time`. Partial unique index `rods_days_one_certified_per_date` exists.
- `replace_rods_document` exists. `create_eld_document_day` did not; it is added by the Pass B migration.
- Binder share tokens are **not a reusable primitive**: `inspection_documents.public_share_token uuid` per row, resolved by `get_inspection_doc_by_token`, with no expiry, no revocation, no access log.
- Stage 1 notice retry is `pendingNotice.ts` on **localStorage base64**, driven from `useEldMalfunction`, the wizard and the dashboard.
- The `/roadside` guard is real and enforced twice: an ESLint rule on `src/components/eld/Roadside*` and `roadsideImportGraph.test.ts`, which walks static imports from `RoadsideEntry.tsx` and fails on any reach to the Supabase client, auth, or pdf-lib. `roadsideBundle.test.ts` re-checks the emitted chunks.
- The runner as currently drafted uses `online` / `focus` / `visibilitychange` / **30s**. That 30s was drift on my part, not a decision — see §1.

## 1. Sync queue

`src/lib/eld/offline/queue/` — `types.ts`, `store.ts` (Dexie only), `runner.ts` (the only Supabase importer), `handlers.ts`.

Dexie **v3, additive**: `sync_queue: 'id, status, next_attempt_at, kind, created_at'` plus `merged_packets`. Entry carries `id` (uuid, also the idempotency key), `kind`, `payload`, `depends_on`, `attempts`, `next_attempt_at`, `status`, `last_error`, `last_error_class`, `client_timestamp`. `payload` holds byte-store keys only — runtime assert plus a test rejecting any payload over 2 KB.

- Eligibility: `pending`, due, and every prerequisite `succeeded`.
- **Triggers: `online`, `visibilitychange`, `focus`, and a 60s interval.** The interval reverts to 60s: the queue is not latency-sensitive — the roadside packet is already local and nothing waits on a sync — and a pass wakes the radio on a phone that is often on marginal signal in a cab. `online` and `visibilitychange` cover every moment that matters; the interval is only a backstop.
- **`focus` is kept but treated as redundant, not additive.** It fires together with `visibilitychange` on most mobile returns, so it must not be able to start a second pass.
- **Trigger coalescing, explicit:** the runner never starts a pass while one is in flight (self-serialising, already the case), and **a pass requested within 5 seconds of a completed pass is skipped**. A phone regaining signal and foreground at the same instant otherwise fires three near-simultaneous passes. Test: dispatch `online` + `visibilitychange` + `focus` in the same tick and assert exactly one drain.
- Backoff 5s/15s/45s/2m/5m/15m, then 15m.
- `classifyError(err)` → `network` retried forever; `server` 8 attempts then `failed`; `rejected` never retried. **Never parses constraint names** — the server hands back distinct named errors.
- Deterministic upload paths + upsert. `succeeded` purges at 7 days; `rejected`/`failed` persist.
- `SyncStatusChip` on the driver ELD/RODS surface, never blocking.

## 2. `ensureDayCached(rods_day_id)`

New `src/lib/eld/offline/ensureDayCached.ts`, absorbing Pass A's generate-on-read from `hydrate.ts`. Keyed days: `rods_days_cache` + `rods_events_cache` in **one Dexie transaction**, then `rods_pdfs` (rendered via `renderRodsDay` when absent), then the signature image. ELD-document days: `rods_documents` bytes with the Pass A renderability probe and JPEG re-encode. Callers: certification, hydration, manifest rebuild.

## 3. Offline certification

Flow in `RodsView`/`useRodsDay`: full client validation → signature + typed name → `renderRodsDay` from the day row's frozen carrier fields → **structured cache write in one transaction with `status = 'certified'`** → `rods_pdfs` + `signature_images` (`origin: 'local_pending_upload'`) → record `local_certified_at`, `certified_legal_name`, `certified_device_info`, `certification_token` → enqueue `upload_rods_pdf` + `upload_signature`, then `certify_rods_day` depending on both → rebuild manifest → "Save a copy to your phone."

Driver label "Certified — signed on this device, syncing"; **officer-facing label is always plain "Certified"**.

### Migration — tokened, disambiguated certification

- `rods_days.certification_token uuid` with unique index `rods_days_certification_token_key`.
- `certify_rods_day` gains **`p_certification_token uuid`, required, no default**. The **online path passes it too**, so there is one certification code path and online retries are idempotent for free.
- Token handling **before** validation:
  - Token already present on **this** `_day_id` → return that row as a no-op.
  - Token present on a **different** day → `RAISE EXCEPTION` `rods_token_day_mismatch`.
- Race handling via `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` so **no raw 23505 reaches the client**:
  - `rods_days_certification_token_key` → concurrent replay. Re-read, return the row. Success, no alarm.
  - `rods_days_one_certified_per_date` → genuine duplicate-date conflict. Distinct named exception routed to §4.
- Tests: concurrent replay of one token → one success, zero rejections. Two tokens on one date → exactly one duplicate rejection. Foreign-day token → mismatch exception.

Same required-token pattern for `create_eld_document_day` and `replace_rods_document`. Amend and Replace are hidden offline. Cold start with no cached carrier reuses `CARRIER_CACHE_MISSING_MESSAGE`.

## 4. Rejection

Entry → `rejected`, never auto-discarded; bytes permanently exempt in `prune.ts`; `rods_days_cache` row flagged `sync_rejected` with the server message verbatim; high-priority notice to driver and all Management. The day **stays in the roadside packet labelled "Certified"**, with no officer-facing indicator. The duplicate-date path retains both records and both byte sets, notifies Management, auto-resolves nothing.

## 5. Parity fixtures

`rodsValidationParity.test.ts` — all 17 fixtures against `rodsValidation.ts` and the real `certify_rods_day`. Fixture 17 is encoded as **expected divergence** with rationale in a comment. Standing note: the table grows whenever the guard grows.

## 6. HEIC at upload

`UploadEldLogModal` attempts a canvas JPEG re-encode on selection and stores both — the original stays the record — flagging decode failure. The Pass A decode probe stays.

## 7. Notice-queue migration — drain safely, delete later

`pendingNotice.ts`'s **read path stays this release.**

**Deterministic ids.** Each queue entry id is a v5 uuid over `(malfunction_event_id, kind)`. Before enqueueing, look that id up in `sync_queue` **in any status** and skip if present, so a failed removal or a kill between confirm and remove costs nothing next start.

**Send is conditional, never assumed.** Before enqueueing `send_notice`, read the event's `notice_sent_at` / `notice_uploaded_at`. Four outcomes:

1. **Sent already set** → enqueue only `upload_notice_pdf`, and only if `notice_uploaded_at` is null. No send.
2. **Both set** → nothing to enqueue; remove the localStorage key.
3. **Row unreadable because the device is offline** → defer the whole entry, retry next start. Never send on the assumption it hasn't been sent.
4. **Online, query succeeds, no row** → a third, distinct case. A malfunction event can be created offline, so the event may not exist server-side *yet* (its own queue entry still pending) or may never exist (that entry was lost). **Defer — do not send, do not discard.** `send_notice` is never enqueued for an event that cannot be confirmed to exist; a notice referencing a nonexistent event is unattachable evidence.

**Deferral accounting.** Deferred entries (cases 3 and 4) carry `deferrals` and `first_deferred_at` in the localStorage record. After **5 deferrals or 7 days, whichever comes first**, raise an **orphaned notice** alert to Management carrying the event id and the driver — once, not per start — and **keep the localStorage entry**.

**Order, strictly:** read entry → resolve send/upload state → enqueue (deterministic id, skip if present) → **read back the `sync_queue` row and confirm it persisted** → only then remove the localStorage key.

- Runs on **every app start** until the prefix is empty.
- An entry that fails to parse or base64-decode is **left in place**, logged, raised to Management. Nothing discarded silently.
- `pendingNotice.ts` is deleted in a later release, after telemetry shows zero remaining entries.
- Tests: (a) one valid + one corrupt entry → valid enqueues and its key is removed, corrupt survives with an alert; (b) drain twice without clearing localStorage → exactly one queue entry and one send; (c) event already sent → no `send_notice`; (d) drain offline → deferred, not sent; (e) **event id absent server-side, drain run online → deferral rather than send, and the Management orphaned-notice alert fires exactly once when the threshold is reached.**

## 8. Scoped share tokens — one resolver

New `share_tokens` (`id`, `token`, `resource_type` `binder | eld_malfunction`, `resource_id`, `expires_at`, `revoked_at`, `created_by`, `created_at`) and `share_token_access_log`, both staff/service-role only, resolved by a single SECURITY DEFINER `resolve_share_token(p_token)` that branches on `resource_type` and logs every access.

**The old resolver is retired, not run alongside.** Backfill every `public_share_token` into `share_tokens`; then drop `get_inspection_doc_by_token` or rewrite it to delegate. `/inspect/:token` routes through the new module only. `inspection_documents.public_share_token` becomes legacy read-only immediately (comment plus a write-blocking trigger where practical). Test: revoke a backfilled binder token, assert `/inspect/:token` returns 404.

`eld_malfunction` scope: 4-hour default TTL; returns the notice plus certified RODS for `discovered_at`'s day and the prior 7, for that operator only, window computed **server-side**. 404 on invalid/expired/revoked, `noindex`, read-only. Management revokes anything; revocation never deletes the row or its log. Re-mint rather than extend.

### Driver mint/revoke from roadside — without weakening the guard

Minting is a synchronous backend call, and the roadside components may not import Supabase. The rule exists so the **boot and render path** never awaits Supabase; a user-initiated tap after render is a different thing. Resolved explicitly:

- Mint and revoke live in `src/lib/eld/share/shareActions.ts`, **outside the `Roadside*` component tree**, reached only by `await import(...)` **inside the tap handler**. Never statically imported.
- `roadsideImportGraph.test.ts` is **narrowed to the boot path**: no Supabase/auth/pdf-lib reachable through **static** imports from `RoadsideEntry.tsx` and its render tree. A second assertion: no `Roadside*` component statically imports `shareActions`.
- A third assertion: the dynamic import is **not awaited during render or in any mount effect** — it appears only inside an event handler.
- `roadsideBundle.test.ts` keeps the production assertion: the roadside entry chunk contains no Supabase; `shareActions` may be its own lazy chunk.
- A comment on both tests states the distinction: **boot must never touch Supabase; a tapped action may, and only after the packet has already rendered.**

EMAIL TO OFFICER needs no exception — merge and enqueue are Dexie-only; `runner.ts` does the network work later.

### Where the limits live, and how each one fails

**Per-IP — edge function, fails OPEN.** A SECURITY DEFINER function has no reliable view of client IP. When the ad-hoc counter cannot be read or written: **allow the request** and log loudly to Management's alerting. A legitimate roadside share 404ing because a counter was down is worse than an unthrottled window on a 4-hour token, and the access log still captures abuse.

**Per-token — inside `resolve_share_token`, fails CLOSED.** Counted off `share_token_access_log`. If the log is unwritable the resolution fails — correct, because an unlogged compliance-document fetch is not something to serve.

Each limiter carries a comment stating its fail mode and reasoning.

## 9. Officer email — client-side merge

`src/lib/eld/mergeOfficerPacket.ts` assembles from cache: cover page, notice, then 8 days newest-first with the order stated on the cover. The cover carries carrier identity **from `local_meta`**, driver and truck, the manual-RODS heading and 79 FR 39342 sub-line, the malfunction summary, every date with its record type, **every uncertified or unavailable date disclosed**, and any separately attached file. Keyed days embed existing `rods_pdfs` bytes — the native render is never rasterised. Past ~15 MB, embedded images downsample progressively; size logged; days never dropped.

The edge function is sender only. Offline: merge and cache immediately, queue `upload_merged_packet` → `send_officer_email`, and tell the driver it sends on reconnect **and that PRINT works now**.

## Guardrails

`/roadside`'s **boot path** keeps zero Supabase and zero pdf-lib; the only backend reach from that screen is the lazily imported `shareActions`, invoked from a tap. The queue's Supabase surface is confined to `runner.ts` and `handlers.ts`. No HOS calculation, no second geometry/header/label source, no live `carrier_profile` read in any creation path or renderer, no ELD/e-log self-description.

## Delivery order

Migrations (tokened certification → `create_eld_document_day` → share tokens + backfill + old-resolver retirement) → queue store and runner (including the 60s interval and trigger coalescing) → `ensureDayCached` → offline certification → rejection path → notice drain → parity fixtures → HEIC → share-token scope and roadside action module → officer merge → acceptance sweep.
