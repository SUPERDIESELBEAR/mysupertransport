# Fix Assignment Sheet Preview Footer Button Layout

## Goal
Correct the footer button layout in the **Onboard Systems Assignment Sheet** preview modal so the secondary actions share one row and the primary action sits alone in the bottom-right corner.

## Current State
The modal footer in `src/components/equipment/SignOffSheetPreviewModal.tsx` is rendering the buttons in the wrong arrangement: `Send to Operator` appears on the same row as `Delete` and `Copy Sign Link`, while `Send Return Instructions` is dropping to a second row on the left.

## Changes
1. **Top row**: keep `Delete`, `Copy Sign Link`, and `Send Return Instructions` together in a single left-aligned row, in that exact order.
2. **Bottom row**: place the gold `Send to Operator` / `Resend` button on its own row, aligned to the bottom-right corner of the modal.
3. Use a flex column layout with `justify-end` on the primary-action row so it cannot wrap up beside the secondary buttons.

## Files to Modify
- `src/components/equipment/SignOffSheetPreviewModal.tsx`

## Verification
- Open an Onboard Systems Assignment Sheet preview.
- Confirm the footer shows `Delete | Copy Sign Link | Send Return Instructions` on one line.
- Confirm the gold `Send to Operator` button is on a separate line below, flush to the right.
