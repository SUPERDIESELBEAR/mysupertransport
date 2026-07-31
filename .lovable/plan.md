## Where this stands

The last several rounds hardened the purge path. That path exists to clean up after tests. The tests verify a fix to certification. Certification's offline capability — item 2 — is the actual deliverable and is still open. This plan spends as little as possible on item 1 and then moves.

Purge status going in: signature compatibility confirmed, zero `pending_caller` audit rows, no cleanup owed. The disposition transition (`pending_caller → completed`) has never actually run, because there is nothing left to purge. The harness run below is its first real exercise.

## Step 1 — Six-case Playwright pass (closes item 1)

Sign into the preview as the demo driver and run cases (a)–(f) against the real driver UI.

Five of the six already passed on the previous run and are being re-run only because the certify path changed underneath them (`replayed` flag, orphan delete, preflight tripwire). Expect them to pass; investigate only if they don't.

- **(a) debounce race** — two header fields keyed inside the 700ms window. Assert on captured timestamps: gap between final keystroke and the `certify_rods_day` request.
- **(b) offline at certify** — halts, toast shown, row stays draft.
- **(c) backgrounding** — `visibilitychange` and `pagehide` each flush. **Chromium only**; iOS Safari stays on the hardware checklist.
- **(d) lost write** — server mismatch opens `CertifyMismatchDialog`.
- **(e) out-of-band edit** — mismatch dialog, Cancel preserves on-screen state.
- **(f) replay** — deterministic 504 fulfillment, poll the row to `certified`, then release the second tap. Assert: `replayed: true`, the row's `pdf_path` and `certification_signature_path` unchanged from attempt one, the second attempt's uploads deleted, replay toast shown.

Every case purges in a `finally` block through the `purge-rods-day` edge function with the fixpoint loop. After the run: RODS tables back to 0 for the demo operator, and every new `rods_day_purged` row reads `completed` or `not_applicable`. A surviving `pending_caller` is a finding, not a cleanup chore.

If (f) fails, fix it. If anything in (a)–(e) fails, report before fixing — that would mean the purge/replay work broke certification.

## Step 2 — Inventory: missing, dead, and the acceptance criteria

No code changes. Output is a written inventory in three parts.

### 2a. What fails offline

Drafting, editing, caching, queueing, replay — what works, what silently no-ops, and where the seams are between the offline store and `certify_rods_day`.

### 2b. What exists with no live caller

The larger part of the problem, and a different kind of work: unreached code needs **wiring**, not building — and because it has never executed, it may also be wrong.

Known members of this category:
- seven of ten `SyncKind` handlers
- `ensureDayCached`'s LOCAL-WINS certification branch
- `hydrate.ts`'s `certification_rejected` path
- `row_not_writable` routing inside the queue
- `enqueueCertifyDay` itself

For each: confirm it is genuinely unreached (not reached by a path I haven't traced), and note what wiring it up implies. **Standing Rule 8 applies at first invocation for all of it.** The inventory explicitly flags every item step 3 will reach for the first time, so those get driven through the real UI rather than assumed correct.

### 2c. Acceptance criteria, satisfiable or not

`docs/eld-offline-certification.md` holds AC-1 through AC-5. For each, report: satisfiable with the current architecture, or dependent on something not yet present.

AC-3 gets particular attention. Its offline preflight compares against `rods_days_cache` / `rods_events_cache`, which requires the local cache to be **authoritative and current at certify time**. If the cache is not reliably populated for the day being certified, the preflight either can't run or compares against stale bytes — and that is a gap inside step 3's scope, not an implementation detail to sort out later. Report what actually populates those caches today and whether it covers the certify path.

## Step 3 — Build to the inventory

Scoped once step 2 lands. Two tracks, kept distinct: build what's missing, wire what's dead. Every first-invocation item from 2b is driven through the driver UI as part of the work, not after it. I'll bring the concrete scope back rather than guess it now.

## Technical notes

- `purge-rods-day` is the only authoritative purge entry point. SQL `purge_rods_day` two-arg refuses with `42501`; three-arg requires `_storage_owner`.
- `record_rods_purge_storage_result` has one signature (four args, `_late` defaulted). `purge-rods-day` omits `_late`; `sweep-rods-orphans` passes `true`.
- Case (c)'s iOS Safari gap is not closable in the sandbox.
