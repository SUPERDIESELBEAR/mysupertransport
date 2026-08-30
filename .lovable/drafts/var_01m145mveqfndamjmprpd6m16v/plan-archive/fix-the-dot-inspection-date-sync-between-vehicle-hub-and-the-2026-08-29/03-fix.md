## The fix

Make the Vehicle Hub the single source of truth, and have the binder show a read-only mirror of it.

1. **Vehicle Hub → binder sends the inspection date**, not the next due date. The binder chip and "Inspection Date" line then always match the Vehicle Hub record, and the file attached to the inspection continues to flow to the binder as it does today.
2. **Repair the re-entry guard** so a sync-driven write can never bounce back and overwrite the value that was just saved.
3. **The Periodic DOT Inspections row becomes fully read-only in the binder**: the inline date editor and the **Replace** button are removed for this row only. To replace the certificate, staff open the Vehicle Hub and upload the new file against the inspection record (the existing "Upload Certificate" field on the Add/Edit Inspection form); the file and date then flow to the binder together. View, copy and delete stay available in the binder. Every other binder row keeps its Replace button and editable expiry exactly as it is.
4. **Retire the on-load overwrite** from the binder screen — once the database keeps the two in step, the screen only reads.
5. **Verify Pratt** end to end: change the Aug 26 date in the Vehicle Hub, confirm it persists there, and confirm the binder shows the new date and the recalculated next-due. Also replace the certificate via the Vehicle Hub and confirm the new file lands on the binder row.

## What stays the same

- Uploading a Truck Inspection file in onboarding still creates the Vehicle Hub record with the date, result and inspector captured at upload.
- The next-due countdown and interval stay in the Vehicle Hub. No binder rows other than Periodic DOT Inspections change.
- Existing records keep their current dates; nothing is rewritten by this change.

## Technical notes

- `sync_dot_to_inspection_documents()` writes `NEW.next_due_date` into `inspection_documents.expires_at`; change to `NEW.inspection_date`.
- `sync_dot_to_inspection_documents()` sets `app.skip_doc_sync`, but `sync_dot_binder_to_vh()` checks `app.skip_dot_sync` — the flags never line up. Align both directions on one flag pair so each trigger suppresses the other.
- Both function replacements are staged as an additive migration and apply when this draft is accepted.
- UI: `DocRow.tsx` / `InspectionBinderAdmin.tsx` gate the inline expiry editor and the Replace button off for `isInspectionDateDoc(name)` (view/copy/delete remain); drop the `syncInspectionBinderDateFromVehicleHub` call in `InspectionBinderAdmin.tsx` and keep `src/lib/syncInspectionBinderDate.ts` only if another caller needs it.
