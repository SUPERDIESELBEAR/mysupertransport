## Plan: Fix Stage 1/2 mismatch between management and driver portal (all drivers)

This applies to every driver, not just Emma — she's only the test case used to confirm behavior.

### Root cause
The driver portal reads saved values from `onboarding_status` and correctly shows Stage 1/2 as "in progress" when those values aren't yet `approved`/`clear`/`received`. Management can visually look "complete/green" while the saved DB values are still pending (because of unsaved local state, or because uploaded files are mistaken for staff sign-off). For the current test driver the DB still has `pe_screening_result = pending` and three Stage 2 docs at `not_started`/`requested`, so the driver portal correctly says Stage 1/2 are not complete.

### Implementation (applies to all drivers)

1. **One source of truth for stage completion**
   - Management's Stage 1 / Stage 2 completion indicators use the saved `onboarding_status` values (same fields the driver portal already uses), not local uploaded-file evidence.
   - When uploaded files exist but the saved status is not yet `received`/`approved`/`clear`, management shows an explicit "Needs staff review — not saved" state rather than green complete.

2. **One-click "Mark all Stage 2 received" in management**
   - When all four Stage 2 documents have at least one uploaded file, staff get a single action to mark `form_2290`, `truck_title`, `truck_photos`, `truck_inspection` as `received` in one write.
   - Persists immediately to `onboarding_status` and updates the local snapshot so the row doesn't appear unsaved.

3. **One-click "Approve Stage 1" in management**
   - When MVR and CH statuses are `received` and a PE result is entered, staff can set `mvr_ch_approval = approved` + `pe_screening_result = clear` in one write.
   - Persists immediately.

4. **Harden the existing per-field immediate save**
   - Keep the immediate-save dropdown behavior already in place for Stage 1/2.
   - Fall back to `operator_id` when `statusId` is missing so a save never silently no-ops.
   - Surface failures with a destructive toast and revert local state on error so management cannot look green while the DB is still pending.

5. **Driver portal stays unchanged in logic**
   - Continues to read saved `onboarding_status` and the existing realtime + focus/visibility refresh path already syncs within seconds once management persists.

### Validation
- After the change, for any driver where staff sets Stage 1 approvals and Stage 2 documents to received, the DB row will reflect it and the driver portal Stage 1/2 will flip to complete on the next realtime tick or focus.
- Re-run the diagnostic query on the test driver to confirm the saved fields actually change after staff uses the new one-click actions.