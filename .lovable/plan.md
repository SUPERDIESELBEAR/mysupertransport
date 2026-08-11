# Archive or delete devices in Onboard Systems

Today the Edit Device window only lets you change type, serial, status and notes. There is no way to retire a device or remove a test entry. This adds both, with clear rules about which one to use.

## The two options

**Archive (retire)** — keeps the device and its full assignment history, but pulls it out of the working list. Use for real hardware that is lost, damaged beyond use, or returned to the vendor. Archived units stop showing in the default view and cannot be assigned again unless restored.

**Delete permanently** — wipes the record entirely. Only offered for devices that were never assigned to anyone (typical of test entries), and only for management. If a device has any assignment history, the delete button is disabled with a note: "This device has assignment history — archive it instead."

## What you'll see

In the Edit Device window (ELD, Dash Camera, BestPass, Fuel Card), a "Danger zone" section at the bottom:

- **Archive device** — asks for an optional reason, closes any open assignment, and sets the device to Archived. Shown for any non-archived device.
- **Restore device** — replaces Archive when the device is already archived; puts it back to Available.
- **Delete permanently** — red, management only, with a type-the-serial confirm step. Disabled when history exists.

Deactivated devices read as "Archived" in the status pill, and are hidden from the default list unless you pick the Deactivated/Archived filter chip (that filter already exists).

## Suggested policy

- Lost / Not Returned and Damaged / Needs Replacement: leave in that status while it's being chased, then Archive once written off. The "last held by" line and history stay intact for accountability.
- Test serials you created: Delete permanently, since they have no history.
- Never delete a unit that was ever assigned to a driver — assignment sheets and return receipts reference it.

## Technical notes

- `src/components/equipment/EquipmentItemModal.tsx`: add a danger-zone block rendered only in edit mode. Archive path reuses the logic already in `FuelCardDeactivateModal` (close the open `equipment_assignments` row with `return_condition: 'deactivated'`, clear the matching serial field on `onboarding_status` via `DEVICE_FIELD_MAP`, then set `equipment_items.status = 'deactivated'`). Extract it into a shared `archiveEquipmentItem(item)` helper in `src/lib/equipmentSync.ts` so both call sites agree.
- Delete path: count rows in `equipment_assignments` for the item; if zero, `supabase.from('equipment_items').delete().eq('id', item.id)`. The existing RLS policy already limits delete to the `management` role, so gate the button on `isManagement` to match.
- Both actions run through `guardDemo()` and write an `audit_log` entry (`equipment_archived` / `equipment_deleted`) so retirements are traceable.
- `EquipmentInventory.tsx`: relabel the `deactivated` status pill to "Archived", exclude archived items from the `all` filter view (still reachable via the filter chip), and refresh through the existing `onSaved` → `fetchItems`.