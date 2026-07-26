## What's happening

The error comes from the **file upload step**, not the receipt record. Confirmed by reading the storage rules for the `operator-documents` area:

- Drivers may only write files whose **first folder is their own operator ID**.
- The return-receipt card writes to `equipment-receipts/<operatorId>/return-<timestamp>.jpg`, so the first folder is the literal text `equipment-receipts`.

No rule matches that shape, so the upload is rejected with "new row violates row-level security policy". The database record rules themselves are fine (I verified the Unit 1900 sheet has return instructions sent and is linked to the driver's account), so the insert would have succeeded had the file landed.

## Fix

1. In `src/components/operator/EquipmentReturnCard.tsx`, change the upload path to `<operatorId>/equipment-receipts/return-<timestamp>.<ext>` so it sits inside the driver's own folder and satisfies the existing upload/view rules. No database or policy change needed.
2. Sanitize the file extension (fallback to `jpg`/`bin`) and keep the existing cleanup-on-failure behavior.
3. Surface a clearer message if a permission error still occurs (e.g. "Your session may have expired — sign out and back in"), instead of the raw database text.
4. Check the staff-side receipt upload path in `EquipmentAssetSheet.tsx` / `SignOffSheetList.tsx` for the same folder convention; staff have blanket access so they aren't broken, but paths should be consistent so previews resolve identically.

## Verification

Re-run the driver flow for Unit 1900: attach a JPG, enter a tracking number, upload, and confirm the "Receipt received — staff notified" panel appears, the receipt preview opens, and the staff-side sheet shows the receipt.
