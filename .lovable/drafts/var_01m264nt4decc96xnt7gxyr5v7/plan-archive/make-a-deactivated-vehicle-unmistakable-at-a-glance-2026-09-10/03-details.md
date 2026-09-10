## What gets built

1. **Fix the miss.** A card counts as deactivated when the driver is off the roster, not only when a deactivation date happens to be filled in. This alone restores the existing chip and the orange "off the roster" banner for all 94 deactivated drivers instead of 17.

2. **The watermark.** A soft diagonal "DEACTIVATED" wash across the card, plus a grey card background and the existing corner chip. Faint enough to read the details through it, loud enough that you never mistake the card. Same treatment in the table view as a row tint plus the chip.

3. **Search results say where the matches are.** When a search spans both tabs, a one-line note above the results: "2 matches — 1 active, 1 deactivated." The Active/Deactivated buttons already carry counts; this puts the same fact where your eye already is.

4. **Flag the shared plate.** When the same plate appears on more than one unit, each card says so directly — for example "Plate also on Unit 197 — deactivated". No guessing whether a duplicate is a mistake or a plate that moved trucks.

5. **Record when the missing ones left.** 77 of the 94 deactivated drivers have no departure date on record, so their cards can't say when they came off the roster. Rather than invent dates, the card shows "Date not recorded" with a way for you to set the real one, and the deactivation flow going forward always records it. Anything already known from the offboarding history is offered as the suggested date for you to confirm — never written on its own.

## Technical notes

- `src/components/fleet/FleetRoster.tsx`: `isDeactivated` currently derives from `row.deactivatedAt`; `buildRows` already knows the `is_active` value it queried with, so carry an `isActive` field on `FleetRow` and use that for the badge, the banner condition (lines 649/856) and the reactivate action. `deactivatedAt` stays for date display only.
- New `src/components/fleet/DeactivatedWatermark.tsx`, an SVG overlay in the pattern of `DemoWatermarkOverlay` — `pointer-events-none absolute inset-0`, semantic tokens only; the card wrapper gets `relative`.
- Search summary line renders from the existing `searchMatchCounts` memo.
- Shared plate: computed client-side over the already-loaded active + deactivated rows, keyed on normalised `truckPlate` + `truckPlateState`. No extra query.
- Departure date: no schema change — `operators.deactivated_at` already exists. One explicit human fill at a time through a protected writer (management/owner, actor + note, audited, no overwrite of an existing date, no bulk path), matching the `set_operator_unit_from_fuel_review` pattern. Suggested value read from the existing offboarding/termination history and shown for confirmation only.
- No RLS changes.
