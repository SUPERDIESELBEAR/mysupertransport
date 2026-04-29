# Improve Exit Navigation from 3-Ring Binder

Make it obvious how to return to the List view while inside the flipbook, so an operator under roadside pressure never has to hunt for it.

## Changes to `src/components/inspection/BinderFlipbook.tsx`

### 1. Replace the unlabeled "X" with a labeled close control
Swap the icon-only close button (top-left of the top bar) for a compact button that reads **"List View"** with a left-chevron icon (`ChevronLeft`). This makes the destination explicit instead of relying on the ambiguous "X" metaphor.

- Keep the same `onClose` handler — no behavioral change, just clearer affordance.
- Use a small ghost-style button so it stays visually quiet but readable.
- Keep `aria-label="Close binder and return to list view"` for accessibility.

### 2. Add a redundant menu entry
In the meatball (⋮) dropdown, append a final item at the bottom of the **non-select-mode** branch:

- Divider, then **"Switch to List View"** with a `List` icon, calling `onClose`.

This gives operators a second discoverable path even if they have the menu open mid-share.

### 3. No changes to share flow
Email / SMS / QR sharing already lives inside the binder, so nothing about the share UX changes. The new label simply reassures users that leaving the binder is one tap away if they ever want the classic list.

## Technical notes
- Import `List` from `lucide-react` alongside the existing icons (`ChevronLeft` is already imported).
- Keep the button compact (`h-9 px-2.5`, `text-xs font-medium`) so the top bar still fits the page title and expiry badge on narrow phone widths (≤375px).
- No state, props, or parent contract changes.

## Out of scope
- No changes to `OperatorInspectionBinder.tsx` (the parent already renders the List view when the flipbook closes).
- No changes to keyboard shortcuts (Escape still closes).
