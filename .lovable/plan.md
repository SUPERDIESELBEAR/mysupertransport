# Onboarding Pipeline — Remove Filter Rows & Investigate Exception Count

## 1. Remove the "Stages" row

Remove the visible compact ribbon that shows counts and quick-filter buttons for every stage (`Stages: 0 BG · 2 Docs · 1 ICA …`).

- Target: `src/pages/staff/PipelineDashboard.tsx`, lines 2670–2782 (the `Stage breakdown — compact single-line ribbon` block).
- Keep the underlying `stageFilter` state and its active chip in the filter-chips list, because deep links from the Management dashboard still arrive via `initialStageFilter`/`legendStageFilter`.
- Keep the `legendStageFilter` and `legendCoordinatorFilter` banners that tell staff why the list is currently filtered.

## 2. Remove the "Incomplete" row filters

Remove the row of chips labeled `Incomplete:` that shows per-stage incomplete counts and toggles `stageNodeFilters`.

- Target: `src/pages/staff/PipelineDashboard.tsx`, lines 2874–2962 (the `Stage incomplete quick-filter chip row` block).
- Keep the `stageNodeFilters` state and the `Stage Incomplete` section inside the hidden filter panel, so staff can still multi-select incomplete stages if they open the filters panel.
- Keep the active filter chip that appears once a stage-node filter is selected.

## 3. Remove the orange multi-stage warning bar

Remove the `MultiBlockedCallout` banner that warns about operators blocked at 2+ stages simultaneously.

- Remove the component usage at lines 2964–2971.
- Remove the `MultiBlockedCallout` component definition at lines 543–671.
- Remove the `useScrollIntoViewOnOpen` import if it is only used by this component (verify before deleting).

## 4. Investigate the "Exception Active" count discrepancy

The user reports the **Exception Active** chip shows **4** operators when they expect **3**. Investigate before changing the UI:

- Read the current data: `SELECT … FROM public.operators o JOIN public.onboarding_status os ON os.operator_id = o.id WHERE o.is_active = true AND (os.paper_logbook_approved = true OR os.temp_decal_approved = true);`.
- Compare the raw count with the facet count `facetCount({ exception: true })` in `PipelineDashboard.tsx`. The facet count applies all other active filters first, so it can legitimately be lower than the raw total if a stage/status/coordinator filter is active.
- If the raw count matches the chip and the user’s expectation of 3 is based on a different subset (e.g., excluding fully-onboarded drivers or a specific stage), the fix is to clarify the tooltip/copy, not the query.
- If a bug is found (e.g., counting on-hold operators, duplicate active/open section rows, or not respecting demo-mode toggle), fix it in the `matchesFilters` exception predicate.
- Report the finding to the user. Remove the **Exception Active** chip and banner only if the user explicitly asks after the investigation.

## 5. Verify no orphaned state

After removing the rows, confirm:

- `stageFilter` and `stageNodeFilters` still work through the filter panel and deep-link banners.
- The `activeFilterCount` chip list still displays correctly for remaining filters.
- No unused imports or helper code remain.
- The page builds and the table still renders with the remaining filters.
