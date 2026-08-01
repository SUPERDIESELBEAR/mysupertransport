## Goal

Drive the demo-driver flow end to end against the running preview, assert the watermark **by pixel** on every render class, then reset and leave every table and Storage prefix at zero for that operator in the same run.

## Two findings confirmed before the run

- **`demo_reset_at` has no client reader.** `reset-demo-driver` writes it to `operators.demo_reset_at` and the column exists in the generated types, but no file under `src/` references it. The Dexie stores are never wiped by a reset today.
- **Suppression is a toast, not a sheet.** The only listener is `DemoSuppressionToaster` (a `sonner` `toast.info`). A suppressed send shows a transient notice with no way to re-read what would have gone out.

## The reset wipe — corrected

**Gated on `is_demo`, not on the timestamp.** The clear runs only when *both* hold: the operator's `is_demo === true` **and** the server's `demo_reset_at` is newer than the locally stored watermark. `is_demo` is already cached on `LocalMeta` and, importantly, is *sticky* there (`hydrate.ts` keeps the existing value when the operator fetch fails), so a failed read cannot un-demo a device into a wipe. The gate reads the freshly fetched operator row and the cached meta, and refuses to clear unless the server row itself says demo — a stray `demo_reset_at` on a real operator is a no-op, and a real driver's locally certified day with unsynced bytes is never reachable by this path.

**Mid-flight queue entries.** `in_flight` is a persisted status: `store.ts` marks the entry `in_flight` before the wire call and settles it to `succeeded`/`failed` when the call returns. So a clear during an active drain is genuinely reachable — a `certify_rods_day` write lands server-side and the device, having dropped `sync_queue`, forgets it ever queued it, then the runner's settle writes into a store that no longer holds the row. For a demo operator that is acceptable (the server rows are being purged anyway, and the whole point is to return to zero). For a real operator it must be unreachable, and the `is_demo` gate above is what makes it so. Belt and braces on top of the gate:

- The wipe waits for the drain to quiesce — no entries in `in_flight` — before clearing, with a bounded wait; if it does not quiesce it defers to the next hydrate rather than clearing under a live write.
- The runner tolerates settling a vanished entry (missing row → no-op instead of resurrecting it).

Stores dropped: the day/PDF/document/signature caches, `roadside_manifest`, `local_meta` and `sync_queue`, scoped to that operator. Stores-only clear, respecting the existing "never `clear()` in an upgrade" rule in `db.ts`.

## Part 1 — Walkthrough (Playwright, headless Chromium, preview at localhost:8080)

Session restored from the injected managed session; operator switched to a demo driver. Sequence: report malfunction → certify a day → build officer packet → reset.

Artifacts are rasterised and checked numerically, never read from source. PDFs → page bitmaps; roadside SVG → element screenshot at 430px width.

**Watermark predicate (three parts, applied to every surface):**
1. Count pixels within tolerance of the mark's red (`0.85, 0.12, 0.12` at 0.18 opacity) — a helper that runs and draws nothing fails here.
2. Sample that red *inside the duty-status grid's bounding box* — catches "drew it under the grid" and "drew it only in the margins".
3. Confirm red-pixel runs along the ~45° axis, not axis-aligned bands.

**Surfaces:** certified-day PDF (`renderRodsDay`), roadside SVG at phone width, blank 8-day packet (`renderDutyStatusGrid`), malfunction notice (`malfunctionNoticeCore`), and **each officer-packet page class separately** — cover, placeholder, image page, and a merged page copied from a real uploaded PDF (the run uploads one as a day's source document; that page is stamped after `copyPages` and is the likeliest miss).

**Outbound:** after the malfunction report and the packet send, assert zero new rows in `notifications` and `eld_sync_alerts`, zero `share_tokens` minted, and that the suppression sheet rendered — asserted on the DOM, not on the edge response.

## Part 2 — Fix the two gaps

- **Client-side reset** as scoped above, triggered from the hydrate path.
- **Persistent suppression sheet** replacing the toast: lists what was suppressed, intended recipients, subject and attachment name; dismissible and re-openable. `DEMO_SUPPRESSED_EVENT` already carries `to` / `subject` / `attachment`.

## Part 3 — Reset, in the same run

`set-demo-flag` 409 is exercised while a certified demo day still exists, then the purge runs. Final assertions by query: `rods_days`, `rods_events`, `eld_malfunction_events`, `eld_sync_alerts`, `notifications`, `rods_unlock_events`, `share_tokens` all zero for that operator, Storage prefix empty, Dexie stores empty. The truncate window closes inside this run.

## Technical notes

- Scripts and evidence under `/tmp/browser/demo-walkthrough/`.
- Pixel checks in Python (PIL + a PDF rasteriser), independent of the app's rendering code.
- A unit test covers the wipe gate directly: real operator + moved `demo_reset_at` → stores untouched; demo operator + in-flight entry → deferred, not cleared.
- The live-catalog test runs at the end as a regression gate.

## Written up in

`docs/eld-demo-guardrails-walkthrough-2026-08-01.md` — per surface: what was observed, the pixel numbers, and where. Both findings and the mid-flight behaviour recorded under their own headings.
