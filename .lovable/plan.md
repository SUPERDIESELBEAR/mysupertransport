## Diagnosis

**Where the individual position prompts live:** `src/components/operator/TruckPhotoGuideModal.tsx` renders 10 guided slots — Front, Driver Side, Rear, Passenger Side + 6 tire angles. Each slot has its own step, hint, camera prompt, and upload.

**Where the guided flow correctly launches:** Stage 3 documents page (`OperatorDocumentUpload.tsx`, lines 445-505). The `truck_photos` slot skips the generic upload button and shows a gold **"Take Truck Photos (10 Required)"** CTA that opens `TruckPhotoGuideModal`. This path is fine.

**Where the bug is:** `src/components/operator/SmartProgressWidget.tsx`, lines 449-454. The `INLINE_SLOTS` array on the driver dashboard lists `truck_photos` alongside `form_2290` / `truck_title` / `truck_inspection` and renders a plain single-file picker (line 613-624). When staff mark truck photos "requested", the widget shows one generic **Upload** button on the dashboard. Drivers tap it, pick one photo, see the ✓ success flash, and believe they're done — the 10-slot guided modal is never opened.

Answers to the diagnostic questions:
1. Both — the prompts are present in the codebase and render on the Stage 3 page, but they are entirely bypassed on the dashboard widget path.
2. Not a mobile-only display issue; the widget renders the same broken single-slot on all viewports.
3. Yes — when the dashboard `InlineDocUpload` widget was added, `truck_photos` was included in `INLINE_SLOTS` without a special-case branch to launch `TruckPhotoGuideModal`.

## Fix

In `SmartProgressWidget.tsx → InlineDocUpload`:

1. Add a `showTruckGuide` boolean state.
2. When the current requested slot is `truck_photos`, render a dedicated CTA row that reads **"Take Truck Photos (10 Required)"** (or **"Continue Truck Photos (N left)"** if some are already uploaded) instead of the generic file input + Upload button. The button opens `TruckPhotoGuideModal`.
3. Compute the "N of 10 uploaded" count from `uploadedDocs` filtered by `document_type === 'truck_photos'` and distinct `file_name` prefix (same logic used in `OperatorDocumentUpload.tsx` line 448-452).
4. Render `<TruckPhotoGuideModal>` at the end of `InlineDocUpload`, wired to `operatorId`, `alreadyUploadedLabels`, and `onUploadComplete`.
5. All other slots (`form_2290`, `truck_title`, `truck_inspection`) keep the existing single-file picker behavior.

No schema changes. No changes to `TruckPhotoGuideModal.tsx` itself. No changes to `OperatorDocumentUpload.tsx`.

## Verification

- `bunx tsgo --noEmit` clean.
- Manual walk-through in Playwright when a driver session is available:
  1. As two seeded drivers, ensure `onboarding_status.truck_photos = 'requested'`.
  2. Open the driver dashboard on mobile viewport (390×844) and desktop.
  3. Confirm the widget shows **"Take Truck Photos (10 Required)"** — not a generic Upload button.
  4. Tap it → guided modal opens → each of the 4 body positions (Front, DS, Rear, PS) plus 6 tire angles has its own step.
  5. Upload two photos, close, reopen — progress persists and the widget label updates to "Continue Truck Photos (8 left)".
  6. Staff view: confirm each uploaded photo carries its position label ("Front — file.jpg") in the management side.

## Technical notes

- The staff-side "N of 10 required" gate already exists in `OperatorDocumentUpload.tsx` (line 391-408) and uses `distinctSlotsUploaded = new Set(uploaded.map(d => (d.file_name ?? '').split(' — ')[0].trim()))` — the fix reuses that logic verbatim so both surfaces stay in sync.
- `TruckPhotoGuideModal` already writes `file_name` prefixed with the position label (`${currentSlot.label} — ${file.name}`), so staff mirroring is unchanged.
- The dashboard widget's existing `justUploaded` flash animation is dropped for the truck_photos row since the guided modal handles its own success UX.
