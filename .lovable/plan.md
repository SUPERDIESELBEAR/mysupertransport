

## Fix: Truck Photos Not Displaying on Staff Dashboard

### Root Cause
The upload logic in `TruckPhotoGuideModal.tsx` attempts to generate a signed URL and store it as `file_url`. However, `createSignedUrl` can return a relative path or fail silently, resulting in an empty string being saved to the database. The staff-side `TruckPhotoGridModal.tsx` then tries to re-sign an empty path, which fails, and falls back to the emoji placeholder.

This also contradicts the project's established pattern: **all other uploads store the raw storage path** (e.g. `operatorId/truck_photos/Front_12345.jpg`), not a signed URL. The staff-side modal already generates its own signed URLs from the raw path.

### Fix

**File: `src/components/operator/TruckPhotoGuideModal.tsx` (~lines 145-156)**

Remove the `createSignedUrl` call entirely. Store the raw storage path as `file_url` instead:

```typescript
// BEFORE (broken):
const { data: signedData } = await supabase.storage
  .from('operator-documents')
  .createSignedUrl(path, 60 * 60 * 24 * 365);
const fileUrl = signedData?.signedUrl ?? '';

// AFTER (correct):
const fileUrl = path;  // Store raw path, not a signed URL
```

This is a one-line change. The staff-side `TruckPhotoGridModal` already calls `extractStoragePath` and `createSignedUrl` on-demand, so raw paths are exactly what it expects.

### Also fix: existing empty record in database

The previously uploaded photo for Marcus Mueller has an empty `file_url`. We should note that the photo file itself was uploaded successfully to storage — only the database record is missing the path. The user may need to re-upload via the guide to get a working record, or we can provide a manual DB fix if needed.

### Files Modified
| File | Change |
|------|--------|
| `src/components/operator/TruckPhotoGuideModal.tsx` | Store raw storage path instead of signed URL as `file_url` |

