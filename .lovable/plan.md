# §7 — Notice-queue migration (revised)

Move ELD malfunction notice delivery (`localStorage` + `flushPendingNotices`) onto the Pass B sync queue. No bytes are ever discarded, and the roadside cold-launch path stays Supabase-free.

## New file: `src/lib/eld/offline/queue/noticeDrain.ts`

Exports `drainPendingNotices(): Promise<NoticeDrainSummary>`. Lives beside `handlers.ts` — it imports the Supabase client, so it is reachable only from the runner, never from `/roadside`.

### Deterministic ids
`noticeSyncId(eventId, kind)` → RFC 4122 **v5** uuid, SHA-1 over a fixed module-level namespace uuid plus `${eventId}:${kind}`, via `crypto.subtle.digest` (no new dependency). Derived from `(malfunction_event_id, kind)` only. Before enqueueing, `getEntry(id)` is checked: **an existing entry in any status** (`pending`, `in_flight`, `succeeded`, `failed`, `rejected`) causes a skip.

### Six branches
Each is a separate `if`/`continue` block with its own counter and its own log message. Nothing is shared between them.

| # | Branch | Condition | Behaviour |
|---|---|---|---|
| 1a | `alreadyDelivered` | row read; `notice_sent_at` **and** `notice_uploaded_at` both set | Nothing enqueued. Bytes exist in Storage, so the key is removed (plus its state key). Log: `notice already delivered and stored` |
| 1b | `uploadOnly` | row read; `notice_sent_at` set, `notice_uploaded_at` **null** | The localStorage copy is the only copy of the 395.34(a)(1) evidence. Enqueue `upload_notice_pdf` (+ `upload_notice_signature` when present) — **not** `send_notice`. Key removed only after read-back. Log: `notice sent but never stored — uploading bytes only` |
| 2 | `migrated` | row read; not sent | Enqueue `upload_notice_pdf`, optional `upload_notice_signature`, and `send_notice`, dependency-ordered. Key removed only after read-back. Log: `migrated notice to sync queue` |
| 3 | `deferredOffline` | entry decodes; event query returned an **error** (offline/network) | Key retained. `deferrals` **not** incremented, `first_deferred_at` **not** stamped — transient, must never accumulate toward the orphan alert. Log: `deferred: event unreadable (network)` |
| 4 | `deferredMissing` | query **succeeded**, `data === null` | Key retained. `deferrals` incremented, `first_deferred_at` stamped on first occurrence. Orphaned-notice alert raised **once** when `deferrals >= 5` **or** `now - first_deferred_at >= 7 days`, guarded by `alerted_missing`. Log: `deferred: event not found on server` |
| 5 | `corrupt` | entry does not decode (bad JSON, missing `eventId`/`operatorId`, undecodable base64) | Key left in place untouched. One alert, guarded by `alerted_corrupt`. Never discarded. Log: `corrupt pending notice left in place` |

Branches 3 and 4 are separated by the shape of the `.maybeSingle()` result — `error != null` → 3, `error == null && data == null` → 4 — never by a thrown error.

### Branch 5 must not touch parsed fields
A corrupt entry may have no parseable `eventId`, so it cannot key state on one. Branch 5:
- keys its flag on the **localStorage key name itself** — `eld_notice_drain_corrupt_<localStorageKey>` — which is always available because the drain iterates over keys;
- includes the localStorage key (never `eventId`) in the alert detail;
- dereferences **no** field it just failed to parse. `eventId`/`operatorId` are read only inside the successful-decode path; the corrupt path receives just the raw key and the decode error.

This avoids `eld_notice_drain_state_undefined`, which would collide across every corrupt entry and silently suppress alerts for all but the first.

### Two separate alert flags
`deferredMissing` and `corrupt` are different alert kinds and must not share suppression:
- `alerted_missing` — in `eld_notice_drain_state_<eventId>` (branch 4, eventId always parsed there).
- `alerted_corrupt` — in `eld_notice_drain_corrupt_<localStorageKey>` (branch 5).

### Byte writes before enqueue (branches 1b and 2)
- PDF → `roadsideDb.notice_pdfs` keyed by `event_id`.
- Signature → `roadsideDb.signature_images` with **`origin: 'local_pending_upload'`** and `uploaded: false`, set explicitly at the write site (never defaulted), so the bytes are exempt from pruning while the upload is outstanding.

### Sibling state key lifecycle
Branches **1a, 1b, and 2** delete `eld_notice_drain_state_<eventId>` in the same step they remove the pending-notice key, so records cannot accumulate and a stale `alerted_missing: true` cannot suppress a legitimate later alert for the same event. The corrupt flag key is removed if that same localStorage key ever decodes successfully on a later pass.

## `src/lib/eld/pendingNotice.ts`
Read path retained unchanged and **not deleted this release**. Only a comment marking `flushPendingNotices` as the legacy path for one release is added.

## Wiring — below the auth guard, on every app start
- **Not** `main.tsx`. `runner.ts` imports the Supabase client, and `main.tsx` is in the entry chunk on every route; mounting there would pull the client and its auth-refresh timer into `/roadside`'s cold launch and regress Pass A criteria 6 and 7 and Pass B criterion 25.
- Mount `startSyncRunner()` and `void drainPendingNotices()` in an effect inside the **authenticated app shell, below the auth guard**. The drain needs a session to query `eld_malfunction_events`.
- The drain also runs from the runner's `online` / `focus` / `visibilitychange` triggers, so it runs on every app start, not once. Idempotent by construction.
- Re-run `roadsideBundle.test.ts` after wiring and confirm the entry chunk still reports zero Supabase references.

## Tests — `src/lib/eld/offline/__tests__/noticeDrain.test.ts` (8)
1. **1a** — both timestamps set → nothing enqueued; pending key and state key both removed.
2. **1b** — sent set, uploaded null → `upload_notice_pdf` (+ signature, `origin: 'local_pending_upload'`) enqueued, **no** `send_notice`; key removed only after read-back.
3. **2** — unsent row → three entries with expected deterministic ids; key removed after read-back; second drain enqueues nothing.
4. **3** — query error → key retained, nothing enqueued, `deferrals` still 0, no alert.
5. **4, count arm** — five successive "no row" drains → alert fires exactly once at the 5th.
6. **4, time arm** — `first_deferred_at` backdated 7 days, `deferrals` at 2 → alert fires once on the next drain.
7. **5, single** — corrupt entry survives with exactly one alert, never removed.
8. **5, collision** — **two distinct corrupt entries** (one bad JSON, one missing `eventId`) in one drain pass → **two** alerts raised, both keys retained, two distinct `eld_notice_drain_corrupt_*` flags written.

## Files touched
- add `src/lib/eld/offline/queue/noticeDrain.ts`
- add `src/lib/eld/offline/__tests__/noticeDrain.test.ts`
- edit `src/lib/eld/offline/queue/runner.ts` (drain from start/trigger path)
- edit the authenticated app shell (`src/App.tsx`, below the auth guard)
- comment-only edit to `src/lib/eld/pendingNotice.ts`

## Verification
- `bunx vitest run src/lib/eld/offline/__tests__/noticeDrain.test.ts`
- `bunx vitest run src/lib/eld/offline/__tests__/roadsideBundle.test.ts src/lib/eld/offline/__tests__/roadsideImportGraph.test.ts` — entry chunk must still be Supabase-free.
- Typecheck.
