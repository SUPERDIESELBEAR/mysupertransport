## Problem
On the PEI tab, the header row has three buttons (Refresh, Add Previous Employer, Auto-build from employment history) in a single non-wrapping flex row. In the narrower PEI drawer the last button overflows and forces a horizontal scrollbar.

## Fix
Small, presentation-only change in `src/components/pei/ApplicationPEITab.tsx` (the header block around lines 261–278):

1. Allow the header to wrap: change the outer `flex items-center justify-between` to `flex flex-wrap items-center justify-between gap-3`, and add `flex-wrap` + `gap-2` to the button group so buttons drop to a second line before overflowing.
2. Shorten the long button's label from **"Auto-build from employment history"** to **"Auto-build"**, and add a `title="Auto-build from employment history"` tooltip so the meaning is preserved on hover.
3. Keep the `+` icon and the loading spinner behavior unchanged.

No logic, data, or other components change.

## Result
- On wide screens: all three buttons sit on one line, just shorter.
- On the drawer / narrow screens: buttons wrap cleanly under the title with no horizontal scrollbar.