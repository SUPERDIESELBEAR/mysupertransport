# Step 3 — Local-first drafts, then offline certification (rev 8)

## Corrections accepted

### 1. `'upsert-day'` fallback writes the full window; out-of-window certifications don't touch the manifest

Correct on both counts.

**No existing manifest.** A single-day manifest is concealment by omission — an officer sees one day and no indication seven others exist. Stage 3 §10.2 requires gaps shown honestly. The window needs no server data: `local_meta.home_terminal_timezone` (already read by this path) plus the current date, through the existing `windowDatesInTimezone()`. So the fallback enumerates all eight dates, fills in the day being certified from the cache, and marks the other seven `label: 'Not certified'`, `cached: false`, `renderable: false`, `printable: false` — the same shape hydration produces, with less filled in.

If `local_meta` is missing entirely, the timezone is unknown, no honest window can be computed, and `'upsert-day'` writes no manifest at all rather than guessing with the device timezone. The certification still completes; the packet stays as it was. (In practice unreachable — `requireCachedCarrier()` gates day creation — but it is defined rather than left to chance.)

**Out-of-window dates.** `'upsert-day'` no-ops on the manifest when `logDate` is not in `windowDatesInTimezone(tz)`. A three-week-old draft signed today still certifies, uploads its bytes and gets `local_certified_at`; it simply doesn't join a packet defined as current day plus prior seven. Hydration's `'full'` mode remains the only thing that sets window boundaries.

Neither mode may downgrade an entry outside its authority: `'full'` owns the whole window and may downgrade; `'upsert-day'` only ever adds or updates one in-window date and writes every other entry back byte-identical.

### 2. Case (h) asserts happens-before, not a total order

Correct — the total order is wrong about the queue's own design. Table writes run serially, byte uploads run in a concurrency-3 pool, and uploads carry no dependency on the draft entries, so `upload_signature` completing before `save_draft_day` is legitimate behaviour that the literal sequence would fail.

Case (h) asserts exactly what `depends_on` guarantees, from recorded completion timestamps:

- `save_draft_day` before `save_draft_segments`
- `save_draft_day` before `certify_rods_day`
- `save_draft_segments` before `certify_rods_day`
- `upload_signature` before `certify_rods_day`
- `upload_rods_pdf` before `certify_rods_day`
- uploads unordered relative to drafts — explicitly not asserted

---

## Build order

**3.1 — Hydration in the shell.** `RoadsideHydrationMount` beside `SyncRunnerMount` under the same `{user ? … : null}` guard, dynamically importing `hydrate.ts`; role-gated; mount / `online` / `visibilitychange` with a `carrier_cached_at` freshness gate. Removed from `ELDMalfunctionView`.

**3.2 — Local-first drafts.** Client `crypto.randomUUID()` day ids behind `requireCachedCarrier()`; every edit writes complete on-screen state to Dexie in one awaited transaction, bumps `version`, sets `unsynced`, enqueues a coalescing entry, kicks `void drainQueue()`. A rejected Dexie write throws the terminal *"This log could not be saved to the phone, so it cannot be certified yet."* Coalescing: `pending` → replace in place; `in_flight` / `failed` → enqueue behind with `depends_on`; `rejected` → do not enqueue, cancel the day's drafts and cascade.

**3.3 — Dependency integrity.** Transitive cancellation cascade; `purgeSucceeded` retains succeeded entries still referenced by a non-terminal `depends_on`; `resolveBlocked` gives budget-exhausted and cancelled chains one terminal outcome and one alert.

**3.4 — Cache-field integrity.** `putCachedDay` / `putCachedEvents` require `unsynced`, `version`, `local_certified_at`, `sync_rejected`, `sync_stalled`; raw `.put` banned via ESLint `no-restricted-syntax`.

**3.5 — Offline certify, lock last.** Preflight → render and cache signature (`origin: 'local_pending_upload'`), PDF, rows → one awaited Dexie transaction → `void drainQueue()`. The transaction opens `rw` on every store the nested manifest build touches — `rods_days_cache`, `rods_events_cache`, `rods_pdfs`, `rods_documents`, `signature_images`, `local_meta`, `divergences`, `roadside_manifest`, and the queue stores — since Dexie requires the nested scope to be a subset. Order inside: `local_certified_at` + version bump, **then** `buildManifest({ mode: 'upsert-day' })`, **then** the enqueues.

