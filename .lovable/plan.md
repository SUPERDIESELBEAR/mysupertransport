# Fix MO Plate Registry Off-By-One Date Display

## Root cause

Not a data mismatch. The database `mo_plates.expires_at` is `2027-06-30` (correct, in sync with Driver Hub). `MoPlateRegistry.tsx` renders it with `format(new Date(plate.expires_at), ...)`. `new Date('2027-06-30')` parses as UTC midnight, which in US Central time becomes **June 29, 2027** — the classic project timezone bug covered by the "Local Midnight Dates" core rule (append `T12:00:00` to anchor at noon).

`MoPlateFormModal.tsx` also uses the raw `YYYY-MM-DD` string in its date input, which is fine — the bug is display-side only.

## Fix

In `src/components/mo-plates/MoPlateRegistry.tsx`, wrap every `new Date(plate.expires_at)` with a noon-anchored parse:

- Add a tiny local helper `parseLocalDate(s: string) => new Date(`${s}T12:00:00`)`.
- Replace the five sites (lines 24, 32, 467, 522, 524, 525) so both the day-count math and the `format(...)` output use the noon-anchored Date.

No schema, trigger, or two-way-sync work needed — the previously-shipped Driver Hub → MO Plate trigger is already keeping the underlying values equal; only the display was lying.

## Verification

- Reload MO Plate Registry: plate now reads `Jun 30, 2027`, matching Driver Hub.
- "Expires in Nd" pill still shows the correct day count.
