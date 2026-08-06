# Onboarding Pipeline — Phone Column Spacing

## Problem
The Phone column in the Onboarding Pipeline table is visually condensed, making phone numbers hard to read. There appears to be unused horizontal room immediately to the right of the Name column that can be reclaimed for the phone number column.

## Proposed changes

1. **Reclaim space from the Name column**
   - Reduce the natural width of the Name cell by removing any implicit max-width / truncation constraints that force it to take more room than needed, letting the table layout distribute more width to the Phone column.

2. **Give the phone column a guaranteed minimum width**
   - Set `min-w-[160px]` and `whitespace-nowrap` on the phone `<th>` and `<td>` in `src/pages/staff/PipelineDashboard.tsx` so a fully formatted 10-digit number has enough room without wrapping.

3. **Keep the table responsive**
   - Preserve the existing `hidden md:table-cell` responsive behavior so the column still hides on small screens.
   - Leave the horizontal scroll container (`overflow-x-auto`) in place so the table can scroll gracefully on narrower viewports.

## Files touched
- `src/pages/staff/PipelineDashboard.tsx`: phone column `<th>` (around line 2708) and `<td>` (around line 3156). Review the Name cell at line 3035 to ensure it is not forcing extra width.

## Validation
- TypeScript check.
- Visual check that phone numbers display without wrapping or truncation and that the Name column still looks comfortable.

