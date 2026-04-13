

## Fix CDL / Document Preview — "Could not load document inline" Error

### Problem
When staff click the "eye" icon to view CDL or Medical Certificate documents in the Operator Detail Panel, the viewer shows "Could not load document inline" instead of rendering the image. This affects all applicants.

### Root Cause
The `FilePreviewModal` fetches **all** files through `useBlobUrl`, which uses `fetch()` to download the file as a blob. For signed URLs from the `application-documents` private bucket, this `fetch()` call can fail due to CORS restrictions — the browser blocks cross-origin `fetch()` requests even though the same URL would work perfectly fine in an `<img src="...">` tag.

Images don't need the blob workaround at all — the blob approach exists to bypass `X-Frame-Options` headers that block iframes, but `<img>` tags have no such restriction.

### Solution
Two changes in `src/components/inspection/DocRow.tsx`:

**1. For images: skip blob, use resolved URL directly in `<img>`**
When the URL is detected as an image, render the `<img>` tag with the resolved signed URL directly instead of waiting for the blob. This bypasses the CORS issue entirely and is simpler.

**2. Add fallback: if blob fails but file is an image, render `<img>` with original URL**
As a safety net, when `error` is true and `isImage` is true, render the image using the resolved URL instead of showing the error message. This handles edge cases where the blob fetch fails for any reason.

### File Changed
| File | Change |
|------|--------|
| `src/components/inspection/DocRow.tsx` | Update `FilePreviewModal` to render images directly from resolved URL instead of requiring blob; add image fallback when blob fetch fails |

### Technical Detail
- `<img>` tags don't need CORS to render cross-origin images — only `fetch()` and `<iframe>` are affected
- The existing `useBlobUrl` hook will still be used for PDFs (which need blob for iframe rendering)
- The `resolvedUrl` (already computed at line 214) will be used as the `<img src>` for image files
- Zoom controls will continue to work via CSS `transform: scale()`

