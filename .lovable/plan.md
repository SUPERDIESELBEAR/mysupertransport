## Goal
Make every management dashboard expansion land with the newly opened section header at the top of the visible panel, matching the working Driver Documents behavior.

## Confirmed findings
- `OperatorDetailPanel.tsx` has a shared `scrollStageIntoView(stageKey)` helper for onboarding stages, but `inspection_binder`, `settlement_forecast`, and `dispatch_history` are in `ALL_COLLAPSIBLE_KEYS` without their wrapper elements being registered in `stageRefs`.
- Because those wrappers have no `stageRefs.current[...]`, clicking their chevrons calls the helper but it exits early and does not scroll.
- `scrollToInspectionBinder` still uses plain `el.scrollIntoView(...)`, which does not apply the 80px sticky-header offset and may target the wrong scroll container.
- `SettlementCard.tsx` has its own nested payday-card expand/collapse state and currently does not use `useScrollIntoViewOnOpen`, so expanding a payday card inside Settlement Forecast can also leave the header off-screen.
- Several already-audited sections do use `useScrollIntoViewOnOpen` correctly, including Driver Documents (`DriverVaultCard`), Equipment Asset Sheet, Compliance Alerts, and Compliance Summary.

## Plan
1. In `src/pages/staff/OperatorDetailPanel.tsx`:
   - Attach `stageRefs.current['dispatch_history']` to the Dispatch Status History wrapper.
   - Attach `stageRefs.current['inspection_binder']` to the Inspection Binder wrapper, while keeping `inspectionBinderRef` for deep-link compatibility.
   - Attach `stageRefs.current['settlement_forecast']` to the Settlement Forecast wrapper.
   - Replace the `scrollToInspectionBinder` effect’s plain `scrollIntoView` call with `scrollToStage('inspection_binder')` so it opens the section and uses the same offset/container-aware scroll helper.

2. In `src/components/operator/SettlementForecast/SettlementCard.tsx`:
   - Import `useScrollIntoViewOnOpen`.
   - Register the card root with the hook using `!collapsed` so each payday card scrolls into position when expanded.
   - Keep current card content and read-only/edit behavior unchanged.

3. Audit cleanup pass after implementation:
   - Re-run the collapsible pattern search and confirm the remaining relevant management/driver hub sections either use `useScrollIntoViewOnOpen` or are not section expansions that need page repositioning.
   - Prioritize actual section expanders, not popovers, dialogs, tabs, filters, or tiny inline toggles.

## Validation
- In Management Dashboard → Driver Hub → selected driver, expand:
  - Stage 9 — Payroll and Procedures
  - Inspection Binder
  - Settlement Forecast
  - Dispatch Status History
- Confirm each header aligns near the top of the visible panel with the 80px offset.
- Inside Settlement Forecast, collapse and expand each payday card and confirm the selected payday header comes into view.
- Confirm Driver Documents still behaves correctly.