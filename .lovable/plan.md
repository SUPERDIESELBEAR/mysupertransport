## Context carried into this thread

Seeded from the Open Items Register, `docs/database-security-conventions.md`, and `docs/eld-offline-certification.md`: the eight standing rules, shipped-vs-scaffolding split, the open list, and AC-1 through AC-5.

Two items, strictly in order. Item 2 does not start until item 1 reports.

---

## Item 1 — Finish the case (a) trace, then re-run (b)–(f)

### 1.1 Rebuild the harness

`/tmp/browser/rods-certify/` is wiped between sessions. Rebuild `common.py` with: preview-session minting, sign-in as the demo driver, header/segment fill helpers, and `purge_seeded()` driving the `purge-rods-day` edge function (`dayIds`, `reason` ≥ 12 chars) with the fixpoint loop.

**The ELD-tab visit is not part of the default setup.** Hydrating the cache before every case bakes the defect into the test rig and gives every case a cache a real driver going straight to Logs would not have. It stays available as an explicit opt-in helper, called only by cases that genuinely need a hydrated cache, and the report names which cases invoked it.

If any of (a)–(f) turns out to require the ELD-tab visit to pass, that is stated explicitly in the report: it means the case cannot currently be reached by a driver taking the direct route.

### 1.2 Case (g) — direct route to Paper Logs

New case, no ELD-tab visit: sign in, navigate straight to Paper Logs, and record exactly what the driver sees — screenshot, any blocking copy ("carrier details have not been downloaded"), whether a draft can be created at all, and the state of `rods_days_cache` / `rods_events_cache` at that moment. This is the real-world path and its output is evidence for 2c, not a setup step to work around.

### 1.3 Case (a) — make the race actually happen

The prior run is not evidence. The certify RPC went out 3.5s after the final keystroke, so the 700 ms debounce fired naturally; the persisted value proves the ordinary path, not the flush fix.

- **Log header PATCH bodies.** Capture `request.post_data` for every `PATCH /rods_days`, so the report names which write carried the final value rather than inferring it from the end state.
- **One clock.** Keystroke timestamp and certify-request timestamp come from the same source. A 0.02 ms gap between an in-page `performance.now()` and a network trace timestamp is a measurement artifact and will not be reported as an ordering.
- **Certify tap inside 700 ms.** Either a single `page.evaluate` dispatching the final keystroke and the certify tap in one task, or `page.clock` to hold the debounce open. If neither lands the tap inside the window, the case is reported **INCONCLUSIVE**. The bound is not loosened.

Pass condition: a header PATCH carrying the final value is issued between the last keystroke and the certify RPC, on one clock, with the tap inside 700 ms.

### 1.4 Cases (b)–(f)

Unverified, not still green — `certify()` changed underneath them (`replayed` flag, orphan delete, preflight tripwire). (f) has never passed.

- (b) offline at certify — halts, toast, row stays draft
- (c) backgrounding — `visibilitychange` and `pagehide` each flush; Chromium only, iOS Safari stays on the hardware checklist
- (d) lost write — server mismatch opens `CertifyMismatchDialog`
- (e) out-of-band edit — mismatch dialog; Cancel preserves on-screen state
- (f) replay — deterministic 504 fulfillment, poll the row to `certified`, release the second tap; assert `replayed: true`, `pdf_path` and `certification_signature_path` unchanged from attempt one, the second attempt's uploads deleted, replay toast shown

### 1.5 Cleanup, every case

Purge in a `finally` through `purge-rods-day` with the fixpoint loop. After the run, confirm 0 rows in `rods_days`, `rods_events`, `rods_amendments`, `eld_malfunction_events` for the demo operator, and that every new `rods_day_purged` reads `completed` or `not_applicable`. A surviving `pending_caller` is reported as a finding.

If (a)–(e) fail, report before fixing. If (f) fails, fix it.

---

## Item 2 — Step 2 inventory (no code changes; output is a written gap list)

### 2a. What fails offline
Drafting, editing, caching, queueing, replay: what works, what silently no-ops, and where the seams sit between the offline store and `certify_rods_day`.

### 2b. What exists with no live caller
For each: confirm genuinely unreached by tracing callers, note what wiring it implies, and flag it if step 3 will invoke it for the first time (Standing Rule 8 — driven through the real UI, not assumed correct). Unreached code needs wiring rather than building, and having never executed it may also simply be wrong.

- Seven of ten `SyncKind` handlers
- `ensureDayCached`'s LOCAL-WINS certification branch
- `hydrate.ts`'s `certification_rejected` path
- `row_not_writable` routing inside the queue
- `enqueueCertifyDay`

### 2c. AC-1 through AC-5 — satisfiable or not

Per criterion: satisfiable with the current architecture, or dependent on something not yet present.

AC-3 gets the depth. Its offline preflight compares against `rods_days_cache` / `rods_events_cache`, so it needs the local cache authoritative **and current at certify time**. The report answers:

- What populates those two caches, from where, and at what moment.
- Whether coverage extends to every certifiable day — including days outside the roadside window a driver may open offline.
- Whether the cache is refreshed on draft edits, or only at hydration. If it reflects the day as of last sync, the preflight flags every legitimate offline edit as a mismatch, which makes AC-3 **unusable** rather than merely unimplemented. That distinction is the headline of 2c.

Evidence folded in: case (g)'s observed direct-route behaviour, plus the caller trace showing `hydrateRoadsideCache` reaches the app only through `useRoadsideHydration`, mounted only by `ELDMalfunctionView`. Likely a one-line fix — hoist the hydration call to a shared operator layout — but **not fixed before the inventory**; what it reveals about population timing is worth more right now than the fix.

---

## Technical notes

- Harness lives under `/tmp/browser/rods-certify/`; screenshots under its `screenshots/`. Nothing written into the project checkout.
- Chromium headless, viewport 1280×1800, no `full_page` screenshots.
- Preview session restored via the injected managed session before navigating to any authenticated route.
- Item 2 is read-only: file reads, caller traces, and read-only database queries. No migrations, no edits.
