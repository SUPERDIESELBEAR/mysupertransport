

## Fix: Truck Photo Grid Modal — Use Signed URLs

### Problem
The `TruckPhotoGridModal` renders `<img src={file.file_url}>` directly using raw storage paths from the private `operator-documents` bucket. Images fail to load because private buckets require signed URLs.

### Fix

**File: `src/components/staff/TruckPhotoGridModal.tsx`**

1. **Generate signed URLs on modal open** — Add a `useEffect` that loops through all `files`, extracts the storage path from each `file_url` (handling both legacy public URLs and raw paths, same as the PE receipt fix), calls `supabase.storage.from('operator-documents').createSignedUrl(path, 3600)`, and stores results in a `Record<string, string>` map keyed by file `id`.

2. **Use signed URLs for rendering** — Replace all direct `file.file_url` references with lookups into the signed URL map:
   - Grid cell `<img src>` (line 222)
   - Lightbox `<img src>` (line 183) — pass the signed URL into lightbox state instead of raw `file_url`
   - Grid cell click handler (line 217)
   - "Other Files" `<a href>` links (line 155)
   - Non-image "View file" link (line 243-252)

3. **Path extraction helper** — Reuse the same pattern from the PE receipt fix: if `file_url` starts with `http`, split on `/operator-documents/` to get the path; otherwise use as-is.

4. **Loading state** — Show a subtle spinner/skeleton while signed URLs are being generated so cells don't flash broken images.

### Files changed

| File | Change |
|------|--------|
| `src/components/staff/TruckPhotoGridModal.tsx` | Add signed URL generation via `useEffect`; replace all raw `file_url` usage with signed URL lookups |

