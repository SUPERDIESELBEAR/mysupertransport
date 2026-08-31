## What changes

**1. Honest date label (display only)**

In `EquipmentInventory.tsx`, the "Last held by … · returned <date>" line reads `assignment.returned_at`. Also carry `return_condition` into `lastAssignmentMap`, then label the date:

- `return_condition` present → "returned <date>" (unchanged).
- `return_condition` null → "unassigned <date>".

Same wording applied in `EquipmentHistoryModal.tsx` so the history strip agrees.

**2. Stop the note from restating the status**

- Display: on the compact row and the card in `EquipmentInventory.tsx`, suppress the note when its text matches the status wording (a small normalized comparison against the "Not Returned" / "Damaged" option descriptions). Prevents the contradiction reappearing if someone pastes it again.
- Input: in `EquipmentReturnModal.tsx`, the notes box placeholder becomes "Optional detail — the status is already recorded", so it isn't read as "type the reason here".

**3. Data corrections (live database, one-off)**

- Clear the note "Was not returned by the operator." on the five ELDs that carry it: `AABL36NF093301`, `AABL36UF013493`, `AABL36UG024841`, `AABL36UG025171`, `AABL36YG100586`. The red Not Returned badge already conveys it.
- Move the "Justin Herr" note: remove it from `AABL36UF013511` (Christopher Hickman's device) and, since Herr's device `AABL36UG024841` is already correctly linked to his assignment, leave that device's note empty rather than re-typing his name.

These are writes to the live shared database and are not undone by discarding the draft — I will run them only after you approve this plan.

## Also found, not fixed here

`AABL36YG100586` has three closed assignment rows, two of them stamped at the identical instant 2026-07-24 20:06:42 (one Tyler Walls, one Bilal Leggett) plus an open Leggett row. That looks like a double-write in the reassign path. Say the word and I'll investigate it as its own item.

## Not changing

Device statuses, assignment rows, `return_condition` values, the Not Returned wording, or any RLS/schema.
