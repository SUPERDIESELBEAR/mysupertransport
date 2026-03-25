
## Diagnosis: Why Changes Aren't Visible

After reviewing the code in full, all the planned changes were correctly implemented:

- `deposit_overview_acknowledged` and `payroll_calendar_acknowledged` columns exist in the database schema (confirmed in `types.ts` and the migration file)
- `ContractorPaySetup.tsx` correctly moves the reference documents to the top and gates the form
- `OperatorDetailPanel.tsx` correctly fetches the pay setup record and shows "Doc Acknowledgments" badges

**The most likely reason the user isn't seeing changes:** The Stage 8 section in the Operator Detail Panel is **collapsed by default** when opening a panel, unless the user scrolls down and expands it. Since Marcus Mueller has not submitted pay setup yet, Stage 8 should be visible but may need to be manually expanded.

**A secondary issue found:** The `paySetupSignedUrls` state at line 224 still holds `{ w9: null, voidCheck: null }` — a leftover remnant from before W-9/void check were removed. This is harmless but indicates the state was never cleaned up.

**Third issue confirmed:** The `Operator Portal` changes (gated form, document acknowledgments at the top) are in `ContractorPaySetup.tsx` — this is what the **operator** sees. The staff view in `OperatorDetailPanel.tsx` shows the read-only acknowledgment badges. The user may be conflating the two portals.

## Plan: Clean Up + Verify Visibility

### What to change

**1. Clean up leftover state in OperatorDetailPanel.tsx**
Remove the unused `paySetupSignedUrls` state variable (line 224) since W-9 and voided check were already removed. This prevents confusion and cleans up dead code.

**2. Ensure Stage 8 is not auto-collapsed**
Currently, Stage 8 is not in the auto-collapse list (lines 755-762), so it should be visible. However, if all of stages 1–7 are already complete for Marcus, the panel starts with many collapsed stages. Stage 8 remains expanded by default — no change needed here.

**3. Add a visible "Not started" empty state that's unambiguous**
If `paySetupRecord` is `null` (operator hasn't started), the current empty state just says "Operator has not started pay setup yet." This is correct. No change needed.

### Summary

The changes are in the codebase correctly. The plan is to:
1. Remove the dead `paySetupSignedUrls` state reference
2. Tell the user to scroll down to the Stage 8 section and expand it — the acknowledgment badges (green "Acknowledged" / gray "Not yet") will only appear once Marcus has an existing pay setup record

### Files to change

- `src/pages/staff/OperatorDetailPanel.tsx`: Remove unused `paySetupSignedUrls` state and its setter at line 224

No migration needed. No new files needed.
