

## Add Delete + In-App Viewer to Stage 2 Document Popover

### Problem
1. Uploaded files in the Stage 2 doc popover (Form 2290, Truck Title, Truck Inspection) cannot be deleted if the wrong document was uploaded.
2. The "View" link opens documents in a new browser tab instead of using the in-app `FilePreviewModal` used everywhere else.

### Changes

**`src/pages/staff/OperatorDetailPanel.tsx`**

1. **Add preview state** — new `useState` for `stage2Preview: { url: string; name: string } | null` near other state declarations.

2. **Update the popover file list** (lines 3911-3933) for each file row:
   - Replace the `<a href target="_blank">View</a>` link with a button that sets `stage2Preview` to open `FilePreviewModal` in-app.
   - Add a delete button (Trash icon) that:
     - Deletes the row from `operator_documents` table
     - Removes the file from `operator-documents` storage bucket
     - Updates local `docFiles` state to remove the deleted entry
     - Shows a toast confirmation

3. **Render `FilePreviewModal`** — add one instance at the bottom of the Stage 2 section, controlled by `stage2Preview` state. Import `FilePreviewModal` from `@/components/inspection/DocRow` (already used elsewhere in the codebase).

### File Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add delete button + in-app FilePreviewModal to Stage 2 doc popover rows |

