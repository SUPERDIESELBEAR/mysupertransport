

## Ensure Image Editor (Pencil) Is Available Across All FilePreviewModal Usages

### Problem
The edit pencil button in the file preview modal only appears when two conditions are met:
1. The file is an **image** (not a PDF)
2. The modal has access to `bucketName` and `filePath` (either explicitly passed or successfully inferred from the URL via `inferStorageInfo`)

Currently, only `InspectionBinderAdmin` explicitly passes `bucketName` and `filePath`. All other surfaces — including `OperatorInspectionBinder`, `OperatorBinderPanel`, `OperatorDocumentUpload`, `FleetDetailDrawer`, and `OperatorDetailPanel` — rely on URL inference, which may fail depending on the URL format (e.g., if it's a pre-signed URL with query params that confuse the regex).

**Note:** If a Periodic DOT Inspection document was uploaded as a PDF, the edit pencil will correctly not appear — the canvas-based editor only supports image files. This is expected behavior.

### Fix

**1. `OperatorInspectionBinder.tsx`** — Pass `bucketName` and `filePath` to FilePreviewModal, mirroring the pattern used in InspectionBinderAdmin:
- Track `previewFilePath` state alongside `previewUrl`/`previewName`
- When setting preview, capture `doc.file_path`
- Pass `bucketName="inspection-documents"` and `filePath={previewFilePath}` to the modal

**2. `OperatorBinderPanel.tsx`** — Same fix: track and pass `bucketName`/`filePath` to FilePreviewModal.

**3. `OperatorDetailPanel.tsx`** — For the CDL/medical cert previews and Stage 2 doc previews, pass `bucketName` and `filePath` when the storage path is known.

**4. Other surfaces (FleetDetailDrawer, OperatorDocumentUpload, ContractorPaySetup)** — Pass bucket/path where the storage location is known. Where it isn't (e.g., external URLs), the pencil correctly won't appear.

### Files to change
| File | Change |
|------|--------|
| `src/components/inspection/OperatorInspectionBinder.tsx` | Add `previewFilePath` state; pass `bucketName`/`filePath` to FilePreviewModal |
| `src/components/inspection/OperatorBinderPanel.tsx` | Add `previewFilePath` state; pass `bucketName`/`filePath` to FilePreviewModal |
| `src/pages/staff/OperatorDetailPanel.tsx` | Pass `bucketName`/`filePath` to the 3 FilePreviewModal instances where storage paths are available |
| `src/components/operator/OperatorDocumentUpload.tsx` | Pass `bucketName`/`filePath` to FilePreviewModal |

### What won't change
- PDF files will still not show the edit pencil — this is correct since the editor is image-only
- The `DocumentEditor` component itself needs no changes

