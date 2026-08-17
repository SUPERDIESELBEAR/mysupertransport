# Fix ICA "Download Review Copy" Button Overflow

## Problem
In the Forms Catalog ICA card, the two action buttons sit in a `grid-cols-2` layout. The left button's label, "Download Review Copy," is too long for its half-width cell and visually bleeds past the card edge (see screenshot).

## Proposed Fix
Update `src/components/management/IcaReviewActions.tsx` so the button row respects the parent width:

1. Keep the two-column grid on wider containers, but make each cell `min-w-0` so the grid can shrink below the intrinsic button width.
2. Apply `truncate` to the button text so long labels clip with ellipsis instead of overflowing.
3. Add a small gap and ensure buttons use `w-full` so both cells share space evenly.
4. On very narrow widths (e.g., small modals or mobile), fall back to a stacked vertical layout so labels remain readable.

## Verification
Open the Forms Catalog, click the Independent Contractor Agreement card, and confirm both buttons stay inside the card boundaries without clipping or breaking onto extra lines.