First production invocation of `enqueueCertifyDay`, both upload handlers, the certify handler and its `replayed` branch, `cacheReturnedDay`, `deleteReplayOrphans`, the certification SQLSTATEs, `depends_on` gating, the cascade, and both draft kinds.

**3.6 — The signed-but-unsynced window.** `locked = day.locked || !!cacheEntry.local_certified_at`; `patchHeader` and the segment save refuse in the write path.

**3.7 — Cold-start message, three states.** Never hydrated + online → fetch-now; never hydrated + offline → connect once first; hydrated + incomplete carrier → name the missing fields.

**3.8 — *(cut)*** the unreachable offline branch of `CertifyMismatchDialog`.

**3.9 — `manifestBuild.ts`.** Two modes in the signature — `{ mode: 'full', dates, serverDays }` and `{ mode: 'upsert-day', logDate }` — no Supabase import (hydration passes its rows in), consumed by both callers. `pruneRoadsideCache` runs after `'full'` only. `printable` is set for keyed days (a `rods_pdfs` entry exists) and for `eld_document` days (`!!doc`, independent of `renderable`); every consumer reads `printable ?? cached`, including `RoadsidePacket.tsx:252` and the email-merge and download paths.

**3.10 — Resolution paths.** Driver-initiated authorized unlock as primary, server directives as the assist; the unlock clears `local_certified_at`, cancels the whole terminal chain with `cancelled_by: 'authorized_unlock'`, clears `sync_stalled` / `sync_rejected`, and records the cancelled ids and their states in the audit entry — all in one transaction. Rejected keeps the lock, the bytes and the packet entry.

**3.11 — Verification.**
- `bun run build`, then `roadsideBundle.test.ts` with `dist/` present, plus the extended `roadsideImportGraph.test.ts`.
- Unit: `'upsert-day'` leaves untouched entries byte-identical and never downgrades, including when the cache is emptier than the manifest; **`'upsert-day'` with no manifest writes all eight dates with seven "Not certified"**; **`'upsert-day'` no-ops for an out-of-window date while the certification still completes**; `'upsert-day'` with no `local_meta` writes nothing; `'full'` may downgrade; the certify transaction declares every nested store; `local_certified_at` is visible to the build (asserted by inspecting the cache row the stubbed build receives, so a reorder fails the test); `printable ?? cached` on a manifest lacking the field; `printable` for an `eld_document` day with an undecodable PDF; both prune exemptions, including that the offline signature is written with `origin: 'local_pending_upload'`; coalescing across all four states; transitive cascade; `purgeSucceeded` retention; version-aware clear; `putCachedDay` preserves all five required fields; unlock cancels the chain and records the ids.
- Playwright (a)–(g) re-run without the ELD-tab workaround, purging in `finally`.
- **(h)** offline end-to-end: the five happens-before relationships above from recorded completion timestamps, uploads deliberately unordered against drafts; one certified server row whose id matches the client uuid; and before reconnecting, /roadside shows the day Certified with the native `RoadsideDayRender` SVG drawn — grid and signature, no native fallback logged — **and the other seven days present with their prior labels.**
- **(i)** coalescing under `in_flight`; later value wins, neither payload lost.
- **(j)** signed-but-unsynced: certify offline, reload, read-only, no draft enqueued.
- **(k)** render failure before the lock: day still an editable draft, no `local_certified_at`, empty queue.
- iOS Safari hardware check for case (c) stays outstanding.

## Confirmed, unchanged

`prune.ts:32-35` skips `rods_pdfs` with `uploaded: false` at any age; `prune.ts:59-64` exempts `signature_images` with `origin === 'local_pending_upload'`. The signature exemption keys on `origin`, not `uploaded` — hence the explicit write-site assertion in 3.11. Neither manifest mode prunes.

## Out of scope

Deleting the unused kinds — `create_eld_document_day`, `replace_rods_document`, `upload_merged_packet`, `send_officer_email`. Separate cleanup.
