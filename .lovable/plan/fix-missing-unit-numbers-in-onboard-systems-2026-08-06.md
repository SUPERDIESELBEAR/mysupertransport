# Fix missing unit numbers in Onboard Systems

## What's wrong
The unit number display was wired to the wrong source. Assigned rows/cards read the unit number from the operator record, but that field is empty for every driver — the real vehicle/unit number is stored on the driver's onboarding record. A database check confirms: every operator with an open device assignment has a blank operator unit number while the onboarding record holds the actual unit (e.g. 243, 248, 257).

## The fix
Pull the unit number from the driver's onboarding record instead, with the operator field as a fallback if it is ever filled in. No UI changes needed — the "Unit 243 · Jane Doe" formatting, per-section search matching, and Assigned sorting already exist and will start working once the value is populated.

## Technical detail
In `src/components/equipment/EquipmentInventory.tsx`, the open-assignment query embeds `operators(unit_number, ...)`. Extend the embed to also select `onboarding_status(unit_number)` and resolve `unitNumber` as `onboarding_status.unit_number ?? operators.unit_number ?? null` when building `assignmentMap`. Everything downstream (`current_unit_number` in table rows, cards, search, sort tiebreak) stays as-is.

## Verify
Open Onboard Systems in card and table view and confirm assigned devices show "Unit <number>" beside the driver name, and that searching a unit number inside a section finds the device.