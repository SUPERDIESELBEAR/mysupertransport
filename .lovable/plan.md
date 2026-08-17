# Type-to-search driver picker everywhere

## What changes
The plain dropdown for picking a driver becomes a searchable box: click it, start typing a name or unit number, and the list narrows instantly. No more scrolling a long list.

Behavior:
- Type letters of a first or last name, or type a unit number (e.g. `243`) — both match.
- Each row shows the driver name with the unit number beside it when known.
- Sorted by last name.
- Only active drivers are listed by default, with a small "Show inactive" toggle inside the dropdown to reveal everyone else.
- Keyboard friendly: arrow keys + Enter, Escape to close.

## Where it applies
- Onboard Systems - Assign Device to Operator (the screen in the screenshot)
- Onboard Systems - Create Assignment Sheet (already a combobox; gains unit search + active toggle)
- Inspection Binder driver pickers (share to driver, bulk share, per-document)
- Any other single-driver dropdown found during implementation

Multi-select lists that already have their own search bar (e.g. Launch Superdrive) are left as-is.

## Technical detail
Extend the existing `src/components/inspection/DriverCombobox.tsx` and move it to a shared location (`src/components/shared/DriverCombobox.tsx`, re-exported from the old path so current imports keep working):

- Option shape gains optional `unitNumber?: string | null` and `isActive?: boolean`.
- `CommandItem` `value` becomes `"<name> <unit> <id>"` so the built-in substring filter matches unit numbers; render name plus a muted `Unit 243` on the right.
- Internal `showInactive` state; list filters to `isActive !== false` unless toggled. Toggle rendered as a footer row in the popover, hidden when every option is active. If the currently selected driver is inactive it stays visible/selected.

Call sites:
- `EquipmentAssignModal.tsx`: replace the `Select` with `DriverCombobox`; extend `fetchOperators` to select `is_active, unit_number, onboarding_status(unit_number)` and resolve unit as `onboarding_status.unit_number ?? operators.unit_number` (matches the existing Onboard Systems unit resolution).
- `CreateSignOffSheetModal.tsx`: it already fetches `unit_number` and filters `is_active = true` — drop the `.eq('is_active', true)` filter, pass `unitNumber` and `isActive` through so the toggle works.
- `InspectionBinderAdmin.tsx`: pass `unitNumber`/`isActive` where the operator query already has them; otherwise options behave as today.

No database or backend changes.

## Verify
Open Onboard Systems, click Assign on a device, type a few letters of a driver's last name and then a unit number — both should filter the list; confirm the inactive toggle reveals additional drivers.
