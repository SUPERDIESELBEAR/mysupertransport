## Stage 2 — Digital RODS Entry, Grid Rendering & Certification (revised)

Builds on Stage 1 (`eld_malfunction_events`, `eld_devices`, `eld-notices` bucket, `useEldMalfunction`, `renderDutyStatusGrid`, `react-signature-canvas`).

Hard rules carried through: no HOS math of any kind (only the 1440-minute arithmetic check on the face of the form), no ECM/GPS/telematics, no "ELD/e-log" wording for SUPERDRIVE itself, module unreachable unless an open malfunction with `hinders_hos_recording = true` exists, certified days immutable for everyone including management.

### 1. Database

**`rods_days`** — §395.8 header fields, driver-entered RECAP fields, four derived status-minute totals, `is_reconstructed`, `source_document_path`, `status` (draft | certified | superseded), `supersedes_day_id`, certification columns, `pdf_path`, `locked`, plus:

- `record_source text NOT NULL DEFAULT 'keyed'` — `keyed` | `eld_document`.

Uniqueness and amendment lifecycle:

- Partial unique index on `(operator_id, log_date) WHERE status = 'certified'` — one certified day may coexist with draft amendments for the same date.
- Cloning an amendment leaves the original **certified**. The original flips to `superseded` in the **same transaction** that certifies the amendment (`certify_rods_day`, SECURITY DEFINER), never at clone time.
- DELETE blocked by trigger on any locked row **and** on any draft where `supersedes_day_id IS NOT NULL`. Discarding goes through `discard_rods_amendment`.
- A constraint trigger guarantees any date that has ever had a certified row always has exactly one non-superseded certified row.

**`rods_events`** — segments with minute-range checks, duty status, required city/state, remarks, `is_short_period`.

**`rods_amendments`** — audit trail with `field_path`, `old_value`, `new_value`, `reason`; no client INSERT, written server-side only. `field_path` is never null.

Access: driver full CRUD on their own unlocked days/events, read-only once locked; onboarding staff, dispatch and management read-only (no management write policy exists at all); GRANTs alongside every table.

New private bucket `rods-logs` for generated day PDFs, certification signatures and uploaded ELD-produced logs, foldered by operator id, driver-own-folder + staff read policies.

### 2. Uploaded ELD logs (`record_source = 'eld_document'`)

- Created with `status = 'certified'`, `locked = true` so the day occupies the partial unique index slot and no keyed day can be created for the same date. `is_reconstructed = false` — these were retrieved, not reconstructed.
- SQL `COMMENT` on `record_source` and `status` stating explicitly that `status = 'certified'` is the storage state while the user-facing label is "On file (ELD log)" — the mismatch is intentional and must not be "fixed."
- No signature capture, no 1440-minute validation, no PDF generation. `pdf_path` stays null; `source_document_path` **is** the record.
- These days have no `rods_events`, so the four derived totals are zero — the totals row is **suppressed** for them rather than rendering 0:00 across all four statuses.
- Code comment noting the Stage 3 dependency: roadside presentation renders `source_document_path` for these days rather than generated PDF bytes.

**Replace, don't amend.** For `eld_document` days, "Amend this log" is hidden and replaced by **"Replace document"**. Amendment stays available only for keyed days.

Atomicity: a SECURITY DEFINER `replace_rods_document(day_id, new_path, reason)` performs the whole thing in **one transaction** — supersedes the existing row and inserts the new `eld_document` row as certified. Never two client calls: the partial unique index and the constraint trigger both reject the intermediate state. In the same transaction it writes one `rods_amendments` row with `field_path = 'source_document_path'`, `old_value` and `new_value` set to the old and new storage paths, and the written reason in `reason`. The original row and its file are retained permanently — a superseded document is never deleted.

### 3. Entry experience (driver, mobile-first)

