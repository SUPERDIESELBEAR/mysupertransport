# Fix: DOT Periodic Inspection "view" eyeball shows an invoice error

## What's wrong

In Vehicle Hub > vehicle detail > DOT Periodic Inspections, the eyeball tries to sign the certificate file out of the `fleet-documents` storage bucket. But DOT certificate files are almost never in that bucket:

- 90 inspection records have a certificate path
- 78 of those files live in `inspection-documents`
- 7 live in `operator-documents`
- 0 live in `fleet-documents`
- 5 have no matching file in storage at all

Because the signing call fails with "not found", the code falls into its maintenance-invoice error branch and shows the wrong message: "No invoice uploaded for this record." The document exists — the viewer is just looking in the wrong place.

Most of these rows were created by the onboarding-to-binder sync (paths look like `driver/<id>/periodic-dot-inspections/...`), while manually added inspections upload to `fleet-documents` (paths look like `<operator-id>/dot/...`).

## The fix

1. Resolve the correct bucket per record instead of hardcoding one:
   - path starting with `driver/` or containing `truck_inspection` -> `inspection-documents`, then `operator-documents`
   - path containing `/dot/` -> `fleet-documents`
   - if the first attempt fails, try the remaining buckets before giving up
2. Open the resolved file in the existing in-app preview modal, same as every other document.
3. Use the record's own file name for the modal title, falling back to "DOT Inspection Certificate" (these synced rows have blank certificate file names).
4. Fix the error copy: the maintenance-only "No invoice uploaded for this record." message must not be reachable from DOT inspections. For the few records whose file is genuinely gone, show "Inspection certificate file not found."
5. Keep the eyeball hidden when a record has no certificate path at all (already the behavior).

## Technical notes

- All changes are in `src/components/fleet/FleetDetailDrawer.tsx`, in `handlePreviewFile` and the DOT inspection row's view button.
- Add a small bucket-candidates helper so the preview tries buckets in order instead of assuming one; maintenance and registration/2290 previews keep their current explicit buckets.
- No database or storage changes; the files already exist and staff read access on those buckets is already in place.