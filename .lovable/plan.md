## Root cause

The "new row violates row-level security policy" toast fires on the **`audit_log` insert** at the end of `OperatorOSASSign.handleSign` (src/components/operator/OperatorOSASSign.tsx, lines 175–182), not on the sheet update itself.

Verified from `pg_policies`:
- `onboard_assignment_sheets` has `osas_operator_sign` (UPDATE) with a proper `with_check` allowing the driver to flip `status` from `sent` → `signed` — this call succeeds.
- `onboard_assignment_sheet_items` has `osas_items_operator_confirm` (UPDATE) — succeeds.
- `audit_log` INSERT policy is `is_staff(auth.uid())`. The driver is **not** staff, so their client-side `audit_log.insert(...)` is denied. That's the exact error surfaced by the toast.

## Fix

Move the OSAS-signed audit entry off the client onto a **SECURITY DEFINER trigger** on `onboard_assignment_sheets` so staff still get the audit trail without letting drivers write to `audit_log` from the browser.

### Steps

1. **Migration** — add trigger `trg_audit_osas_signed` on `onboard_assignment_sheets` (AFTER UPDATE) that inserts into `audit_log` when `status` transitions to `'signed'`. Function is `SECURITY DEFINER` with `SET search_path = public`, mirroring the metadata the client was writing (`action='osas_signed'`, `entity_type='onboard_assignment_sheet'`, `entity_id`, `entity_label = 'OSAS ' || unit_number`, `metadata = { operator_id, item_count }` from a count of `onboard_assignment_sheet_items`).

2. **`src/components/operator/OperatorOSASSign.tsx`** — delete the `supabase.from('audit_log').insert(...)` block (lines 175–182). No other change needed; the update at line 164 already succeeds and the trigger handles the log.

## Out of scope

- No changes to existing RLS policies on `onboard_assignment_sheets`, items, or `audit_log`.
- No changes to `send-osas-to-operator` or `delete-osas-sheet` edge functions.
