

## Fix: Document Editor Save Fails and Reverts to Original

### Root Cause
When editing Bobby Thompson's CDL (DL Front/Rear) from the Operator Detail Panel, the `stage2Preview` edit handler (line 5845-5853 of `OperatorDetailPanel.tsx`) constructs the wrong storage info:

```
bucket: 'operator-documents'    // ← WRONG: CDL files are in 'application-documents'
path:   '${operatorId}/application_doc'  // ← WRONG: this is a made-up prefix, not the actual file path
```

This causes two failures:
1. **Save fails** — the upload targets the wrong bucket with an invalid path, triggering the "Save failed" toast
2. **Reverts to original** — even if save succeeded, the database URL (`dl_front_url` / `dl_rear_url` / `medical_cert_url` in the `applications` table) is never updated, so re-opening shows the old file

### Fix

**Remove the broken `onEdit` prop from the application-doc `FilePreviewModal`** and instead rely on the `FilePreviewModal`'s built-in edit which uses `inferStorageInfo` — this already correctly extracts bucket and path from signed URLs for `application-documents`.

Then add an `onSaved` callback that updates the correct column in the `applications` table.

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. Store which application doc field is being previewed (e.g. `dl_front_url`, `dl_rear_url`, `medical_cert_url`) alongside the `stage2Preview` state
2. For the application-doc `FilePreviewModal` (DL Front, DL Rear, Med Cert), remove `onEdit` so the built-in `inferStorageInfo` path handles storage correctly
3. Add `onSaved` callback that:
   - Updates the `applications` table with the new URL for the correct column
   - Updates local state (`setDlFrontUrl`, `setDlRearUrl`, or `setMedCertDocUrl`)

4. Remove the now-unnecessary `stage2Editing` `DocumentEditor` for application docs (the `FilePreviewModal`'s built-in editor handles it)

### Why this works
- `inferStorageInfo` already handles signed URLs from `application-documents` bucket (line 282 of DocRow.tsx)
- The built-in editor in `FilePreviewModal` correctly passes the inferred bucket+path to `DocumentEditor`
- The `onSaved` callback persists the new URL in the database so subsequent views show the edited image

### Files changed
| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Fix application-doc edit: remove `onEdit`, add `onSaved` with DB update |

