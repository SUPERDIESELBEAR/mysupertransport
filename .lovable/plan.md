# Stage 3, Pass B — Write Path

## Verified current state (read this turn)

- `pending_mutations` exists in Dexie v1 with an **auto-increment `++id`** primary key. Pass B needs a client-generated uuid id, and the additive-only Dexie rule forbids redefining a primary key — so Pass B adds a **new store `sync_queue`** (v3) and leaves `pending_mutations` untouched and unused until a later version can remove it. No bytes discarded.
- `certify_rods_day(_day_id, _legal_name, _signature_path, _pdf_path, _device_info)` — SECURITY DEFINER, tiling + 12-field §395.8 header guard, `total_mileage_today` deliberately excluded. No token parameter.
- `rods_days` has `main_office_address`, `home_terminal_timezone`, `period_start_time`; **no `certification_token`**. Partial unique index `rods_days_one_certified_per_date` exists.
- `replace_rods_document` exists. **`create_eld_document_day` does not** — eld_document days are created by a direct insert in `UploadEldLogModal`.
- Binder share tokens are **not a reusable primitive**: `inspection_documents.public_share_token uuid` per row, resolved by `get_inspection_doc_by_token`, with **no expiry, no revocation, no access log**.
- Stage 1 notice retry is `pendingNotice.ts` on **localStorage base64**, driven from `useEldMalfunction`, the wizard and the dashboard.
- `CertifyDayModal` is presentational; the certify call lives in `RodsView`/`useRodsDay`.

## 1. Sync queue

`src/lib/eld/offline/queue/` — `types.ts`, `store.ts` (Dexie only), `runner.ts` (the only Supabase importer), `handlers/*`.

Dexie **v3, additive**: `sync_queue: 'id, status, next_attempt_at, kind, created_at'` plus `merged_packets`. Entry carries `id` (uuid, also the idempotency key), `kind`, `payload`, `depends_on` (uuid[]), `attempts`, `next_attempt_at`, `status`, `last_error`, `last_error_class`, `client_timestamp`. `payload` holds byte-store keys only — runtime assert plus a test rejecting any payload over 2 KB.

- Eligibility: `pending`, due, and every prerequisite `succeeded`.
- RPC handlers run serially in `client_timestamp` order; byte uploads through a concurrency-3 pool. Triggers: `online`, `visibilitychange`, 60s interval. No Background Sync.
- Backoff 5s/15s/45s/2m/5m/15m, then 15m.
- `classifyError(err)` → `network` (fetch reject, timeout, 5xx, 429) retried forever; `server` (other 4xx) 8 attempts then `failed`; `rejected` (named server exceptions) never retried. **`classifyError` never parses constraint names** — the server hands back distinct named errors and the runner routes on those.
- Deterministic upload paths + upsert. `succeeded` purges at 7 days; `rejected`/`failed` persist.
- `SyncStatusChip` on the driver ELD/RODS surface, never blocking.

## 2. `ensureDayCached(rods_day_id)`

New `src/lib/eld/offline/ensureDayCached.ts`, absorbing Pass A's generate-on-read from `hydrate.ts`. Keyed days: `rods_days_cache` + `rods_events_cache` in **one Dexie transaction**, then `rods_pdfs` (rendered via `renderRodsDay` when absent), then the signature image. ELD-document days: `rods_documents` bytes with the Pass A renderability probe and JPEG re-encode. Callers: certification, hydration, manifest rebuild.

## 3. Offline certification

Flow in `RodsView`/`useRodsDay`: full client validation → signature + typed name → `renderRodsDay` from the day row's frozen carrier fields → **structured cache write in one transaction with `status = 'certified'`** → `rods_pdfs` + `signature_images` (`origin: 'local_pending_upload'`) → record `local_certified_at`, `certified_legal_name`, `certified_device_info`, `certification_token` → enqueue `upload_rods_pdf` + `upload_signature`, then `certify_rods_day` depending on both → rebuild manifest → "Save a copy to your phone."

Driver label "Certified — signed on this device, syncing"; **officer-facing label is always plain "Certified"**.

### Migration — tokened, disambiguated certification

