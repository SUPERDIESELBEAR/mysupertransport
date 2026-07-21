# Maintenance Modal — AI Attachment & Date Autofill

Good news on both fronts: the current build already does both of these things, but the UI doesn't make it obvious. This plan makes them visible so staff never re-uploads or wonders whether the date came through.

## What already works (verified in code)

- **Invoice auto-attaches.** After a successful scan, `handleScanInvoice` calls `setInvoiceFile(file)`, so the same file uploads to `fleet-documents` on Save — no need to touch "Choose File" again.
- **Service Date is read by AI.** The edge function extracts `service_date` as `YYYY-MM-DD`, and the modal converts it to `MM/DD/YYYY` for the DateInput. Staff only needs to pick a date if the invoice's date is unreadable or missing.

## What to change (UI only)

`src/components/fleet/MaintenanceRecordModal.tsx`

1. **Replace the plain "Upload Invoice" file input with an attachment chip when a file is set** — show filename, size, a "Remove" (×) button, and a small "Attached from AI scan" hint when `aiFilled` is true. The hidden `<input type="file">` stays available via a "Replace file" link for the manual case.
2. **Nudge the "Filled by AI — please review" pill** to list which fields were filled (e.g. "Service Date, Odometer, Shop, Amount, Invoice #, Category, Description"), and call out any field the AI returned `null` for with a subtle "AI couldn't read — please enter" hint under just that field (Service Date is the important one).
3. **No changes** to the edge function, storage flow, save logic, or schema.

## Out of scope

- DOT Inspection modal (separate task).
- Auto-save without review.
- Server-side changes.
