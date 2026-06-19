## Goal

Make the driver portal's top nav labels visible at all times on laptop screens so drivers don't have to hover each icon to discover what it does.

## Recommendation

Stacked icon-over-label, always visible from `md` upward. This is the strongest UX choice here because:

- The portal has ~13 nav items. Side-by-side icon + text doesn't fit on a 1024–1366px laptop without horizontal overflow or aggressive truncation.
- Stacked labels keep each item compact (icon stays the tap target, label sits under it as a small caption), match common app-bar conventions (Slack, Linear, mobile bottom nav), and remove the hover-to-discover problem entirely.
- It also brings the desktop bar visually in line with the existing mobile bottom nav, which already uses stacked icon + label — so the portal feels consistent across breakpoints.

## What changes

Scope is limited to the desktop nav inside `src/pages/operator/OperatorPortal.tsx` (the `<nav className="hidden md:flex …">` block around the `navItems.map(...)` render). No changes to mobile nav, no changes to behavior, badges, dots, or routing.

### Visual spec

- Each nav button becomes a small vertical stack: icon on top (current `h-5 w-5`), 10–11px label below.
- Labels are always visible from `md` and up — drop the current `hidden 2xl:inline` gate on the label span.
- Header height grows from `h-16` to `h-20` (or `md:h-20`) to comfortably fit two-line buttons without crowding the logo or the right-side controls.
- Active state: keep current gold pill background; label inherits the same gold text color.
- Inactive state: muted label color matching current icon color, hover lifts both icon and label.
- Spacing between items tightens slightly (`gap-0.5` instead of `gap-1`) and per-button horizontal padding drops (`px-2`) so all items fit on a 1280px laptop without scroll.
- Badge dots/pills (`unreadCount`, `unackedRequiredDocs`, ICA dot, expiry dot, `pillBadge`) keep their current absolute positioning relative to the icon — they continue to anchor on the icon, not the label.
- Keep the existing tooltip wrapper only for the expiry-warning case (where the tooltip carries extra detail). Remove the redundant `aria-label`-only tooltip behavior — the visible label is now the accessible label.

### Overflow safety

If the full set still doesn't fit at 1024–1180px on screens with the back button visible, shrink the per-button label to a 1-line max with `truncate` and a `max-w-[72px]`. Items like "Inspection Binder" and "Settlement Forecast" get short forms ("Binder", "Forecast") at `md`/`lg` and full names at `xl+`, mirroring how the mobile bar already uses short labels.

## Out of scope

- No changes to which items appear, their order, badges, or click behavior.
- No changes to mobile bottom nav.
- No changes to the preview tab bar (used only in staff "Preview as Operator" mode).
- No theme/token changes — uses existing `gold`, `surface-dark-*`, and `muted` tokens.