- `rods_days.certification_token uuid` with unique index `rods_days_certification_token_key`.
- `certify_rods_day` gains **`p_certification_token uuid` as a required parameter — no default**. The **online path passes it too**, so there is exactly one certification code path and online retries are idempotent for free.
- Token handling **before** validation:
  - Token already present on **this** `_day_id` → return that row as a no-op, even if the day would now fail an unrelated check.
  - Token already present on a **different** day → `RAISE EXCEPTION` with a distinct named message (`rods_token_day_mismatch`). This is a client bug; returning another day's row would be a wrong federal record.
- Race handling via `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` so **no raw 23505 ever reaches the client**:
  - `rods_days_certification_token_key` → a concurrent replay of the same certification. Re-read and return the existing row. Success, no alarm.
  - `rods_days_one_certified_per_date` → genuine duplicate-date conflict. `RAISE EXCEPTION` with a distinct named message the runner routes to the duplicate path in §4.
- Tests: concurrent replay of one token → one success, zero rejections. Two tokens on the same date → exactly one duplicate rejection. Token presented against a foreign day → mismatch exception, no row returned.

Same required-token pattern for the new `create_eld_document_day` and for `replace_rods_document`.

Amend and Replace are hidden offline. Cold start with no cached carrier reuses `CARRIER_CACHE_MISSING_MESSAGE`.

## 4. Rejection

Entry → `rejected`, never auto-discarded; bytes permanently exempt in `prune.ts`; `rods_days_cache` row flagged `sync_rejected` with the server message verbatim; high-priority notice to the driver and to all Management. The day **stays in the roadside packet labelled "Certified"**, with no officer-facing indicator.

The duplicate-date path retains both records and both byte sets, notifies Management, and auto-resolves nothing. Replays and token races never reach this path.

## 5. Parity fixtures

`src/lib/eld/__tests__/rodsValidationParity.test.ts` — all 17 fixtures run against `rodsValidation.ts` and against the real `certify_rods_day` (integration variant; the SQL guard is the authority). Fixture 17 is encoded as **expected divergence** with the rationale in a comment: forcing `total_mileage_today` into the server guard makes a driver uncertifiable, and therefore undispatchable, over an odometer reading. Standing note: the table grows whenever the guard grows.

## 6. HEIC at upload

`UploadEldLogModal` attempts a canvas JPEG re-encode on selection and stores both — the original stays the record — flagging decode failure. The Pass A decode probe stays; existing Storage objects are still HEIC.

## 7. Notice-queue migration — drain safely, delete later

`pendingNotice.ts`'s **read path stays this release.** A driver may be holding an unsent 395.34(a)(1) notice right now, and deleting the module alongside a one-shot drain orphans it if the drain half-completes.

**Deterministic ids.** Each queue entry id is derived from the localStorage entry — a v5 uuid over `(malfunction_event_id, kind)`, or an equivalent stable hash — so re-enqueueing the same entry collides with the existing row instead of creating a second one. Before enqueueing, look up that id in `sync_queue` **in any status** and skip if present. A removal that fails, or an app killed between confirm and remove, therefore costs nothing on the next start.

**Send is conditional, never assumed.** The old `pendingNotice.ts` retried both upload and send, so an entry can survive a *successful* send. Before enqueueing `send_notice`, read the malfunction event's sent/uploaded timestamps (`notice_sent_at` / `notice_uploaded_at`, exact column names confirmed against `eld_malfunction_events` at implementation):

- Sent timestamp already set → enqueue only `upload_notice_pdf`, and only if the upload timestamp is null. No send.
- Both already set → nothing to enqueue; remove the localStorage key.
- **Event row unreadable because the device is offline → defer the entire entry.** Leave it in localStorage, retry next start. Never send on the assumption it hasn't been sent — a duplicate notice with an earlier timestamp muddies the carrier's record of when the 8-day clock started.

**Order, strictly:** read entry → resolve send/upload state → enqueue (deterministic id, skip if present) → **read back the `sync_queue` row and confirm it persisted** → only then remove the localStorage key.

- Runs on **every app start** until the prefix is empty, not once.
- An entry that fails to parse or base64-decode is **left in place**, logged, and raised to Management. Nothing is ever discarded silently.
- `pendingNotice.ts` is deleted in a later release, after telemetry shows zero remaining entries.
- Tests: (a) seed one valid and one corrupt entry, run the drain, assert the valid one enqueues and its key is removed and the corrupt one survives with an alert; (b) run the drain **twice without clearing localStorage between runs** and assert exactly one queue entry and one send; (c) seed an entry whose event already has a sent timestamp and assert no `send_notice` is enqueued; (d) run the drain offline and assert the entry is deferred, not sent.

