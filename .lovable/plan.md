# Onboarding Pipeline — Phone Column Spacing

## Problem
The Phone column in the Onboarding Pipeline table is visually condensed, making phone numbers hard to read.

## Proposed changes

1. **Prevent phone numbers from wrapping**
   - Apply `whitespace-nowrap` to the phone `<th>` and `<td>` cells in `src/pages/staff/PipelineDashboard.tsx` so formatted numbers (e.g., (555) 123-4567) never break across lines.

2. **Give the phone column a guaranteed minimum width**
   - Set a `min-w-[140px]` on the phone column header and cells so it always has enough room for a full 10-digit formatted number, even when other columns grow.

3. **Keep the table responsive**
   - Preserve the existing `hidden md:table-cell` responsive behavior so the column still hides on small screens.
   - Leave the horizontal scroll container (`overflow-x-auto`) in place so wider screens don't force horizontal scrolling while smaller screens can still scroll.

## Files touched
- `src/pages/staff/PipelineDashboard.tsx`: phone column `<th>` (line ~2708) and `<td>` (line ~3156).

## Validation
- TypeScript check.
- Visual check that phone numbers display without wrapping or truncation.
