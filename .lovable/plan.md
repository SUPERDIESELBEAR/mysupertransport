

## Fix: PE Receipt "View Receipt" Link Returns 404

### Root Cause
The `operator-documents` storage bucket is **private**, but the PE receipt's `file_url` stored in the database is a public URL (`/object/public/operator-documents/...`). When staff clicks "View Receipt," it opens this URL in a new tab, which fails because private buckets don't serve files via public URLs.

This affects two locations:
1. **Staff side** (`OperatorDetailPanel.tsx` line 3853) — opens raw URL in new tab
2. **Operator side** (`PEScreeningTimeline.tsx` line 220) — same pattern

### Fix

**1. Fix the upload to store the raw storage path instead of a public URL** (`PEScreeningTimeline.tsx`)
- Store just the path (e.g., `{operatorId}/pe_receipt/{timestamp}.{ext}`) so signed URLs can be generated on demand
- This aligns with the project's established pattern noted in the security memory

**2. Fix the staff "View Receipt" to use the in-app FilePreviewModal** (`OperatorDetailPanel.tsx`)
- Replace the `<a href target="_blank">` with a button that opens the existing `FilePreviewModal` / blob-based viewer
- Generate a signed URL on click, matching the pattern used for other private documents (Form 2290, Truck Title, etc.)

**3. Fix the operator "View Receipt" link** (`PEScreeningTimeline.tsx`)
- Same approach: use signed URL + in-app viewer instead of raw public URL

### Files changed

| File | Change |
|------|--------|
| `src/components/operator/PEScreeningTimeline.tsx` | Store raw path in `operator_documents.file_url`; use signed URL for the receipt viewer link |
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace the `<a>` tag for PE Receipt with a button that generates a signed URL and opens the in-app file preview modal |

### Note
The existing receipt for Jocquan Scott has an invalid public URL already stored. The fix will handle both old public URLs (by extracting the path portion) and new raw paths when generating signed URLs.

