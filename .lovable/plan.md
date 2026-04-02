

## Fix: Upfront Costs Attachments — In-App Preview + Edit, and Pipeline Verification

### Issue 1: Dominic Elek's Pipeline Stage

Database check confirms Dominic Elek's data is correct: `ica_status = 'in_progress'` and `mvr_ch_approval = 'approved'`. With the updated `computeStage()` logic, he should already appear in **Stage 3 — ICA**. Both `PipelineDashboard.tsx` and `BulkMessageModal.tsx` have the correct updated logic.

This may be a browser cache issue — try a hard refresh (Ctrl+Shift+R). If you're still seeing him in the wrong stage, please let me know exactly which stage he appears under and I'll dig deeper.

### Issue 2: Upfront Costs Attachments Open in New Tab

The `CostAttachment` component uses a raw `<a href={...} target="_blank">` link instead of the in-app `FilePreviewModal` + `DocumentEditor` pattern used everywhere else. This needs to be fixed to match the rest of the app.

### Changes — `OperatorDetailPanel.tsx`

**Replace the `<a>` link in `CostAttachment`** with a clickable button that:
1. Opens the file in `FilePreviewModal` (in-app preview, no new tab)
2. Includes an "Edit" button on the preview modal that launches `DocumentEditor` (crop, annotate, etc.)

Specifically:
- Add state for `costPreview` (url + name + slotKey) and `costEditing` (url + name + bucket + path)
- Replace the `<a href target="_blank">` on line 2631 with a `<button onClick={() => setCostPreview(...)}>` that opens the in-app preview
- Add `FilePreviewModal` and lazy-loaded `DocumentEditor` instances at the bottom of the component for cost attachments
- The `onEdit` callback on `FilePreviewModal` opens the `DocumentEditor` with the correct storage bucket path (`operator-documents/${operatorId}/cost-${slotKey}/...`)

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace `<a target="_blank">` in CostAttachment with in-app FilePreviewModal + DocumentEditor |

