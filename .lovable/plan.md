

## Fix Edit Button Across All Document Viewers

### Problem
The edit pencil button is missing or non-functional in most document preview surfaces. The root cause varies by surface:

- **InspectionBinderAdmin**: Only passes `bucketName` when `file_path` is set, but CDL/Medical Cert docs have `file_path = null` (stored as bare `applications/...` paths in `file_url`)
- **OperatorInspectionBinder**: No edit props passed at all
- **PEScreeningTimeline**: `filePath` is hardcoded to `undefined` (dead code: `filePath={receiptDoc?.file_url ? undefined : undefined}`)
- **DriverVaultCard**: `filePath` falls back to `undefined` when `file_path` column is null
- **OperatorDetailPanel & ApplicationReviewDrawer**: Already working via `onEdit` callback
- **Other surfaces** (Resources, ContractorPay, OperatorDocUpload, OperatorStatus): No edit props at all

### Solution

**1. Enhance `FilePreviewModal` to derive bucket/path from `file_url` automatically**

When `bucketName`/`filePath` are not explicitly provided, detect bare storage paths in the URL (e.g., `applications/...`) and infer the bucket and path. This makes the edit button appear without requiring every caller to extract storage metadata.

Add a helper function inside `DocRow.tsx` that:
- Detects `applications/...` → bucket = `application-documents`, path = the bare path
- Detects `inspection-documents/...` → bucket = `inspection-documents`, path after prefix
- Detects signed URLs containing `/inspection-documents/` or `/application-documents/` → extract accordingly
- Detects `operator-documents` patterns similarly

When inferred, show the edit pencil automatically.

**2. Fix specific surfaces**

| File | Fix |
|------|-----|
| `DocRow.tsx` | Add `inferStorageInfo(url)` helper; use inferred values as fallback when `bucketName`/`filePath` not passed |
| `InspectionBinderAdmin.tsx` | Pass `file_url` as fallback so inference works for CDL docs with null `file_path` |
| `OperatorInspectionBinder.tsx` | Pass `bucketName`/`filePath` or rely on auto-inference |
| `PEScreeningTimeline.tsx` | Fix dead `filePath` — extract actual path from `receiptDoc.file_url` |
| `DriverVaultCard.tsx` | Use `file_url` as fallback path when `file_path` is null |
| `OperatorStatusPage.tsx` | Add edit props for QPassport viewer |
| `ContractorPaySetup.tsx` | Add edit props for payroll doc viewer |
| `OperatorDocumentUpload.tsx` | Add edit props for operator doc previews |

**3. Files to modify**

| File | Change |
|------|--------|
| `src/components/inspection/DocRow.tsx` | Add `inferStorageInfo()` helper; update `FilePreviewModal` to auto-infer bucket/path from URL when not explicitly provided |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Always pass `file_url` as filePath fallback when `file_path` is null |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Pass bucket/path info to `FilePreviewModal` |
| `src/components/operator/PEScreeningTimeline.tsx` | Fix filePath to extract actual storage path from receipt URL |
| `src/components/drivers/DriverVaultCard.tsx` | Use `file_url` as filePath fallback |
| `src/components/operator/OperatorStatusPage.tsx` | Add edit props |
| `src/components/operator/ContractorPaySetup.tsx` | Add edit props |
| `src/components/operator/OperatorDocumentUpload.tsx` | Add edit props |

### Technical Detail
The `inferStorageInfo` function will parse URLs/paths to determine bucket and object path:
```text
"applications/123_file.jpg"  →  bucket: "application-documents", path: "applications/123_file.jpg"
"https://.../object/sign/inspection-documents/abc/file.png?..."  →  bucket: "inspection-documents", path: "abc/file.png"
```
This inference runs inside `FilePreviewModal` as a fallback — explicit `bucketName`/`filePath` props always take priority.

