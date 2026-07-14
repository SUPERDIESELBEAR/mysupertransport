# Fix: Driver Hub sections start expanded instead of collapsed

## Root cause
In `src/pages/staff/OperatorDetailPanel.tsx`, `collapsedStages` (a `Set<string>` tracking which sections are collapsed) is initialized empty (line 397). It's also **not** persisted anywhere — it's plain component state that resets on unmount — so the "remember across visits" part is already true.

The reason the panel opens with everything expanded is the default: empty set = every section rendered open. The on-load hook (lines 1217–1230) only adds keys for stages that are already fully complete, so any incomplete stage plus every non-stage section (`inspection_binder`, `dispatch_history`, `settlement_forecast`, `stage8` payroll) is expanded by default.

## Change
Flip the default so **every collapsible section starts collapsed** on each panel open, matching the screenshot. Keep the existing user toggle, "expand all / collapse all" controls, and deep-link auto-expand (`scrollToStage`, `scrollToInspectionBinder`) working.

### Steps — single file: `src/pages/staff/OperatorDetailPanel.tsx`

1. Define an `ALL_COLLAPSIBLE_KEYS` constant listing every section key currently toggled:
   `['stage1','stage2','stage3','stage4','stage5','stagePE','stage6','stage7','stage8','inspection_binder','dispatch_history','settlement_forecast']`.

2. Change the `collapsedStages` `useState` initializer (line 397) from `new Set()` to `new Set(ALL_COLLAPSIBLE_KEYS)` so the panel mounts fully collapsed every time.

3. Update the on-load auto-collapse block (lines 1217–1230): remove the conditional adds and just re-seed with the full set (`setCollapsedStages(new Set(ALL_COLLAPSIBLE_KEYS))`). This preserves the "already collapsed after data load" behaviour without accidentally re-expanding anything.

4. Leave the `scrollToStage` and Inspection Binder scroll-into-view effects alone — they already call `next.delete(key)` before scrolling, so deep-links from the pipeline / dispatch board still auto-expand the targeted section.

5. Leave `toggleStage`, the Stage 8 pay-setup auto-collapse effect (line 697), and all "expand all / collapse all" buttons unchanged.

## Verification
- Open Driver Hub → select any driver: every section (Stages 1–9, PE Screening, Inspection Binder, Settlement Forecast, Dispatch Status History) is collapsed. Screen matches the attached screenshot.
- Expand a couple of sections → navigate to Applications → return to the driver: sections are collapsed again.
- Click a section header: it expands/collapses as before.
- Click "Binder" from Dispatch Board or a StageTrack deep-link: the target section auto-expands and scrolls into view.
- "Collapse all / Expand all" buttons still work.

No DB, edge function, or route changes.
