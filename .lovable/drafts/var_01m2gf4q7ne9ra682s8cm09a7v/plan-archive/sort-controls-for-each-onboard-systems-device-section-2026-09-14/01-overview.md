# Sort controls for each Onboard Systems device section

## Current state
Each device section (ELD, Dash Camera, BestPass, Fuel Card) uses one fixed order:
Assigned first (A–Z by driver name, then unit number), then Available by serial,
then Damaged, Lost, Deactivated. There is no way to re-sort — only the per-section
search narrows the list.

## What I'll build
A compact sort control in each section's toolbar (next to the existing section
search and Add button), offering:

- **Default** — today's status-ranked order (unchanged when nothing is chosen)
- **Driver name** — A–Z by assigned driver's name; unassigned devices after
- **Unit number** — numeric by unit; devices with no unit after
- **Serial / Card #** — alphanumeric by serial number (fuel card number for cards)

The choice is per section (sorting ELDs by unit doesn't touch the Dash Camera
section), works in both table view and card view, and combines with the section
search and the global status chips exactly as today.

The Fuel Card section keeps its Assigned / Unassigned / Not Returned / Deactivated
sub-groupings; the chosen sort applies inside each sub-section.

## Deliberately not included
- No status-based re-sorting as a selectable option — the status order is a safety
  feature (damaged/lost visible), and Default already covers it.
- No saved/persisted sort preference across sessions — say the word and it can use
  the same per-user view-preference storage as other lists.
