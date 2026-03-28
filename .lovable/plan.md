

## Stage 6 Auto-Open Investigation + Collapse for Dispatch History & Inspection Binder

### Stage 6 Finding

The auto-collapse logic (line 873) collapses Stage 6 when `insurance_added_date` is set:
```
if (os.insurance_added_date) autoCollapse.add('stage6');
```

The operator you're viewing has `insurance_added_date = '2026-03-27'`, meaning Stage 6 is **complete** and correctly auto-collapses — same behavior as all other completed stages. This is working as designed. If no insurance date were set, it would be open.

If you'd like Stage 6 to always start expanded regardless of completion, I can remove it from the auto-collapse logic. Otherwise, no code change needed here.

### Add Collapse to Dispatch Status History & Inspection Binder

Both sections currently have no collapse/expand toggle. I'll add collapsible headers matching the stage pattern (click header to toggle, chevron indicator).

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. **Add two new state flags** (or reuse `collapsedStages` with keys `dispatch_history` and `inspection_binder`):
   - Add `'dispatch_history'` and `'inspection_binder'` as valid keys in `collapsedStages`

2. **Dispatch Status History** (~line 4758): Wrap the header in a `<button>` toggle with chevron. Conditionally render the filter chips, history list, and "Load more" inside `{!collapsedStages.has('dispatch_history') && (...)}`.

3. **Inspection Binder** (~line 5063): Wrap `<OperatorBinderPanel>` in a collapsible container with a header button showing "Inspection Binder" + chevron. Render the panel only when `!collapsedStages.has('inspection_binder')`.

Both sections will **default to open** (not in the collapsed set on load).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add collapse toggle to Dispatch Status History and Inspection Binder sections |

