

## Problem

The uploaded CDL (front/back) and Medical Certificate images are only viewable through the **Application Review Drawer** (accessible from the Applications tab). When you view an operator in the **Pipeline Dashboard** via the Operator Detail Panel, you can see CDL and Medical Cert **expiration dates** but not the actual uploaded document images.

## Solution

Add an "Uploaded Documents" section to the **Operator Detail Panel** (the panel shown when clicking an operator in the Pipeline) that displays clickable view buttons for DL Front, DL Rear, and Medical Certificate — the same documents shown in the Application Review Drawer.

### Changes

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. **Expand the application query** (line ~927) to also fetch `dl_front_url`, `dl_rear_url`, and `medical_cert_url` from the joined `applications` table
2. **Store the document URLs** in component state alongside the existing `cdlExpiration` / `medCertExpiration` values
3. **Add an "Uploaded Documents" card** in the Contact Info / Stage 1 area that shows clickable buttons for each available document (DL Front, DL Rear, Medical Certificate)
4. **Generate signed URLs** on-demand (same pattern as the Stage 2 doc fix) when the user clicks "View" — extract the storage path, call `createSignedUrl` on the `application-documents` bucket, then open the `FilePreviewModal`

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add `dl_front_url`, `dl_rear_url`, `medical_cert_url` to the applications select; add Uploaded Documents card with signed-URL-based preview |

