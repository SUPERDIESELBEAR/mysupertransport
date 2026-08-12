# Onboard Systems Assignment Sheet modal button cleanup

## Goal
Clean up the assignment-sheet preview modal so it no longer has two ways to close, and present the bottom action buttons in a single row.

## Changes

### `src/components/equipment/SignOffSheetPreviewModal.tsx`
1. Remove the redundant **Close** button in `DialogFooter`; keep the dialog's built-in **X** close button.
2. Re-layout the footer into one horizontal row of actions:
   - Left side: **Delete** (outline destructive).
   - Right side, in order: **Copy sign link** (when available), **Send to Operator / Resend** (when available), **Send Return Instructions / Resend Return Instructions**.
3. Use `flex-nowrap` on the footer so buttons stay on a single line, with `gap-2` and `justify-between` / `justify-end` handling spacing. Ensure text labels still fit on typical desktop widths; allow wrapping only at very small viewports if needed.
4. Keep existing confirmation dialog and all action handlers unchanged.

## Verification
- Open the Onboard Systems page in the management dashboard.
- Click **View** on an assignment sheet.
- Confirm the modal has only the **X** close control and no **Close** button.
- Confirm footer buttons appear in one row.
- Confirm Delete, Copy sign link, Send/Resend, and Send Return Instructions still work.
