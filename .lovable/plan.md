Ordering confirmed. Case (a) is a recorded defect in step 1, not a stop-and-fix; the guard stays in step 2 so (g)–(l) run first and can still change what step 2 needs to do.

## Corrections folded in

- **Case (a) is expected red in step 1.** It gets recorded as a *confirmed defect with a reproduction* in `docs/eld-certification-playwright-run.md` — not treated as a harness failure, and not a trigger to pull `assertDraftsEnqueued` forward. Every other case runs before any fix is written.
- **(a) gains a second assertion.** After checking the certified server row, let the debounced enqueue fire against the now-locked day and confirm it does **not** produce a `row_not_writable` cancellation. That is the second half of the same defect and would otherwise go unobserved.
- **(a) is re-run after step 2** to confirm closure — both halves.

---

## 1. Playwright — first execution of the offline build

Harness under `/tmp/browser/eld/`: driver session via the staff QR handoff, `reset-demo-driver` for setup, `purge-rods-day` in a `finally`, ELD-tab hydration workaround deleted.

- **(g)** direct route to Paper Logs, no ELD tab: `local_meta` populated, day creation allowed. Fixed first if it fails, since everything else depends on it.
- **(a)** frozen page clock; type, then certify inside the window. Assert (i) the **certified server row carries the final keystroke**, and (ii) the late enqueue produces no `row_not_writable` cancellation. Expected red — recorded, not fixed here.
- **(b)–(f)** re-run without the workaround; (d)/(e) preflight against the Dexie cache. **(f)** stays recorded as unverified from the browser.
- **(h)** offline end-to-end: the five happens-before relations from `completed_at` (day→segments, day→certify, segments→certify, signature→certify, pdf→certify), uploads unordered against drafts explicitly not asserted; before reconnect `/roadside` shows the day Certified with the native `RoadsideDayRender` SVG drawn and the other seven days at their prior labels; after reconnect exactly one certified server row whose id equals the client-minted uuid.
- **(i)** coalescing under `in_flight`: later value wins, neither payload lost.
- **(j)** signed-but-unsynced read-only after reload, no draft enqueued. **(k)** render failure before the lock leaves an editable draft and an empty queue.
- **(l)** queue-side replay, the reachable twin of (f): `route.fetch()` then a 504, poll to `certified`, release the retry, assert `replayed: true`, `deleteReplayOrphans` on attempt two's paths only, `pdf_path` / `certification_signature_path` unchanged.
- **/roadside DOM assertion** in (h) and (j): no banner text, no sync-state string on the officer-facing screen.

Full findings reported before step 2 begins; both ELD docs rewritten with the results table and per-case evidence.

## 2. Header write, drafts guard, banner, authorized unlock

- `patchHeader` awaits `putCachedDay` on the keystroke and bumps `version`; only `enqueueCoalesced` stays behind the 700 ms timer. `flushPendingHeader` now means "push the pending enqueue now".
- `commitCertification` requires **`assertDraftsEnqueued`**: for this `log_date`, either a non-terminal `save_draft_day` / `save_draft_segments` entry exists and is in `depends_on`, or there is genuinely nothing pending. Throws otherwise.
- Migration: `rods_unlock_events` — `operator_id`, `rods_day_id uuid` (no FK, column comment explaining why, indexed), `log_date`, `unlocked_at`, `local_certified_at`, `cancelled_entry_ids jsonb`, `cancelled_states jsonb`, `reason`, `device_info`. Append-only RLS (driver inserts own, management reads, no update or delete), GRANTs in the same migration.
- New `SyncKind: 'record_unlock'`: transport failure → retry indefinitely; server rejection → keep the entry, never drop or cancel it, raise a high-priority Management alert immediately. Exempt from the transitive cascade, `resolveBlocked`, the drop-on-rejected rule and budget exhaustion — exempt from discard, not from alerting.
- Banner in the **day editor and Logs list only**, never `/roadside`, where a rejected day keeps its packet entry labeled Certified with no officer-facing indicator.
- Unlock action: one Dexie transaction clearing `local_certified_at`, cancelling the work chain with `cancelled_by: 'authorized_unlock'`, clearing `sync_stalled` / `sync_rejected`, bumping `version`, enqueueing `record_unlock`. Signed PDF and signature bytes retained.
- Management surface: unlock events on the driver's Logs view in the management portal.
- **Re-run case (a)** at the end of step 2 and record closure.

## 3. Three-state cold-start message

Carrier-missing gate: never hydrated + online (fetching now, hydration kicked); never hydrated + offline (connect once first); hydrated but carrier record incomplete (name the missing fields).

## Technical notes

- Files: `src/hooks/useRodsDay.ts`, `src/lib/eld/offline/commitCertification.ts`, a new `assertDraftsEnqueued` guard, `src/components/operator/rods/RodsDayEditor.tsx`, a new banner component, `src/lib/eld/offline/queue/{types,handlers,store,runner,alerts}.ts`, `src/lib/eld/offline/db.ts`, one migration, tests under `src/lib/eld/offline/__tests__/`.
- Harness lives outside the repo; only the two ELD docs change in-tree from step 1.
