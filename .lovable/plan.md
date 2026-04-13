

## Add Edit Button to All Document Viewers

### Current State
The app **already has** a full image editor (`DocumentEditor` using `react-filerobot-image-editor`) with rotate, crop, resize, brightness/contrast, filters, and text annotations. However, the edit (pencil) button only appears in the Inspection Binder's `DocRow` component. Most other surfaces that use `FilePreviewModal` — Driver Vault, Application Review, Operator Status, PE Screening, Contractor Pay, Resource Library, etc. — do **not** pass the `onEdit` prop, so staff never see the edit option.

### Plan

**1. Upgrade `FilePreviewModal` to support self-contained editing**

Instead of requiring every caller to wire up `onEdit` externally, add optional `bucketName` and `filePath` props to `FilePreviewModal` itself. When provided, it will show the edit button and launch `DocumentEditor` internally — no changes needed at each call site beyond passing bucket/path info.

| New Prop | Purpose |
|----------|---------|
| `bucketName` | Storage bucket for saving edits (e.g., `application-documents`) |
| `filePath` | Object path within the bucket |
| `onSaved` | Optional callback after a successful edit |

**2. Wire up editing in key surfaces**

Pass `bucketName` and `filePath` to `FilePreviewModal` in these locations so the edit button appears:

| File | Surface |
|------|---------|
| `src/components/inspection/InspectionBinderAdmin.tsx` | Admin binder preview |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Operator binder preview |
| `src/components/drivers/DriverVaultCard.tsx` | Driver document preview |
| `src/components/management/ApplicationReviewDrawer.tsx` | Application review docs |
| `src/pages/staff/OperatorDetailPanel.tsx` | Onboarding doc previews |
| `src/components/operator/PEScreeningTimeline.tsx` | PE screening receipts |
| `src/components/operator/OperatorStatusPage.tsx` | Operator QPassport view |

**3. Additional editor enhancements to suggest**

The existing editor already supports these tools (line 279 of `DocumentEditor.tsx`):
- **Adjust** — crop, rotate, flip
- **Finetune** — brightness, contrast, saturation, warmth
- **Filters** — preset photo filters
- **Resize** — change dimensions
- **Annotate** — text, shapes, drawing

Additional features that could be added:
- **Auto-rotate detection** — automatically suggest rotation for sideways photos on upload
- **Quick-action buttons** — "Rotate 90°" and "Auto-enhance" one-tap buttons in the preview header (before opening the full editor) for common corrections
- **Batch editing** — apply the same crop/rotate to multiple documents at once

### Files to Modify
| File | Change |
|------|---------|
| `src/components/inspection/DocRow.tsx` | Add `bucketName`, `filePath`, `onSaved` props to `FilePreviewModal`; render `DocumentEditor` internally when edit is triggered |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/components/drivers/DriverVaultCard.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/components/management/ApplicationReviewDrawer.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/pages/staff/OperatorDetailPanel.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/components/operator/PEScreeningTimeline.tsx` | Pass bucket/path to `FilePreviewModal` |
| `src/components/operator/OperatorStatusPage.tsx` | Pass bucket/path to `FilePreviewModal` |

This gives staff one-click access to rotate, crop, resize, and enhance any uploaded document across the entire app — directly from the preview viewer.

