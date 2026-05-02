## Goal
In Stage 5 (Equipment Setup) of the Onboarding Pipeline, swap the order of the two Fuel Card fields so the **Fuel Card Number** input appears **before** the **Fuel Card Issued** Yes/No select. This avoids the auto-collapse problem: today, choosing "Yes" on Fuel Card Issued can trigger the auto-collapse logic before the user has a chance to enter the card number, forcing them to re-open Stage 5.

## Where
Single file: `src/pages/staff/OperatorDetailPanel.tsx`, in the "Fuel Card" subsection of Stage 5 (around lines 5297–5318).

## Change
Within the `{/* Fuel Card */}` block, render the **Fuel Card Number** input first, then the **Fuel Card Issued** select. No logic changes — just the visual/DOM order of the two `<div className="space-y-1.5">` blocks is flipped.

```text
Before:                          After:
Fuel Card                        Fuel Card
  ├─ Fuel Card Issued [Select]     ├─ Fuel Card Number [Input]
  └─ Fuel Card Number [Input]      └─ Fuel Card Issued [Select]
```

## Why this fixes the collapse problem
The auto-collapse on the "Fuel Card Issued" select fires only when **all** Stage 5 fields (decal, ELD, device serials, BestPass, **and fuel_card_number**) are already populated. By forcing the user to fill the Fuel Card Number first, when they then select "Yes" the stage will legitimately be complete and the collapse becomes the desired behavior rather than a premature one.

## Out of scope
- No changes to the operator-side display order (`OperatorPortal.tsx`) unless you want it to match — say the word and I'll mirror it there too.
- No changes to validation, save logic, or the auto-collapse conditions themselves.
