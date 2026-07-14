# Driver Hub — Submitted Application scroll + top Collapse/Expand icon

Two small fixes in `src/pages/staff/OperatorDetailPanel.tsx` and `src/components/management/SubmittedApplicationSnapshot.tsx`.

## 1. Submitted Application expands upward

Today, when a staff member opens **Onboarding History → Submitted Application** at the bottom of the driver profile, the section's header stays put while its content expands downward. Because the header already sits near the bottom of the viewport, the newly-revealed content appears below the fold and the user has to scroll down to read it — and worse, when the section is very tall the header itself scrolls out of view, giving the impression it "expanded upward."

**Fix:** When the user expands the Submitted Application snapshot, smoothly scroll the section header to the top of the scroll container so the section reads naturally from its title downward.

- In `SubmittedApplicationSnapshot.tsx`, add a `ref` on the outer card and, in the expand click handler, call `ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })` on the next tick (after the `expanded` state flips so the content is rendered and the layout is final).
- Only scroll on expand (not on collapse).

## 2. Top-of-page Collapse/Expand All icon does nothing

There are currently three "Collapse/Expand all stages" controls on the driver detail page:

- **A.** Icon-only button in the top action bar (top of page).
- **B.** Labeled "Collapse All / Expand All" button next to the stage-status dot strip.
- **C.** Icon-only button in the sticky header that appears when you scroll.

Control **A** appears broken because in **Quick View** the stage cards themselves are hidden until the user opens **Onboarding History**. Clicking A flips the internal `collapsedStages` state, but nothing on screen changes because the stages are still gated by the Onboarding History toggle.

**Fix:** Remove control **A**. It is redundant with **B** (which is co-located with the stage dots users actually reach for) and **C** (which follows the user on scroll). Removing it eliminates the confusing no-op and cleans up the crowded top action bar.

- Delete the icon-only Collapse/Expand block in `OperatorDetailPanel.tsx` (the `Tooltip` wrapping the `ChevronDown / ChevronUp` button in the top action row, ~lines 2383–2404).
- Leave controls **B** and **C** in place — both remain fully functional.

## Technical notes

- No database, RLS, or edge-function changes.
- No changes to `collapsedStages` default behavior — sections continue to open collapsed on every visit.
- No impact on deep-link auto-expand (Binder, etc.).