## 8. Scoped share tokens — one resolver

New `share_tokens` (`id`, `token`, `resource_type` `binder | eld_malfunction`, `resource_id`, `expires_at` nullable, `revoked_at`, `created_by`, `created_at`) and `share_token_access_log`, both staff/service-role only, resolved by a single SECURITY DEFINER `resolve_share_token(p_token)` that branches on `resource_type` and logs every access.

**The old resolver is retired, not run alongside.** If `get_inspection_doc_by_token` stays live while `share_tokens` gains revocation, a revoked token still resolves and the UI reports a revocation that did not revoke.

- Backfill every existing `public_share_token` into `share_tokens` with `expires_at = NULL`, preserving today's non-expiring behaviour for stickers already in trucks.
- Then **drop `get_inspection_doc_by_token`, or rewrite it as a thin delegate to `resolve_share_token`**. Exactly one resolution path.
- `/inspect/:token` routes through the new module only.
- `inspection_documents.public_share_token` becomes **legacy read-only immediately**: column comment plus a trigger rejecting writes. All minting goes through `share_tokens`.
- Test: revoke a backfilled binder token and assert `/inspect/:token` returns 404.

`eld_malfunction` scope: 4-hour default TTL; returns the notice plus certified RODS for `discovered_at`'s day and the prior 7, for that operator only, with the window computed **server-side**. eld_document days return `source_document_path`; keyed days return the Storage PDF. 404 on invalid/expired/revoked, `noindex`, read-only. Drivers revoke from roadside, Management revokes anything; revocation never deletes the row or its log. Re-mint rather than extend; each mint logged.

### Where the limits live, and how each one fails

The two limiters live in different places and **fail in opposite directions on purpose**. Each gets a comment above it stating its fail mode and the reasoning, so the asymmetry is legible to the next reader rather than looking like an oversight.

**Per-IP — edge function, fails OPEN.** A SECURITY DEFINER function has no reliable view of client IP, so per-IP limiting sits in the edge function in front of the RPC. The backend has no standard rate-limiting primitive, so this is an ad-hoc counter with its own failure modes (storage unavailable, cold-start error). When the counter cannot be read or written: **allow the request** and log the failure loudly to Management's alerting. A legitimate roadside share 404ing because a counter was down is worse than an unthrottled window on a token that expires in 4 hours, and `share_token_access_log` still captures abuse for after-the-fact review.

**Per-token — inside `resolve_share_token`, fails CLOSED.** Counted off `share_token_access_log`, which the RPC already writes. If that log is unwritable the whole resolution fails — which is correct: at that point nothing is being logged, and an unlogged compliance-document fetch is not something to serve.

## 9. Officer email — client-side merge

`src/lib/eld/mergeOfficerPacket.ts` assembles from cache: cover page, notice, then 8 days newest-first with the order stated on the cover. The cover carries carrier identity **from `local_meta`**, driver and truck, the manual-RODS heading and 79 FR 39342 sub-line, the malfunction summary, every date with its record type, **every uncertified or unavailable date disclosed**, and any separately attached file. Keyed days embed the existing `rods_pdfs` bytes — the native render is never rasterised. Past ~15 MB, embedded images downsample progressively; final size logged; days are never dropped.

The edge function is sender only. The merged packet uploads to `rods-logs` under the event with recipient, timestamp, size and included dates. Offline: merge and cache immediately, queue `upload_merged_packet` → `send_officer_email`, and tell the driver it sends on reconnect **and that PRINT works now**.

## Guardrails

`/roadside` keeps zero Supabase and zero pdf-lib in its import graph — the queue's Supabase surface is confined to `runner.ts`, and the existing import-graph and bundle tests are the backstop. No HOS calculation, no second geometry/header/label source, no live `carrier_profile` read in any creation path or renderer, no ELD/e-log self-description.

## Delivery order

Migrations (tokened certification with constraint disambiguation → `create_eld_document_day` → share tokens + backfill + old-resolver retirement) → queue store and runner → `ensureDayCached` → offline certification → rejection path → notice drain → parity fixtures → HEIC → share-token scope → officer merge → acceptance sweep.
