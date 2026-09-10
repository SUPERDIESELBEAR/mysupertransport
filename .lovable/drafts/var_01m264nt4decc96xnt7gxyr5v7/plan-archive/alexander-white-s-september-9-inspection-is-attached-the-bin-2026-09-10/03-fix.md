## The fix

Judge "does this document exist" by the **file's location**, not by whether a link happens to be saved. Saved links are temporary anyway — they expire — so the safest rule is to build a fresh link at the moment someone opens the document.

1. **Staff Inspection Binder** — a row counts as having a file when either a location or a link is stored. The "No file" badge disappears, the inspection-date badge and eye appear, and the button reads Replace. Opening the eye signs a fresh link from the stored location when no link is saved.
2. **Driver's binder** in the driver app — same rule, so Alexander sees his own certificate too.
3. **Sharing surfaces** (single-document share link, roadside bundle, emailed copies) — resolve the same way, so a shared DOT certificate is never a blank page.
4. **Vehicle Hub upload** also stores the link alongside the location going forward, so both readings agree from the start.
5. **No repair of stored rows is needed** — the two affected rows already hold the correct location and will display correctly the moment the reading rule changes.

## What stays the same

The inspection date, the next-due countdown, the Vehicle Hub as the source of truth for DOT inspections, and every other binder document type are untouched.

## Removing the first attempt

Alexander's truck carries **two** September 9 inspections — one entered on the 9th with a 90-day interval and one on the 10th with a 360-day interval, same certificate file name. Confirmed: the 90-day entry was a first attempt. This plan **removes that earlier record**. The 360-day record stays as the single September 9 inspection, the binder keeps pointing at its file, and next due stays 2027-09-04. Removal is a single row deletion in the inspection history, recorded with who and when.

## Technical notes

- Confirmed live: `sync_dot_to_inspection_documents()` copies `certificate_file_url` straight through; Vehicle Hub inspection uploads persist `certificate_file_path` with an empty `certificate_file_url`, so `inspection_documents.file_url` lands blank. Exactly 2 of 771 binder rows are in that state, both `Periodic DOT Inspections`.
- `InspectionBinderAdmin.tsx` gates the badge, eye, checkbox, share and Upload/Replace label on `doc?.file_url` (lines ~892–1110). Introduce one `hasFile = !!(doc?.file_url || doc?.file_path)` and a lazily signed `resolvedUrl`, mirroring the pattern already working in `DocRow.tsx` (~1088–1098) with `bucketForBinderDoc(doc.file_path)`.
- `OperatorBinderPanel.tsx` (~353–360) has the identical `file_url`-only gate; apply the same change.
- `InspectionSharePage.tsx` / `BinderShareBundlePage.tsx` render from `file_url`; fall back to signing from `file_path`.
- Vehicle Hub inspection save: also write a signed `certificate_file_url` when uploading a certificate.
- No schema change, no migration, no data correction.
- Verify by signing in as owner, opening Alexander White's binder (Periodic DOT Inspections shows 9/9/2026 with a working eye), and checking the second affected driver's row; plus the existing binder tests and a typecheck.
