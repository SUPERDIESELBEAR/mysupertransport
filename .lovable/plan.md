

## Fix Application Print — Show All Pages

### Problem
The print button in the Application Review Drawer calls `window.print()` directly, but the drawer is inside a `fixed inset-0` container with `overflow-hidden` and `h-full`. The browser's print engine only captures the visible viewport area, cutting off all content below the fold.

### Solution
Add `@media print` CSS rules that:
1. Hide the backdrop, header bar, and action footer
2. Remove the fixed positioning, overflow clipping, and height constraints from the drawer
3. Let the scrollable content area flow naturally so the browser paginates it across multiple pages
4. Hide non-printable UI elements (buttons, badges, icons)

### Technical Details

| File | Change |
|------|--------|
| `src/index.css` | Add `@media print` block with rules to unclip the drawer and hide chrome |
| `src/components/management/ApplicationReviewDrawer.tsx` | Add `print:` utility classes to key containers and a `print-content` identifier to the scrollable area |

**Key print CSS rules:**
- The fixed backdrop → `display: none`
- The drawer container → `position: static`, `overflow: visible`, `height: auto`, `max-width: 100%`
- The scrollable content area → `overflow: visible`, `height: auto`
- Header/footer bars → `display: none` (or minimal header with name only)
- `@page` → letter size with reasonable margins

This approach keeps the existing `handlePrint` → `window.print()` flow and avoids cloning or DOM manipulation — the browser handles pagination naturally once the overflow constraints are removed.

