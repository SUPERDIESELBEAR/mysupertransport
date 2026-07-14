# Align icon/number/label position in Management Overview stat cards

## Problem

On the Management Overview page, the six top metric cards visually disagree:

- **"In Onboarding"** and **"Active Drivers"** cards use a `<div role="button">` wrapper — content (icon → number → label → badges) sits flush against the **top** of the card.
- **"Pending Applications"**, **"Active Dispatch"**, **"Alerts"**, and **"Critical Expiries"** cards use a native `<button>` element. Browsers apply an implicit `display: flex; align-items: center; justify-content: center` to `<button>` internals, so their content is **vertically centered** in the taller row.

Because the badge-heavy cards stretch the grid row height, the four center-aligned cards end up with an awkward empty band above the icon and their number/label pushed toward the middle — while the two div-based cards sit crisp at the top. That's the visual misalignment the user is describing.

## Fix

Force all six cards to use the same top-aligned column layout so the icon, number, and label land in the exact same position across every card, regardless of whether badges are present below.

In `src/pages/management/ManagementPortal.tsx`, add `flex flex-col items-start` to the container class of each of the six metric cards (lines ~940, ~969, ~1036, ~1144, ~1156, ~1168):

```
border rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow text-left group bg-white border-border flex flex-col items-start
```

This overrides the native `<button>` centering, guaranteeing every card's icon sits at the top-left corner, followed by number, then label, with any badges (or empty space) trailing below. No other styling, sizing, or behavior changes.

## Technical notes

- Purely a class-list change on 6 existing elements; no new components, props, or state.
- No changes to the badge sections, click handlers, tooltips, or Fleet Status / Compliance sections below.
- Works on mobile (2-col), tablet (3-col), and desktop (6-col) grids since the fix is per-card, not grid-level.
