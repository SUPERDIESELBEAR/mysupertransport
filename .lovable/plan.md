
Diagnosis:
- Bobby Thompson’s CDL is most likely going through the built-in `FilePreviewModal` editing path in `OperatorDetailPanel`, not the `ApplicationReviewDrawer` path.
- That path still has two structural problems:
  1. `DocumentEditor` saves to a new `_edited` object instead of replacing the original file.
  2. `FilePreviewModal` keeps rendering the old signed URL after save, so the UI appears to “revert” even when a save callback runs.

Plan:
1. Update `src/components/shared/DocumentEditor.tsx`
   - Save back to the original `filePath` instead of creating `${basePath}_edited...`.
   - Keep `upsert: true`.
   - Generate and return a fresh signed URL for the overwritten file so callers can immediately refresh the preview.

2. Update `src/components/inspection/DocRow.tsx` (`FilePreviewModal`)
   - Add local state for the currently displayed preview URL instead of always rendering the initial `url` prop.
   - After a successful editor save, replace that local preview URL with the new signed URL before closing the nested editor.
   - Keep awaiting `onSaved` so persistence finishes before the editor fully closes.

3. Update `src/pages/staff/OperatorDetailPanel.tsx`
   - In the CDL / medical-cert save callback, normalize the returned storage path and update:
     - the database record,
     - the local raw-path state (`dlFrontUrl`, `dlRearUrl`, `medCertDocUrl`),
     - and `applicationData` so no later re-render restores stale values.
   - If needed, also refresh the current preview URL so the edited image remains visible immediately.

4. Regression-check `src/components/management/ApplicationReviewDrawer.tsx`
   - Make sure the overwrite behavior still works there and that its signed-url refresh logic remains compatible with saving to the same storage path.

5. Verify end-to-end
   - Re-test Bobby Thompson’s CDL in preview.
   - Confirm all 3 behaviors:
     - the edited image stays visible immediately after Save,
     - reopening the CDL still shows the edited version,
     - refreshing the page still shows the edited version.

Technical details:
- Files to update:
  - `src/components/shared/DocumentEditor.tsx`
  - `src/components/inspection/DocRow.tsx`
  - `src/pages/staff/OperatorDetailPanel.tsx`
  - possibly `src/components/management/ApplicationReviewDrawer.tsx` for consistency
- No database migration should be needed for this fix.
- The key change is to treat editing as an overwrite flow, not a “create sibling edited file” flow.
