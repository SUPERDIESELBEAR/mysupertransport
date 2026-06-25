## Finding

This is not a realtime lag issue. For the specific driver in the screenshot, the database still has:

- Stage 1: `mvr_ch_approval = approved`, but `pe_screening_result = pending`
- Stage 2: uploaded docs exist, but the official status fields are still `requested/not_started/not_started/not_started`

So the driver portal is showing the saved source-of-truth correctly, while management is visually implying completion based on uploaded files or local UI state. The fix should make the source of truth and both UIs agree.

## Plan

1. **Centralize stage completion rules**
   - Add a shared onboarding status helper for Stage 1 and Stage 2.
   - Stage 1 complete when MVR/CH is approved and PE result is clear.
   - Stage 2 complete when all four document status fields are received, with an explicit fallback that can treat existing uploaded documents as ready-for-review but not silently complete unless staff confirms.

2. **Fix driver portal display**
   - Update `OperatorPortal.tsx` to use the shared helper instead of duplicate inline checks.
   - Show Stage 3 as available only when Stage 1 and Stage 2 are truly complete.
   - Improve Stage 2 substep wording so uploaded-but-not-marked-received reads as “Awaiting coordinator review,” not “Not Started.”

3. **Fix management-side received workflow**
   - In `OperatorDetailPanel.tsx`, make every “Mark as Received” action immediately persist the matching `onboarding_status` field and update the local saved snapshot.
   - When staff marks the final Stage 2 document received, re-check all four fields from the saved row so the management “All Docs Complete” badge cannot be ahead of the database.
   - Keep existing notifications/audit behavior intact.

4. **Add an explicit Stage 2 catch-up action**
   - Add a management-side “Mark uploaded Stage 2 docs received” action when all required uploads exist but official statuses are not yet all received.
   - This resolves cases like the current driver where the files are present but the status fields were never changed.

5. **Verify the specific driver path**
   - Check that the driver portal reads the same row after refresh/login.
   - Confirm Stage 1 remains in progress until PE result is clear, unless management has actually set it clear.
   - Confirm Stage 2 moves to complete as soon as the four status fields are saved as received.
   - Confirm Stage 3 becomes the next accessible stage once Stage 1 and Stage 2 are complete.