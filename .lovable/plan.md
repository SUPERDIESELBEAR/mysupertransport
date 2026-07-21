## Context

In the Vehicle Hub → Repairs & Maintenance table (`src/components/fleet/FleetDetailDrawer.tsx`):
- The Description cell truncates with `max-w-[200px] truncate` and has no hover/click reveal.
- The eye icon only renders when `invoice_file_path` exists and opens the attached invoice via `handlePreviewFile` → in-app `FilePreviewModal`.
- `MaintenanceRecordModal.tsx` only performs `insert` — there is no edit or delete flow for maintenance records anywhere in the app.

## What the eye icon is for

It opens the **invoice/receipt file** attached to the record (PDF or image) in the in-app preview modal — same pattern as DOT certificates and Registration/2290 rows.

## Changes

1. **Row details dialog** — Make each maintenance row clickable. Open a new "Maintenance Record" dialog showing all fields with the full **Description** wrapped and selectable, a "View Invoice" button when an attachment exists, and an **Edit** and **Delete** button (staff/management only — reuse `readOnly` gate already on the drawer).
2. **Description cell affordance** — Keep the truncated cell, add a shadcn `Tooltip` on hover with the full text and a `cursor-pointer` hint. Clicking the row opens the details dialog.
3. **Edit support in `MaintenanceRecordModal.tsx`**
   - Add optional `record?: MaintenanceRecord` prop. When present: prefill all fields, title becomes "Edit Maintenance Record", the AI scan button/badges are hidden, and Save performs `update ... eq('id', record.id)` instead of `insert`.
   - Invoice attachment: show the current file as an attached chip with "Replace" and "Remove" actions. Replacing uploads a new file and updates `invoice_file_path`/`invoice_file_name`; removing clears both columns. Old file is deleted from storage on replace/remove.
   - Reuse existing validation and toasts.
4. **Delete support** — Add a small confirm dialog. On confirm, delete the storage file (if any) then delete the DB row, then call `onSaved()`. Restricted to non-`readOnly`.
5. **Eye icon reliability** — In `handlePreviewFile`, surface failures with `toast.error("Couldn't open invoice — please try again.")` when the signed-URL call errors or returns no URL.
6. **Empty-attachment hint** — For rows with no invoice, render a muted "—" in the eye column so it's clear the icon is absent, not broken.

Nothing else in the drawer changes; DOT and Registration/2290 sections are untouched.
