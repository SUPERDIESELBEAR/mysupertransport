# Fix operator header overlap (round 2)

## Root cause

At 1023px the desktop nav at `OperatorPortal.tsx:954` (`hidden md:flex`) renders all 10+ items with full labels. Total width of labels + icons + logo + avatar cluster exceeds the viewport, so the nav wraps/spills under the logo. Widening the container and shrinking the logo wasn't enough because the label text itself is what overflows.

## Fix

Make the desktop top-nav icon-only with tooltips for laptop widths, and only show labels on extra-wide screens where everything fits comfortably.

### `src/pages/operator/OperatorPortal.tsx` (nav block ~line 954-1011)

- Wrap each button in a `Tooltip` (TooltipProvider already imported on line 955) so the label is shown on hover.
- Render the text label conditionally: `<span className="hidden 2xl:inline">{item.label}</span>`. At <1536px only the icon shows; at 2xl+ the full label appears too.
- Add `whitespace-nowrap` and `shrink-0` to each nav button so they never wrap or compress into the logo.
- Keep the existing badges, dots, and `pillBadge` rendering — they already sit on the icon.
- Leave the mobile bottom nav (`md:hidden`) untouched; mobile users keep the existing experience.

No changes to logo sizing, container width, badges, or any other component.

## Verification

- Reload `/operator` at 1023px, 1280px, and 1536px — confirm the logo never overlaps the first nav item and all nav icons stay on one row.
- Hover each icon to confirm the tooltip shows the label.
- Confirm mobile (<768px) still uses the bottom nav unchanged.
