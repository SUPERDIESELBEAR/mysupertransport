# Clean up Vehicle Hub list-view action buttons

## Goal
Restyle the **Actions** column in the Vehicle Hub list view so the current five buttons (Truck photos, Decal photos, Edit truck specs, Log update, More actions) read as one clean, consistent toolbar instead of a scattered mix of icon-only and text controls.

## Current state
- List view renders actions as a `flex-wrap` row of `h-7 w-7` ghost/outline icon buttons.
- For deactivated rows, a labeled **Reactivate** button is inserted mid-row, breaking the icon-only rhythm and adding variable width.
- The row has no visual grouping, so disabled photo icons and active icons sit at the same visual weight.
- The column currently wraps on narrow viewports.

## Proposed changes

1. **Unified icon toolbar**
   - Wrap all actions in a single compact container with equal spacing and a shared hover/background treatment.
   - Use the same icon size, button height, and border radius for every action.
   - Keep the existing order: Photos → Edit → Log Update → More.

2. **Combine truck and decal photos into one Photos button**
   - Replace the separate Truck and Decal icons with a single **Camera/Photos** icon that opens a combined photo viewer.
   - The combined viewer keeps the existing Truck and Decal photo viewing functionality (no new data flow), just surfaced from one entry point.
   - If either photo set exists, the icon uses the gold active state; if neither exists, it is muted/disabled with a tooltip.

3. **Icon-only Reactivate for deactivated rows**
   - Replace the labeled Reactivate text button with a consistent `RotateCcw` icon in the same toolbar, using the primary gold color and a tooltip.
   - This keeps deactivated rows at the same column width as active rows and avoids mid-row size jumps.

4. **Tooltips / title attributes**
   - Add explicit `title` attributes to every icon so hover reveals the action name: "Photos", "Edit truck specs", "Log update", "More actions", "Reactivate unit".

5. **Responsive guardrails**
   - Keep the actions column from wrapping: `flex-nowrap` inside the toolbar, with the column allowed to stay at its natural width.
   - Do not change the table layout outside the Actions column.

## Scope
- Single file: `src/components/fleet/FleetRoster.tsx`
- Only the list/table view branch (`viewMode !== 'cards'`), around lines 832–927.
- No database, auth, or business-logic changes.
- The card view remains untouched.

## Verification
After the change, verify the list view renders a single compact icon toolbar per row, that deactivated rows no longer show a text Reactivate button, and that clicking Photos opens the existing truck/decal photo modals.