- `RodsDayEditor` — header pre-filled aggressively from the operator profile, `eld_devices` and the most recent day; driver confirms rather than types.
- `DutyStatusTimeline` — stacked chronological segments; 15-minute-snapping picker with 1-minute precision, four large numbered status buttons, required city + 2-letter state, optional remarks. Segments chain 0 → 1440. Sub-15-minute segments auto-flag `is_short_period`.
- **"Copy yesterday" guardrails:** disabled entirely inside the reconstruction wizard. Elsewhere it copies segment boundaries and duty statuses only, always clearing city, state, remarks, miles, from/to and shipping document. Always lands in `draft`.
- `RodsGrid` — live SVG grid: four labeled status lines, 24 preprinted hour increments, Midnight/Noon, continuous lines with vertical connectors, per-status totals at right, minimum render width, pinch-zoom.

### 4. One grid geometry (deliberate Stage 1 refactor)

`src/lib/eld/rodsGridGeometry.ts` becomes the single source of grid metrics for the on-screen SVG, the certified-day PDF, **and** Stage 1's `renderDutyStatusGrid`. After the refactor, regenerate the blank 8-day packet and diff it against a pre-refactor print to confirm zero visual change.

### 5. Validation and certification (keyed days)

Visible pass/fail checklist gates Certify: full 24-hour coverage with no gaps or overlaps, totals summing to exactly 1440, city+state on every change, all required §395.8 header fields, typed legal name. RECAP inputs are plain numeric fields — never computed, never validated.

Certifying captures signature + typed legal name, sets `status='certified'`, `locked=true`, generates and uploads the PDF client-side, then prompts "Save a copy to your phone."

### 6. Amendments (keyed days)

"Amend this log" clones to a draft with `supersedes_day_id`, requires a written reason, writes one `rods_amendments` row per changed field server-side, and supersedes the original in the same transaction as the amendment's certification. Originals are never deleted; both versions appear in the archive. Amended PDFs print `AMENDED — original certified [timestamp]`.

### 7. Reconstruction wizard

Eight reverse-chronological date cards with a **three-state chip taxonomy**: **Needed · In progress ·** one completed state whose label depends on `record_source` — "Certified" for keyed days, "On file (ELD log)" for uploads. "Already on file" is removed. Progress counting treats both completed variants as complete.

Per-day "I already have this day from my ELD" upload path files the document and creates an `eld_document` day. Newly keyed days set `is_reconstructed = true` and print `RECONSTRUCTED — 49 CFR 395.34(a)(2)`.

### 8. PDF generation

`src/lib/eld/renderRodsDay.ts` using `pdf-lib`, client-side, US Letter portrait, one day per page, print-scale grid from the shared geometry, all §395.8 elements, RECAP block, the 79 FR 39342 footer, RECONSTRUCTED/AMENDED annotations, short-period lines in remarks. Bytes written to `rods-logs`.

### 9. Certification reminders

Never prompt for a period that has not ended.

- **While reconstruction is incomplete** (any of the 8 required days is Needed or In progress): the 08:00 single-day reminder is suppressed and replaced by "Reconstruction incomplete — N of 8 days still needed."
- **08:00 home-terminal local**, once all 8 are complete: certify the most recently completed day if uncertified.
- **20:00 home-terminal local** (unchanged): same-day nudge to keep the log current — never mentions certifying.

Both ride the existing hourly Stage 1 job and notification system.

### Technical notes

- Files: migration (tables, `certify_rods_day`, `discard_rods_amendment`, `replace_rods_document`, triggers, column comments); `rodsGridGeometry.ts`, `rodsValidation.ts`, `renderRodsDay.ts`; `useRodsDay.ts`; components `RodsModule`, `RodsDayList`, `RodsDayEditor`, `DutyStatusTimeline`, `RodsGrid`, `RodsCertifyPanel`, `RodsAmendModal`, `RodsReplaceDocumentModal`, `RodsReconstructionWizard`; entry wired into `ELDMalfunctionView` / `ELDMalfunctionDashboard` behind the open-event guard.
- Inline hex per spec (`#000000`, `#1C1C1C`, `#FFFFFF`, `#F5F5F5`, `#C9A84C`, `#E08A2E`, `#C0392B`), 48px minimum tap targets.

### Out of scope this stage

Offline/IndexedDB/service worker, roadside presentation mode, management console and retention export, any server-side-only PDF path, and any hours-of-service calculation.
