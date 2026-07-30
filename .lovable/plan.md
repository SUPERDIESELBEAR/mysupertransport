## Goal

On `/roadside`, a certified **keyed** day is drawn natively (SVG/HTML) from cached structured data — no PDF viewer, no blob URL, no `<object>`. The generated PDF stays the artifact for Print, Email, and device download only.

## One correction to the premise

`rods_days_cache` and `rods_events_cache` are declared in the Dexie schema (`src/lib/eld/offline/db.ts`) but **nothing writes to them today** — `hydrate.ts` only renders and stores a PDF per keyed day (`rods_pdfs`). Populating them is step one; the native renderer has no input until then.

## Work

**1. Shared, dependency-neutral header fields — `src/lib/eld/rodsHeaderFields.ts` (new)**
- Export `rodsHeaderFields(day: RodsDay, driverName: string): Array<{ label: string; value: string; width: number }>` — the same ten fields, order, and formatting currently inlined in `renderRodsDay.ts`.
- Imports only `rodsTypes.ts`. No `pdf-lib`, no Supabase — so the roadside graph never reaches the PDF library.
- `renderRodsDay.ts` deletes its local `fields` array and imports this instead; `RoadsideDayRender` imports the same module.
- Same treatment for the annotation strings (RECONSTRUCTED / AMENDED).

**2. Hydration writes structured data (`src/lib/eld/offline/hydrate.ts`)**
- In `cacheKeyedDay`, write `rods_days_cache` and `rods_events_cache` **inside a single `roadsideDb.transaction('rw', ...)`** so a kill between them cannot leave a header with no segments. Same refresh guard (`cached_at > day.updated_at`).
- Download the certification signature PNG when `certification_signature_path` is set, store it in `signature_images` with `origin: 'downloaded_cache'`, and pass it to `renderRodsDay` so PDF and native render show the same signature.
- Extend `prune` to the two cache stores and to `downloaded_cache` signatures, on the same rules as `rods_pdfs`.
- Type cache entries as `RodsDay` / `RodsEvent[]` instead of `unknown`.

**3. `signature_images` origin disambiguation (`db.ts`)**
- Add `origin: 'local_pending_upload' | 'downloaded_cache'`; bump to `version(2)` with `signature_images: 'key, uploaded, origin'` plus an upgrade stamping existing rows.
- `local_pending_upload` is permanently exempt from pruning; `downloaded_cache` prunes like `rods_pdfs`. `origin` is required at every write site — never defaulted.

**4. New `src/components/eld/RoadsideDayRender.tsx`**
Pure presentational component `{ day; events; driverName; signatureDataUrl }` drawing the full §395.8 page natively: annotation banner, header block from `rodsHeaderFields`, duty grid in SVG via `rodsGridGeometry.ts` (print-black on white) with the totals column from `statusTotals`, remarks list, RECAP A–D, and the certification line. Same `isCompleteEvent` filter and no connector across a gap. No blob URLs, no iframe, no `pdf-lib`.

**5. `RoadsideDayView.tsx` routing**
- `kind === 'keyed'`: structured render only when the day row **and** the events row are present; "day present, events absent" counts as missing.
- Missing structured row → fall back to the `rods_pdfs` embed **silently**, "Open file" visible, no banner. Log the fallback for the driver-side dashboard.
- `kind === 'eld_document'` PDFs: keep the embed, with "Open file" always shown above the frame.

**6. Print / Email unchanged** — both keep using `rods_pdfs` bytes.

**7. Parity test — `src/lib/eld/__tests__/rodsRenderParity.test.ts`**
Assert the native render emits every `rodsHeaderFields` label/value pair in order; annotations, remarks, RECAP A–D, per-status totals, and certification name/timestamp match the PDF path's computed values; and native SVG segment coordinates equal `minuteToX` / `rowCenterOffset` for the same events. RTL, no byte diffing.

**8. Import-graph test (`roadsideImportGraph.test.ts`)**
- Add `pdf-lib` to `FORBIDDEN`, checking forbidden specifiers **before** the bare-package early return.
- Skip type-only specifiers (`import type` / `export type`, and inline `type` members) so erased imports cannot false-positive. Confirm `rodsTypes.ts` and the new header module import no Supabase types.
- Build-output assertion: production build, then assert the `/roadside` entry chunk graph contains no `pdf-lib` and no `@supabase` module.

**9. Pass A gate — end-to-end, both paths, with self-checking preconditions**
Playwright against the running app, WebKit and Chromium.

- **Precondition guard (runs before any render assertion).** Seed IndexedDB with the fixture, then read back `rods_days_cache` and `rods_events_cache` for the fixture date. If either row is absent, fail with a distinct message — e.g. `PRECONDITION: structured cache rows missing for <date>; hydration/seed did not run — this is not a renderer failure` — so a hydration gap can never be mistaken for a renderer bug, and the test can never pass through the fallback while claiming to exercise the native path.
- **Case A — native path.** Structured rows present: the day renders fully, the native SVG grid is present, and there is no `<object>` / `<iframe>` / blob URL anywhere on the day. Screenshot on both engines.
- **Case B — fallback path.** Structured rows absent, `rods_pdfs` present: the embed renders, the "Open file" action is visible, and no "older cached format" (or equivalent) banner text appears. This is what ships to a driver whose device hydrated before this change, so it is covered explicitly rather than by inference.

**10. Prune test — `src/lib/eld/offline/__tests__/prune.test.ts` (new)**
With fake-indexeddb: given a manifest that references neither entry and both entries older than the 14-day cutoff —
- a `local_pending_upload` signature **survives** pruning;
- a `downloaded_cache` signature **is removed**;
- `rods_days_cache` / `rods_events_cache` rows for an unreferenced stale day are removed, and rows for a manifest-referenced day are kept.

## Technical notes

- Two shared sources guarantee parity: `rodsGridGeometry.ts` for geometry, `rodsHeaderFields.ts` for fields and annotations.
- Devices already hydrated have PDFs but no structured rows until the next authenticated load; step 5's silent fallback covers that window and case B tests it.
