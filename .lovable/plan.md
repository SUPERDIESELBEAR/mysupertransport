

## Fix White Screen When Opening Document Editor

### Problem
Clicking the edit pencil causes the entire screen to go white and the app locks up. The `DocumentEditor` component tries to `fetch(fileUrl)` to convert the image to a data URL for the editor canvas. However, Supabase storage signed URLs are cross-origin, so `fetch()` fails due to CORS restrictions. The `FilerobotImageEditor` may then receive invalid data and crash, or the fetch error may not be handled cleanly — either way resulting in a white screen at `z-[9999]` that covers the entire app with no way to navigate back.

### Root Cause
Line 100 of `DocumentEditor.tsx`: `const res = await fetch(fileUrl);` — this CORS-blocked fetch either throws (setting `loadError`) or returns HTML from the SPA fallback, which then gets passed to the image editor as a "data URL" and crashes it.

### Solution
When `bucketName` and `filePath` are provided (which they always are from `FilePreviewModal`), use the Supabase SDK to download the file directly instead of using `fetch()`. The SDK download bypasses CORS because it uses the authenticated API client.

**File: `src/components/shared/DocumentEditor.tsx`**

1. In the `loadSource` function (non-PDF branch, ~line 98), check if `bucketName` and `filePath` are available
2. If yes, use `supabase.storage.from(bucketName).download(filePath)` to get the blob
3. Fall back to `fetch(fileUrl)` only when bucket info is not available
4. Add a try/catch around the `FilerobotImageEditor` rendering that prevents white screen — ensure the error boundary and `loadError` state always show a recoverable UI with a working Close button
5. Wire `onClose` to also handle the back button so the app never gets stuck

### Files Changed
| File | Change |
|------|--------|
| `src/components/shared/DocumentEditor.tsx` | Use Supabase SDK download when bucket/path available; harden error handling to prevent white screen lockup |

