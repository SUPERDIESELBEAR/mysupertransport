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

## Test devices already assigned to a test driver (e.g. serial 1234567 → Craig Pate)

Checked in the database: Craig Pate's operator record is **not** flagged as a demo account, and four fake devices are currently open-assigned to him — ELD 1234567, Dash Camera 1234567, BestPass 1234567 and Fuel Card 200. Because they carry an assignment row, the plain "no history" delete rule would block them, which is why they need their own handling.

Two things to do, in this order:

1. **Flag Craig's test driver record as a demo account** (Driver Hub → the existing demo toggle). Demo drivers are already excluded from live metrics and email, so his devices stop polluting real counts.
2. **Release and delete** the four fake devices. The Delete button gets a second allowed case: if every assignment on the device belongs to demo drivers only, deletion is permitted — it closes the open assignment, clears the serial from that driver's onboarding record, then removes the device. Confirmation text says plainly that this device was only ever held by demo drivers.

Going forward, any device whose only holder is a demo driver is deletable, and real-driver devices remain archive-only. Serial-format rules alone (like a placeholder 1234567) are deliberately not used to decide deletability — the demo flag is the safe signal.

## Technical notes

- `src/components/equipment/EquipmentItemModal.tsx`: add a danger-zone block rendered only in edit mode. Archive path reuses the logic already in `FuelCardDeactivateModal` (close the open `equipment_assignments` row with `return_condition: 'deactivated'`, clear the matching serial field on `onboarding_status` via `DEVICE_FIELD_MAP`, then set `equipment_items.status = 'deactivated'`). Extract it into a shared `archiveEquipmentItem(item)` helper in `src/lib/equipmentSync.ts` so both call sites agree.
- Delete path: count rows in `equipment_assignments` for the item; if zero, `supabase.from('equipment_items').delete().eq('id', item.id)`. The existing RLS policy already limits delete to the `management` role, so gate the button on `isManagement` to match.
- Both actions run through `guardDemo()` and write an `audit_log` entry (`equipment_archived` / `equipment_deleted`) so retirements are traceable.
- `EquipmentInventory.tsx`: relabel the `deactivated` status pill to "Archived", exclude archived items from the `all` filter view (still reachable via the filter chip), and refresh through the existing `onSaved` → `fetchItems`.
- Delete eligibility check: load `equipment_assignments` joined to `operators.is_demo` for the item. Allow delete when there are no assignments, or when every assignment's operator has `is_demo = true`. Before deleting, close open assignment rows and null the matching `onboarding_status` serial field via `DEVICE_FIELD_MAP`; `equipment_assignments` cascades on device delete.
- Devices held by demo drivers should also be excluded from the live section counts in `EquipmentInventory.tsx`, consistent with how demo drivers are hidden elsewhere.