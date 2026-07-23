## Problem

In the management driver hub, expanding a stage section (e.g., Stage 9 — Payroll and Procedures) in the selected driver panel does not auto-scroll the section header to the top. Driver Documents works correctly because that section uses `useScrollIntoViewOnOpen`, which walks up to find the nearest scrollable ancestor.

## Root cause

`toggleStage` in `src/pages/staff/OperatorDetailPanel.tsx` (line 584-610) uses `window.scrollTo` with a fixed 80px offset. But `OperatorDetailPanel` renders inside an internal scroll container (the driver hub side panel / drawer), not the window. `window.scrollTo` has no effect on the container that's actually scrolled, so the newly-expanded stage stays where the header was and the user has to scroll manually. The working sections (Driver Documents, compliance summary, etc.) use `useScrollIntoViewOnOpen`, which handles internal scroll parents.

## Fix

Replace the `window.scrollTo` block in `toggleStage` with the same scroll-parent-aware logic used by `useScrollIntoViewOnOpen`. Keep the existing 80px sticky-header offset and reduced-motion handling.

1. In `src/pages/staff/OperatorDetailPanel.tsx`, inside `toggleStage`, when a section is being expanded, use a helper that:
   - Walks up from `stageRefs.current[stageKey]` to find the nearest ancestor with `overflow-y: auto | scroll | overlay` and `scrollHeight > clientHeight`.
   - Falls back to `window` if no scrollable ancestor is found.
   - Scrolls that container so the stage element's top aligns 80px below the container's top edge, using smooth behavior (or auto when `prefers-reduced-motion` is set).
2. Apply the identical replacement to `scrollToStage` (line 612-621), which currently uses `element.scrollIntoView`. Its default `block: 'start'` doesn't account for the 80px sticky-header offset and has the same scroll-container ambiguity — align both entry points to a single helper.
3. Extract the helper as a small local function inside the component (mirrors the logic already proven in `useScrollIntoViewOnOpen`); no new hook, no changes to any stage's markup.

This preserves every stage's existing structure (`stageRefs.current[stageKey]` refs are already populated) and matches the behavior of the working Driver Documents section.

## Files

- `src/pages/staff/OperatorDetailPanel.tsx` — update `toggleStage` and `scrollToStage` to scroll the nearest scrollable ancestor (with 80px offset), instead of `window.scrollTo` / plain `scrollIntoView`.

## Validation

- Open the management dashboard → Driver Hub → select a driver → expand Stage 1, Stage 5, Stage 6, Stage 9, PE Screening, Inspection Binder, Settlement Forecast, Dispatch History. Each section's header should snap to the top of the visible panel with the newly-opened content beginning right below it.
- Confirm no regression in Driver Documents (still uses its own hook) and in the driver-facing Onboarding stages (untouched).
- Verify reduced-motion setting still disables the smooth animation.
