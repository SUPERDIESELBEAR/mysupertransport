# Reposition Assignment Sheet Preview Footer Buttons

## Goal
Rearrange the action buttons at the bottom of the **Onboard Systems Assignment Sheet** preview modal so the layout matches the user's requested order and the primary action sits in the bottom-right corner.

## Current State
In `src/components/equipment/SignOffSheetPreviewModal.tsx`, the `DialogFooter` currently stacks:
- Row 1: `Delete` on the left, then a right-aligned group containing `Copy sign link` and `Send Return Instructions`.
- Row 2: Full-width gold `Send to Operator` / `Resend` button.

## Changes
1. **Single left-to-right row for secondary actions**: place `Delete`, then `Copy Sign Link`, then `Send Return Instructions` in one contiguous row.
2. **Label change**: update `Copy sign link` → `Copy Sign Link`.
3. **Primary action placement**: move the gold `Send to Operator` / `Resend` button to the bottom-right corner of the modal footer instead of a full-width second row.
4. **Responsive safety**: keep buttons from overflowing on small screens by allowing the secondary row to wrap while keeping the primary button right-aligned.

## Files to Modify
- `src/components/equipment/SignOffSheetPreviewModal.tsx`

## Verification
- Open an Onboard Systems Assignment Sheet preview in the management dashboard.
- Confirm the footer shows: `Delete` | `Copy Sign Link` | `Send Return Instructions` in one row, with the gold `Send to Operator` button aligned to the bottom right.
- Confirm the label reads "Copy Sign Link" exactly.
