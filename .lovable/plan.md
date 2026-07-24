## Problem

In the Driver Hub → Vehicle Hub → **Repairs & Maintenance** section, both the row-level eyeball icon and the **View Invoice** button inside the Maintenance Record dialog fail to open uploaded receipts. Instead they show "No invoice uploaded for this record." and then hide the eyeball icon on subsequent renders — even though the invoice file is actually attached in storage.

## Root cause (verified)

- `MaintenanceRecordModal.tsx` uploads receipts to the **`fleet-documents`** bucket under `"{operatorId}/maintenance/{timestamp}_{rand}.{ext}"`.
- `FleetDetailDrawer.tsx` `handlePreviewFile` resolves the bucket via `bucketForBinderDoc(filePath)` from `DocRow.tsx`.
- `bucketForBinderDoc` only routes to `fleet-documents` when the path matches `"{uuid}/dot/..."`. Maintenance paths (`"{uuid}/maintenance/..."`) fall into the earlier generic `"{uuid}/..."` branch and get routed to the **`operator-documents`** bucket.
- `createSignedUrl` returns "object not found" from the wrong bucket, which triggers the missing-invoice toast and adds the row's ID to `missingInvoiceIds`, hiding the eyeball on that record.

## Fix

Route maintenance invoices to the correct bucket in the Fleet drawer, without changing the shared `bucketForBinderDoc` helper (used by inspection binder code paths that legitimately expect `operator-documents`).

### Change — `src/components/fleet/FleetDetailDrawer.tsx`

- In `handlePreviewFile`, hardcode `bucket = 'fleet-documents'` (that's where every invoice/receipt attached to `truck_maintenance_records.invoice_file_path` lives — including the DOT inspection certificate path, which already lives in `fleet-documents`).
- Drop the import of `bucketForBinderDoc` here since it's no longer needed.
- Also pass `bucketName="fleet-documents"` (and the `filePath`) to the `FilePreviewModal` render for maintenance previews so any downstream refresh/edit flow uses the right bucket.

No changes to `MaintenanceRecordModal.tsx`, no schema changes, no data migration. Existing uploaded receipts will preview correctly on the next click.

## Verification

- Open a driver in Driver Hub → Vehicle Hub → Repairs & Maintenance.
- Click the eyeball icon on a row with an uploaded receipt → preview opens.
- Click a row to open the Maintenance Record dialog → **View Invoice** → preview opens.
- Confirm no "No invoice uploaded" toast appears when a file exists, and the eyeball stays visible across re-renders.
