

## Fix: Form 2290 (and other Stage 2 doc) previews fail to load

### Problem
When clicking "View" on a Form 2290 file (or Truck Title, Truck Inspection) in the uploaded files popover, the raw storage path is passed directly to `FilePreviewModal`. Since the `operator-documents` bucket is private, it needs a signed URL — but no signed URL is generated. The PE Receipt view already does this correctly (line ~3860), but the generic doc popover view (line 4109) skips that step.

### Fix

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. Change the "View" button `onClick` handler (around line 4107-4109) to generate a signed URL before setting `stage2Preview`, using the same pattern as the PE receipt viewer:
   - Extract the storage path from `f.file_url` (strip any full URL prefix to get just the relative path)
   - Call `supabase.storage.from('operator-documents').createSignedUrl(path, 3600)`
   - Only then call `setStage2Preview` with the signed URL

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Generate signed URL before opening FilePreviewModal for Stage 2 doc files |

