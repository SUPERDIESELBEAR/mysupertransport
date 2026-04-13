

## Fix CDL / Medical Certificate Image Loading in Inspection Binder

### Problem
CDL and Medical Certificate documents show a broken image icon because many `file_url` values in the `inspection_documents` table are raw storage paths like `applications/1774917461311_cdxdaw4antg.JPG`. These are paths within the **`application-documents`** private bucket, but the `resolveDocumentUrl` function doesn't recognize this pattern. It falls through to treating them as relative app URLs, causing the browser to load the SPA's HTML instead of the image.

Some docs have proper full signed URLs (e.g., `https://...supabase.co/storage/v1/object/sign/inspection-documents/...`), while the broken ones have bare paths like `applications/...`.

### Root Cause
When CDL/Medical Certificate files are copied from the `applications` table into `inspection_documents`, the raw `application-documents` bucket path is stored as-is (e.g., `applications/1774917461311_cdxdaw4antg.JPG`) without a `file_path` value. The viewer has no way to know which bucket this belongs to or how to generate a signed URL.

### Solution
Update `FilePreviewModal` and its supporting logic in `DocRow.tsx` to detect bare `applications/...` paths and generate a signed URL from the `application-documents` storage bucket on-the-fly.

**File: `src/components/inspection/DocRow.tsx`**

1. Update `resolveDocumentUrl` (or add a new async resolver) to detect `applications/...` paths
2. When detected, use `supabase.storage.from('application-documents').createSignedUrl(path, 3600)` to get a proper signed URL
3. Since `createSignedUrl` is async, add a `useEffect` in `FilePreviewModal` that resolves the URL before rendering the `<img>` tag
4. Handle the signed URL response — the API returns relative paths like `/object/sign/...`, so prepend `VITE_SUPABASE_URL` as we already do

### Technical Detail
- The bare path format is `applications/<timestamp>_<random>.<ext>` — this is the object key inside the `application-documents` bucket
- `file_path` is `null` for these records, so we can't rely on it
- The signed URL generation needs the Supabase client import
- The existing `resolveDocumentUrl` is synchronous; we'll add an async URL resolution step specifically for `FilePreviewModal`

### Files Changed
| File | Change |
|------|--------|
| `src/components/inspection/DocRow.tsx` | Add async signed URL generation for `applications/...` paths in `FilePreviewModal`; add loading state while URL resolves |

