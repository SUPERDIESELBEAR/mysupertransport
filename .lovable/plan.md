## Answer to the correction

**You are right, and the same-id hydration replacement is unreachable — (e) gets repointed at the multi-tab path.**

Two reads settle it (`src/lib/eld/offline/hydrate.ts`):

1. `run()` fetches only `.eq('status', 'certified')` rows. Hydration never pulls an uncertified draft into the cache at all, so a draft cache entry cannot be replaced by a hydration pass under any circumstance. The premise of (e)-as-scoped is empty.
2. Even for certified rows, `cacheKeyedDay` returns early on `cached?.local_certified_at || cached?.unsynced`, and when `cached.day.id !== day.id` it routes to `isLegitimateReplacement` → `flagDivergence`, not to a silent overwrite. The only same-id replacement it performs is case 5, which requires `compareKeyedDay` to find zero differing fields — an identical write. An identical write cannot produce a preflight mismatch.

So: hydration produces either no change, an identical write, or a divergence. It never produces the same-id, different-content cache replacement (e) needed.

**Multi-tab is same-id by construction.** `useRodsDay` loads cache-first for uncertified days, so a second tab opening the same date reads the same cached row and inherits the same `day.id` — no new id is minted. Tab B's `patchHeader` writes that id straight to Dexie (immediate write, per the approved change), and Tab A's screen still holds the pre-edit values against an unchanged id. That is exactly a `PreflightMismatchError`, and drivers do leave tabs open.

**Case (e) — stale tab (repointed)**
Two tabs on the same uncertified date. Tab A opens the day and sits idle. Tab B edits one header field (trailer numbers) and its Dexie write lands. Tab A, screen untouched, attempts certification.

Assertions, all required:
- The thrown error is `PreflightMismatchError` specifically — asserted on the error type/name, not on "certification was refused". A `PreflightUnavailableError` here is a **failure** of the case, not a pass.
- `CertifyMismatchDialog` opens and names both values for the changed field: Tab A's screen value and Tab B's cached value.
- Cancel leaves Tab A's screen state byte-identical and nothing certified server-side.
- The cached `day.id` equals the id Tab A is certifying — recorded explicitly, so a future id-minting regression turns this case red instead of silently converting it into an unavailable-path test.

The same type-specific assertion applies to every case that expects a refusal: (d) asserts `PreflightMismatchError`; any case expecting the no-readable-copy path asserts `PreflightUnavailableError`. No case accepts either.

## What gets changed

### 1. Preflight compares screen against Dexie, unconditionally

`src/lib/eld/certifyPreflight.ts`

- Delete the `online` parameter and the `navigator.onLine` branch from `readPersistedDay` / `assertPersistedMatches`; the Supabase import goes with it.
- Persisted copy is always `rods_days_cache` + `rods_events_cache`. No cache entry, or one whose `day.id` differs from the day being certified, stays `PreflightUnavailableError`.
- `PreflightSource` collapses to `'local_cache'`; `PreflightResult` and `PreflightMismatchError` follow. Module header rewritten: the server is downstream of Dexie and never a more current copy of a draft.
- `RodsDayEditor.certify()` drops the `online` argument.
- `certifyPreflight.test.ts` rewritten against the Dexie mock — header mismatch, segment mismatch, blank-vs-null equivalence, missing entry, and differing-`day.id`; the Supabase mock and the "refuses offline" case go.

### 2. `CertifyMismatchDialog` copy

Title *"This log was changed somewhere else"*; body says the change reached this phone but the screen still shows the older version; the footnote says the saved version stored on this phone will load and the on-screen version will be discarded. No "office copy". Diff and the three buttons unchanged.

### 3. Enqueue kicks a drain

- New dependency-free `src/lib/eld/offline/queue/kick.ts`: `setDrainKick(fn)`, `requestDrain(scope)` with `scope: 'draft' | 'chain'`, and a buffered pending request flushed on registration.
- `store.ts`: `enqueue` and `enqueueCoalesced` call `requestDrain()` after the transaction commits, scope derived from `kind`. No new imports beyond `kick.ts`, preserving the no-network rule and `/roadside`'s import graph.
- `runner.ts`: `startSyncRunner` registers the kick. `requestPass(scope)` defers instead of dropping — if a pass is running, set `passRequested` and re-run from `drainQueue`'s `finally`; if inside the scope's window, schedule for its end. `DRAFT_COALESCE_MS = 30_000`, `CHAIN_COALESCE_MS = 5_000`, `INTERVAL_MS` remains the offline-recovery backstop. Rationale recorded in the doc: drafts are durable in Dexie on keystroke and the certify chain `depends_on` them, so ordering holds regardless of drain timing; the chain is where the driver is watching.
- Unit tests for `kick.ts`, buffered-before-registration, and the enqueue-during-running race.

### 4. Case (e) repointed to multi-tab, case (m) added

- **(e)** as described above.
- **(m) — another device already certified this date.** Seed a certified row server-side, drive a local certification, assert the queued `certify_rods_day` reaches a terminal state via P0022 / `row_not_writable` and that both the driver and Management are told. Distinct mechanism from (e); both kept.

## Verification

1. Unit suite (preflight rewrite, `kick.ts`, deferral race).
2. Re-run **(a)** and **(g)**. (a) asserts the certified server row carries the final keystroke, `local_certified_at` is set promptly, and the debounced enqueue firing after the lock produces no `row_not_writable` cancellation.
3. Then **(b)**, **(c)**, **(d)**, repointed **(e)**, **(f)**, **(h)**–**(l)**, **(m)**.
4. `docs/eld-certification-playwright-run.md` and `docs/eld-offline-certification.md` updated with results, Defect B and its running-pass drop window, the (e) repoint plus the hydration finding that forced it, and the two-window coalesce tradeoff.

## Not in this change

Stalled/rejected banner with authorized unlock, and the three-state cold-start copy — next after this pass produces evidence.
