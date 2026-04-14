

## Fix: IRP Registration Edit Reverts on Reopen

### Problem
When editing the IRP Registration (or any inspection document), the `DocumentEditor` overwrites the file in storage and generates a fresh signed URL. However, the `inspection_documents.file_url` in the database is never updated with this new URL. When the user closes and reopens the preview, the old signed URL from the database is used, and the browser serves the cached old image from that URL.

This affects three surfaces:
1. `OperatorBinderPanel` (inside OperatorDetailPanel) — no `onSaved` at all
2. `InspectionBinderAdmin` — `onSaved` only calls `fetchDocs()`
3. `OperatorInspectionBinder` — `onSaved` only calls `fetchDocs()`

### Fix

**1. `FilePreviewModal` in `DocRow.tsx`** — After the editor saves, use `inferStorageInfo` to find the document's `file_path`, then update `inspection_documents.file_url` with the new signed URL directly in the `onSave` handler. This centralizes the fix so all three parent surfaces benefit without needing individual changes.

Specifically, inside the `onSave` callback (lines 553-564):
- After calling `await onSaved(newUrl)`, also run a database update:
  - Use the `effectivePath` (already computed) to match the `inspection_documents` record by `file_path`
  - Update `file_url` to `newUrl`
- This ensures reopening the doc uses the fresh signed URL

**2. `OperatorBinderPanel.tsx`** — Pass `onSaved={() => fetchDocs()}` to `FilePreviewModal` so it re-fetches after the DB update (currently passes nothing).

**3. Update `previewUrl` state** — In `InspectionBinderAdmin` and `OperatorBinderPanel`, pass the new URL back to update `previewUrl` state. Alternatively, since `FilePreviewModal` already updates its internal `overrideUrl`, the immediate display works — the DB update just ensures persistence across close/reopen.

### Files to change
| File | Change |
|------|--------|
| `src/components/inspection/DocRow.tsx` | In `FilePreviewModal`'s `onSave`, update `inspection_documents.file_url` WHERE `file_path = effectivePath` |
| `src/components/inspection/OperatorBinderPanel.tsx` | Add `onSaved={() => fetchDocs()}` to `FilePreviewModal` |

### Why this works
- The `DocumentEditor` already overwrites the original file and returns a fresh signed URL
- The fresh signed URL has a different token, busting the browser cache
- Updating `file_url` in the DB ensures all future renders use the new URL
- `fetchDocs()` refreshes the parent's doc list with the updated URL

