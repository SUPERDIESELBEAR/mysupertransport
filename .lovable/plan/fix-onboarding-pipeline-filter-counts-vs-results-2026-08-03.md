# Fix Onboarding Pipeline filter counts vs. results

## What is happening

Every filter chip/badge number on the Onboarding Pipeline is counted against the **raw, unfiltered** operator list, while the table below it renders a list that has already had several things removed. The numbers and the rows answer two different questions, so combinations of filters routinely land on "No operators match your filters."

Three causes, all confirmed in `src/pages/staff/PipelineDashboard.tsx`:

1. **Counts ignore the other active filters.** The Stage ribbon counts, the "Incomplete:" stage chips (BG / Docs / ICA / MO / Equip / PE / Ins / Go Live / Pay), the dispatch chips, Critical Expiry / Expiry Warning, and Idle 14d+ are each computed as `operators.filter(...)` over the entire list. In the screenshot, "PE 21" means *21 of all operators have PE incomplete* — not *21 within Stage 1 — Background*. Only 1 operator sits at Stage 1, so combining the two chips legitimately yields zero rows, but the chip still advertises 21.

2. **Counts ignore the table's baseline exclusions.** The rendered list additionally drops operators that are `on_hold`, that are fully onboarded with Stage 5 still open (those appear in the separate "Active — Open Onboarding Items" section), and owner accounts. No count expression applies these exclusions, so a chip can show 1 while the list shows 0 even with a single filter selected.

3. **A search term shrinks the list but not the counts.** Same class of mismatch.

Two more correctness problems found while auditing:

- **Status → "Fully Onboarded" can never return rows.** Every operator whose status is `onboarded` is excluded from the table by the Stage-5 section rule, so that option is always empty.
- **Multi-select stage chips use AND, not OR.** The code comment says "incomplete in ANY of the selected stages" but the implementation requires incomplete in *all* selected stages. Selecting two chips intersects, which reads as broken.

## What to change

All changes are contained to `src/pages/staff/PipelineDashboard.tsx` (presentation/filtering only — no database or schema work).

1. **Extract a single predicate function** that takes an operator plus the filter values and returns whether it belongs in the list, including the baseline exclusions (`on_hold`, Stage-5-open section, owner accounts). The table's `filtered` array uses it as-is.

2. **Derive every chip count from that same predicate, with the chip's own dimension left out.** For a chip filtering on dimension X, count operators passing all *other* active filters plus X. This faceted-count pattern makes the number a truthful promise: click the chip and get exactly that many rows.

3. **Grey out and disable zero-count chips** instead of hiding them, so a chip whose count drops to 0 under the current filter set is visibly unavailable rather than silently missing.

4. **Show an explanatory empty state.** When the list is empty but operators exist, replace the bare "No operators match your filters" with the number of filters applied and a "Clear all filters" button.

5. **Fix stage-chip multi-select to OR semantics** (incomplete in any selected stage), matching the label and stated intent.

6. **Fix the Status filter's "Fully Onboarded" option** so it targets the Stage-5-open group currently excluded from the table, rather than returning nothing.

7. **Verify each dimension after the change** — stage, stage-incomplete, status, dispatch status, coordinator, progress, compliance, activity/idle — confirming chip count equals row count on click, individually and in combination.

## Technical notes

- Count sites to convert: lines ~2025–2028 (stage ribbon), 2407 and 2819 (stage-incomplete chips, two render locations sharing the same logic), 2631 (dispatch), 2652–2659 (compliance), 1986 (idle).
- Faceted counts should be memoized with `useMemo` keyed on `operators`, `stageConfigs`, `complianceByOperator` and the filter state, since the predicate now runs once per chip per render.
- No changes to data fetching, RLS, or `pipeline_config`.