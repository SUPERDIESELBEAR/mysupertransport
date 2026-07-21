## Problem

In the Vehicle Hub → Repairs & Maintenance table, a record can have an `invoice_file_path` set but the actual file is missing from storage (e.g. upload failed silently, or file was deleted). The eye icon still renders, and tapping it throws a red "Preview failed — Object not found" error.

## Fix

Edit `src/components/fleet/FleetDetailDrawer.tsx` only:

1. **Graceful preview fallback** — In `handlePreviewFile`, detect the "Object not found" / 404 case from Supabase Storage and, instead of a destructive error toast, show a neutral info toast: *"No invoice uploaded for this record."*

2. **Hide the eye when the file is verifiably missing** — Track per-record "missing invoice" state locally. On failed preview (object not found), mark that record's invoice as missing so the eye icon is replaced with the same `—` placeholder used for records with no `invoice_file_path`. Same treatment in the Maintenance Details dialog: swap the "Preview Invoice" button for the existing "No invoice attached" muted text.

3. **Row click behavior** — When there's no valid invoice, the row still opens the Details dialog (unchanged); the dialog just shows "No invoice attached".

No schema, RLS, or storage changes. No changes to Registration/2290 or DOT inspection preview logic.
