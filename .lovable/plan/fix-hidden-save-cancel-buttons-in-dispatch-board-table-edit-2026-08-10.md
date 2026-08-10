# Fix hidden Save / Cancel buttons in Dispatch Board table-edit mode

## Bug
In the Dispatch Board table view, when a row enters inline edit mode, the **Save** and **X** (Cancel) buttons are pushed to the far right of the actions column and can be hidden off-screen. The user can only see a clipped Save button; the Cancel button is not visible.

## Root cause (verified)
- The table wrapper uses `overflow-x-auto`, so the row can scroll horizontally.
- The actions column header is fixed to `w-24` (6 rem), but the non-edit row fills it with 5 labeled actions (Call, Message, Binder, Decals, Edit) which already overflow that width.
- When a row enters edit mode, the Status, Dispatcher, and Notes columns become wider inputs, increasing the total row width and pushing the rightmost actions further off-screen.
- The Save/Cancel controls are not given a guaranteed visible area, so they render outside the viewport and are effectively hidden.

## Fix
1. **Make the actions column sticky on the right**
   - Apply `sticky right-0` to the last `<th>` and every last `<td>` in the table body.
   - Add a background (white for normal rows, muted/gold for hover/edit states) so the sticky column visually overlays the scrolling content.
   - Add a left border/shadow to separate the sticky column from the scrolling row.

2. **Right-size the actions column**
   - Change the header from `w-24` to `w-40 min-w-[10rem]` to comfortably hold the Save + Cancel buttons.
   - Prevent the action buttons from wrapping: keep the action group as `flex-nowrap`.

3. **Make edit controls compact**
   - Keep the existing Save and Cancel button sizes but ensure they sit inside the sticky column without overflow.
   - If needed, replace the Cancel label with just the `X` icon during edit to save horizontal space.

## Scope
- Single file: `src/pages/dispatch/DispatchPortal.tsx`
- Table view branch only (`viewMode === 'table'`), around the header (lines 1974–1993) and the last data cell (lines 2187–2289).
- No card view, no data logic, no API changes.

## Verification
After the change, open Dispatch Board in table view, click Edit on any row, and confirm both the Save and X (Cancel) buttons remain fully visible even on narrower viewports, without requiring horizontal scrolling.
