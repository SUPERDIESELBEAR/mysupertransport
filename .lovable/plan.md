## Verification of the two gaps (unchanged, confirmed against the code)

**`ensureDayCached` is on the hydration path but is not the only writer.** It has exactly one non-test caller, `hydrate.ts:277`, so the named exposure does route through it. But `rods_events_cache` is written from three places, all via `putCachedEvents` (`cache.ts:81`): `ensureDayCached.ts:137` (hydration), `commitCertification.ts:156` (local certification, which does **not** go through `ensureDayCached`), and `cache.ts:99` (the re-put inside `markDaySynced`). The guard belongs at `putCachedEvents`.

**Provenance cannot be inferred.** `PutCachedEventsInput` carries only `rods_day_id`, `log_date`, `events`, `unsynced`, `version`, `cached_at`; `unsynced` does not stand in for the caller, since `markDaySynced` re-puts hydration-sourced rows. It also has no `status`, so it cannot tell a certified day from a draft. Both get passed in.

## Plan

### 1. New alert kind

`certified_day_no_segments` in `SyncAlertKind` (`src/lib/eld/offline/queue/alerts.ts`) — a certified day cached with an empty segment set. Distinct from `certified_day_divergence`: one copy, structurally unable to render.

### 2. Guard at `putCachedEvents`

Two new **required** fields on `PutCachedEventsInput`:

- `provenance: 'hydration' | 'local_certification' | 'sync_flag_clear'`
- `day_status: RodsDay['status']`

Required, not optional — a new writer must state both rather than defaulting into silence. Call sites: `ensureDayCached` passes `'hydration'` and `day.status`; `commitCertification` passes `'local_certification'` and the status it just wrote; `markDaySynced` passes `'sync_flag_clear'` and `existing.day.status`, which it already has loaded.

Condition: `day_status === 'certified' && events.length === 0`.

### 3. The condition is a return value, not module state

`putCachedEvents` returns `{ record, emptySegments }`, where `emptySegments` is `null` or a keys-only descriptor (`rods_day_id`, `log_date`, `provenance`). It stores nothing. `flushEmptySegmentAlerts(detected)` takes that value as an argument and raises through `raiseSyncAlert`, tolerating `null` so callers need no branch.

This is what makes it correct under the two failure modes:

- **Aborted transaction:** the value lives in the caller's local variable inside the transaction callback. If the transaction throws, the exception propagates and the flush line after it never runs — the value is discarded with the frame. Nothing survives to be raised for a write that did not happen.
- **Concurrency:** hydration and a certification each hold their own value. Neither can drain the other's, and no completion can be misattributed.

Raising still happens **after** the commit, because the caller's flush call sits after its `roadsideDb.transaction(...)`: `raiseSyncAlert` writes to `sync_queue`, which is outside the cache-table transaction scope, so enqueueing inline would throw inside the transaction and take the cache write with it. `ensureDayCached` and `commitCertification` capture the returned value inside their transaction and flush after; `markDaySynced` flushes at the end (no transaction there).

Coalescing is already keyed `kind:operator:log_date`, so a repeatedly re-hydrated bad day yields one entry.

### 4. Unchanged behaviour

- Not raised from `RoadsideDayView` or `manifestBuild` — the view runs with an officer present and stays read-only.
- `roadside_empty_event_set` stays as the driver-side counter.
- The manifest still marks the day not `cached`/`renderable`/`printable`; the view still shows the "No certified record is stored on this device" tile, never the PDF embed.
- `raiseSyncAlert` never throws and the flush is post-commit, so a failed alert cannot cost the cache write. `alert_delivery_failed` covers a dead alert path.

### 5. Tests

In `src/lib/eld/offline/__tests__/emptyEventSet.test.tsx`:

- hydration writes certified + `events: []` → one `raise_sync_alert` entry, kind `certified_day_no_segments`, provenance `hydration`
- **local certification** commits certified + `events: []` → alert with provenance `local_certification` (the case the earlier design would have missed)
- certified + non-empty events → no alert
- **draft** + `events: []` → no alert
- **aborted transaction:** `putCachedEvents` runs with the empty certified set, then the transaction throws → no alert queued, no cached rows
- **interleaved callers:** a certification's flush raises only its own descriptor while a hydration's value is still in flight
- alert enqueue rejects → cached day and event rows intact, `undeliverableAlertCount()` is 1

### 6. Register update

Run B section of `docs/eld-certification-playwright-run.md`: the condition now alerts rather than only counting; the reasoning (unreachable through `certify_rods_day`, which raises `P0023` for a keyed day that does not tile 1440 minutes, so any occurrence means something bypassed it); the two live paths that could produce it — a direct insert against `rods_days`, or a server-side event delete against a certified day; that the guard sits at `putCachedEvents` because three writers reach the event cache; and that the detection is call-scoped rather than module state, with the abort and concurrency reasons recorded so it is not "simplified" back later.

## Technical notes

- `alerts.ts` is Dexie-only, so importing it into `cache.ts` keeps `/roadside` free of Supabase.
- Changing `putCachedEvents` to return `{ record, emptySegments }` touches its three call sites; none currently use the returned record except `markDaySynced`'s spread, which is unaffected.
- No migration. `raise_sync_alert` takes the kind as text.
- Adding required fields to `PutCachedEventsInput` is a compile-time break for any other writer, which is the intent.
