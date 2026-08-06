# Capture real inspection date and result for Stage 5 Truck Inspection uploads

## What happens today

Uploading a file in the Onboarding Pipeline's TRUCK INSPECTION slot already flows through to the Vehicle Hub: the file is filed in the driver's binder as a "Periodic DOT Inspections" record, and a database trigger creates the matching DOT Periodic Inspection entry on that driver's truck.

The gap: the upload collects no inspection details, so the created record always uses **today's date** and a hard-coded **Pass** result. That makes the next-due date and the overdue badge in the Vehicle Hub wrong.

## What to build

Ask for the two missing facts at upload time, and pass them through to the Vehicle Hub record.

1. When a Truck Inspection file is chosen (staff or driver), show a small confirmation dialog before the upload completes:
   - Inspection date (required, date picker, cannot be in the future)
   - Result: Pass / Fail (defaults to Pass)
   - Optional: inspector / shop name
2. Use that date and result for the Vehicle Hub DOT Periodic Inspection record instead of today/Pass. The next-due date is then calculated from the real inspection date using the existing fleet reminder interval.
3. If the dialog is dismissed, the file is not uploaded (no silent bad record).
4. Existing records already synced with a today/Pass default stay as they are; staff can correct them in the Vehicle Hub as they always could.

## Technical notes

- `src/components/operator/OperatorDocumentUpload.tsx` (`handleUpload`, lines ~141-236): add a pre-upload modal for `slot.key === 'truck_inspection'`; carry `{ inspection_date, result, inspector }` into the `inspection_documents` insert.
- The DB trigger `sync_inspection_doc_to_dot()` currently hard-codes `inspection_date = CURRENT_DATE` and `result = 'pass'`. Migration: add nullable `inspection_date`, `result`, and `inspector` columns to `inspection_documents`, and update the trigger to use `COALESCE(NEW.inspection_date, CURRENT_DATE)` and `COALESCE(NEW.result, 'pass')`. Behavior is unchanged for any other caller.
- Vehicle Hub (`FleetDetailDrawer.tsx`) needs no change — it reads `truck_dot_inspections` directly.
