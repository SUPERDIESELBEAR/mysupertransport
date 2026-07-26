## What the message means

"Operators/truck owners may only self-update decal photos and ELD signature fields on onboarding_status" is **not** a storage/upload problem — the file itself now uploads fine (the earlier folder-path fix worked). This is a **database safety rule firing after the receipt row is saved**.

Chain of events when a driver uploads a receipt:

```text
driver inserts row into equipment_receipts
   -> trigger mark_equipment_return_completed()
        UPDATE onboarding_status SET equipment_return_completed_at = now()
   -> guard triggers on onboarding_status see a NON-STAFF user
        and reject the update -> whole insert rolls back
```

Verified in the database:
- `equipment_receipts` has an AFTER INSERT trigger `mark_equipment_return_completed` that writes `equipment_return_completed_at` on `onboarding_status`, and `notify_staff_on_return_receipt` that stamps `return_completed_at` on the assignment sheet and notifies staff.
- `onboarding_status` has three driver-restriction guards: `enforce_onboarding_status_self_update`, `enforce_onboarding_status_operator_update`, and `enforce_onboarding_status_operator_column_whitelist`. Their allow-lists cover only decal photos, truck photos, ICA status, and ELD signature fields — `equipment_return_completed_at` is not allowed, so the driver-initiated cascade is blocked and the receipt insert fails.

These guards were added deliberately (past security findings) to stop drivers editing onboarding fields, so the correct fix is a narrow, audited exception for this one system-generated column — not loosening the guards.

## Plan

1. Migration: in `mark_equipment_return_completed()` (and, defensively, `notify_staff_on_return_receipt()`), set a scoped session flag `app.equipment_return_receipt = '1'` immediately before the `onboarding_status` / assignment-sheet writes and reset it right after, mirroring the existing `app.ica_sync_cascade` / `app.equipment_asset_signature_execute` pattern already used elsewhere.
2. Same migration: teach the three guard functions to honor that flag — but only for the return-related columns (`equipment_return_completed_at`, and the assignment-sheet `return_completed_at` path). Any other column change stays blocked even with the flag set, so a driver still cannot touch onboarding fields.
3. Keep the triggers SECURITY DEFINER and leave RLS policies untouched — no widening of driver write access.
4. Verify by inserting a return receipt under the driver's own identity (not service role) against the real path, confirming: the receipt row persists, `equipment_return_completed_at` is stamped, the sheet's `return_completed_at` is set, and staff notifications are created.
5. Re-check the driver UI so the success toast and the "Receipt received — staff notified" panel appear, and confirm the error toast no longer shows.

## Technical notes

- No frontend logic changes are expected; `EquipmentReturnCard.tsx` already handles the insert correctly. Only the error-copy fallback may stay as-is.
- The guard message the driver saw is a raw database exception surfaced in the toast; after the fix I'll also make sure any residual unexpected database error shows plain-language text rather than the internal rule wording.
