## What the dialog looks like

Same "This one is correct" button per record. The dialog then gains a serial choice:

- Two radio rows, one per candidate serial, each rendered with the look-alike character highlighted (existing `SerialDiffText`), labelled with which record it came from.
- Pre-selected to the surviving record's own serial, so the current behaviour is the default and nothing changes for straightforward pairs.
- A third option, "Neither — type the correct number", revealing an input. It normalizes on entry (uppercase, no dashes) and blocks a value that collides with another active device of the same type.
- When the chosen serial differs from the survivor's, the dialog body says plainly: "Huddleston keeps this device, and the number on his record is corrected from X to Y."

## Technical

- `src/components/equipment/SerialConflictsPanel.tsx`: add `chosenSerial` state alongside `pending`, reset each time a survivor is picked. Radio group + optional text input. Confirm passes the chosen serial through.
- `src/lib/equipmentSync.ts`: `mergeEquipmentItems(survivor, loser, opts?: { correctedSerial?: string })`. When a corrected serial is supplied and differs from `survivor.serial_number`, update `equipment_items.serial_number` on the survivor *before* deleting the loser (so the loser's row does not block the confusable-serial trigger), then write the survivor's open assignment holder's `onboarding_status` device field to the corrected value. Record `serial_corrected_from` / `serial_corrected_to` in the existing merge audit entry.
- Validation reuses `canonicalSerial` / `assertAssignable` so a typed correction cannot collide with a third device. The staged confusable-serial DB trigger already backstops this.

No schema change, no RLS change.

## Verify

On the McMillan / Huddleston dash camera pair: pick Huddleston's record, choose McMillan's serial, confirm. Huddleston's assignment stays open, his onboarding dash camera field and the inventory record both read the corrected number, McMillan's duplicate is gone, and the audit entry shows both the merge and the serial correction.
