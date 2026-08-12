# Restack assignment sheet preview footer into two rows

## Change

In the Onboard Systems Assignment Sheet "View" modal, change the bottom action buttons from a single horizontal row into two stacked rows:

- Top row: **Delete** (left), **Copy sign link**, **Send Return Instructions / Resend Return Instructions** (right group).
- Bottom row: the gold **Send to Operator** button (when available) or **Resend** button, centered or full-width as appropriate.

## Technical detail

In `src/components/equipment/SignOffSheetPreviewModal.tsx`:

1. Replace the single `DialogFooter` flex row with a vertical stack (`flex-col`) of two button rows.
2. Top row keeps `justify-between` with Delete on the left and the remaining outline buttons grouped on the right.
3. Bottom row holds the primary gold action alone, using the existing `canResend` logic and loading state.
4. Preserve all existing click handlers, confirmation dialog, disabled/loading states, and status-aware labels (`Send to Operator` vs `Resend`).
5. Keep the modal's built-in **X** close button; no Close button is added.

## Verification

- Open Onboard Systems → Assignment Sheets → View on a draft sheet.
- Confirm the footer shows Delete, Copy sign link, and Send Return Instructions on the top row, with Send to Operator on its own row below.
- Repeat on a sent sheet and confirm the bottom row reads Resend and the top-row labels remain correct.
- Confirm all buttons still trigger their existing actions.
