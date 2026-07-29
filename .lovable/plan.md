## What the 3-dot menu is for

The kebab (⋮) button in the top-right of the inspection binder overlay is an **Actions menu** (a Radix `DropdownMenu` in `src/components/inspection/BinderFlipbook.tsx`, around line 415). It's intended to expose sharing and bulk-selection tools that don't fit on the top bar.

When it works, tapping it opens a dropdown with:

**Default mode**
- Email this page (emails a share link for the current document)
- Text this page (opens SMS with the share link)
- Show QR code (renders a QR of the current page's share link)
- — divider —
- Email all docs (emails links for every document in the binder)
- Select multiple (enters multi-select mode so the driver can pick specific pages)
- — divider —
- Switch to List View (same as the "List View" chip on the left)

**Select-multiple mode** (after tapping "Select multiple")
- Email selected (N)
- Text selected (N)
- Cancel selection

Share actions require a `shareToken` on the document; if a page has no token yet, its item is disabled but the menu still opens.

## Why it appears broken

The trigger button lives inside a `fixed inset-0 z-[100]` full-screen overlay. Radix's `DropdownMenuContent` renders in a portal at the document body, which by default sits below that overlay's stacking context, so the popup opens but is painted underneath the binder — looking like "nothing happens." (This is the same class of bug we've hit before with modals over fixed overlays.) There may also be a pointer-events / focus-trap interaction with the overlay swallowing the outside click.

## Plan

1. Confirm the root cause by reading the full `BinderFlipbook.tsx` (trigger, portal usage, overlay z-index) and the shared `DropdownMenuContent` wrapper in `src/components/ui/dropdown-menu.tsx` to see its default `z-` class.
2. Fix the stacking so the menu is visible above the `z-[100]` binder overlay — either by passing a higher `z-` class to `DropdownMenuContent` (e.g. `z-[110]`) or by rendering it non-portalled inside the overlay. Prefer the z-index bump to avoid layout regressions elsewhere.
3. Verify each menu action still wires to its handler (`shareCurrentEmail`, `shareCurrentText`, `setShowQR`, `shareAllEmail`, `setSelectMode`, `onClose`, and the selected-mode equivalents) — no logic changes expected, just make sure nothing regressed after the fix.
4. Sanity-check on the mobile viewport used in the screenshot (iOS Safari, ~390px) that the menu opens on tap, closes on outside tap, and that "Show QR code" and "Select multiple" both work end-to-end.

## Out of scope

- No changes to what the menu does or which items appear.
- No redesign of the binder top bar.
