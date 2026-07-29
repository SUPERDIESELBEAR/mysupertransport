## What's wrong

The eye button in Vehicle Hub's "Registration and 2290" section calls the same preview helper used by maintenance invoices and DOT certificates, and that helper hardcodes the `fleet-documents` bucket (`FleetDetailDrawer.tsx:341-370`).

Registration and 2290 files are not in that bucket — they're uploaded to `inspection-documents` under `driver/<driver-id>/registration/...` (`Registration2290Modal.tsx:121-127`). So signing the path against `fleet-documents` returns "object not found", and the catch block shows the misleading maintenance-specific toast "No invoice uploaded for this record."

Nothing is wrong with Robert Williams' record — the file exists, it's just being looked for in the wrong place.

## The fix

**1. Make the preview helper bucket-aware**

Add a bucket parameter to `handlePreviewFile`, defaulting to `fleet-documents` so maintenance and DOT rows behave exactly as today. The Registration/2290 row passes `inspection-documents`.

**2. Fall back to the stored URL**

Registration rows also carry a long-lived `file_url`. If signing fails for any reason, open that URL in the preview modal instead of erroring, so an old row with a mismatched path still displays.

**3. Correct the error copy**

The "No invoice uploaded for this record." toast stays for maintenance records only. For registration/2290, show "File not found in storage." and skip the `missingInvoiceIds` bookkeeping, which is maintenance-specific.

## Technical notes

- Single file: `src/components/fleet/FleetDetailDrawer.tsx`.
- No database or storage changes; no migration.
- Verification: open a truck in Vehicle Hub, click the eye on both the Registration (IRP Cab Card) and Form 2290 rows, and confirm the in-app preview modal renders the document; re-check a maintenance invoice row to confirm no regression.
