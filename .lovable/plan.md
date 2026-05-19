## Problem

In the pending action footer of `ApplicationReviewDrawer.tsx`, the two outline buttons "Send back to applicant for corrections" and "Propose changes for applicant approval" overflow their containers and visually bleed into each other. Cause: shadcn `Button` base class includes `whitespace-nowrap` and a fixed `h-10`, so long labels can't wrap inside the narrow flex columns (`min-w-[180px]`) at this drawer width.

## Fix

Pure CSS / class adjustment in `src/components/management/ApplicationReviewDrawer.tsx` (lines ~1224–1253):

1. Allow the two long-label buttons (and Deny for consistency) to wrap:
   - Add `whitespace-normal h-auto min-h-10 py-2 text-left leading-tight` to the className of:
     - "Send back to applicant for corrections" button
     - "Propose changes for applicant approval" button
     - "Deny" button (so heights match in the row)
2. Add `items-start` to the icon area by keeping the existing `mr-2` icon; the icon will stay vertically aligned via flex defaults (button already uses `inline-flex items-center`). Keep icon as `shrink-0`.
3. Bump each column's `min-w-[180px]` to `min-w-[200px]` so wrapping happens on at most 2 lines at typical drawer widths.

No logic, copy, or workflow changes. Labels stay exactly as they are.

## Out of scope

- No changes to button labels, helper text, or workflow behavior.
- No changes to the confirm step or other footer states.
