

## Fix three glitches in the Truck Photo Guide

You're hitting three distinct bugs, all confined to the truck photo flow. Here's what's broken and how each gets fixed.

### Glitch 1 — Spinner never stops after taking a photo

**Root cause:** When the photo upload runs in `TruckPhotoGuideModal.handleFileSelect`, two things go wrong on iPhone captures:

1. iOS Safari sometimes returns an empty `file.type` for camera captures. The MIME→extension map only handles known MIMEs, so `ext` falls through to whatever the camera-generated filename has — often a generic name with no extension → resulting upload path becomes `..._timestamp.undefined`, which Storage may reject with a slow/silent error.
2. The error path *does* clear `setUploading(false)`, but if the network request hangs (no response), the `try/catch` never resolves → spinner spins forever.

**Fix:**
- Force a default extension (`'jpg'`) when neither MIME nor filename extension resolves cleanly.
- Wrap the upload in a 60-second timeout (`Promise.race`) so a hung request always fails loudly with a toast and clears the spinner.
- Surface the actual error message in the toast so we can see what Storage said next time.

### Glitch 2 — Photos invisible when clicking "View"

**Root cause:** `TruckPhotoGuideModal` saves the bare path (e.g., `{operatorId}/truck_photos/front_1714000000.jpg`) into `operator_documents.file_url`. But the `useSignedUrl` hook inside `FilePreviewModal` only auto-signs paths that start with `applications/` or `inspection-documents/`. An operator-UUID-prefixed path is never signed → `<img src="...">` gets a relative path → broken image, blank screen.

For comparison, the regular `OperatorDocumentUpload.handleUpload` path generates a 365-day signed URL at upload time and stores the full URL — that's why every other doc type previews fine.

**Fix:**
- Update `TruckPhotoGuideModal.handleFileSelect` to mirror the existing pattern: after upload, call `createSignedUrl(path, 60*60*24*365)` and store the **signed URL** in `operator_documents.file_url` (not the bare path). This matches every other slot in the app and the existing previews will then work without further changes.

### Glitch 3 — No way to back out of the preview; swipe navigates to Notification History

**Root cause:** `FilePreviewModal` is a custom fixed-position overlay (not a Radix `Dialog`), and it does **not** call `useBackButton`. So:
- The PWA's hardware back / swipe-back gesture is unhandled by the modal → it triggers normal browser history navigation instead of closing the preview.
- After swiping twice, you land on whatever was earlier in the history stack (Notification History was the last page you visited before opening Documents).
- The modal's only close affordances are the small `X` in the top-right corner and `Esc` (no keyboard on phone). On a tall mobile screen with a long photo, the `X` may also be off-screen behind the iOS browser chrome.

**Fix:**
- Add `useBackButton(true, onClose)` to `FilePreviewModal` so swipe-back / hardware-back closes the preview cleanly without escaping the page.
- Add a visible **"← Back"** button on the left side of the preview header (mirrors the close button). Now there's a deliberate close target plus the gesture works.

### Files touched

- `src/components/operator/TruckPhotoGuideModal.tsx` — extension fallback, upload timeout, store signed URL.
- `src/components/inspection/DocRow.tsx` — `useBackButton` wiring + visible back button in `FilePreviewModal` header.

### Technical notes

- **Extension fallback order:** `MIME_EXT[file.type] || file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || 'jpg'`. iPhone HEIC captures sometimes report `image/heic` (works) and sometimes empty type with `IMG_1234.HEIC` filename (now handled) and rarely both empty (defaults to `jpg`, file still uploads with the right bytes — Storage doesn't care about the extension for object integrity).
- **Upload timeout:** `Promise.race([uploadPromise, new Promise((_, r) => setTimeout(() => r(new Error('Upload timed out — check connection')), 60000))])`. 60s is generous for a 10 MB photo on LTE.
- **Signed URL storage:** use `getPublicUrl` as a final fallback in case `createSignedUrl` returns null (matches the existing pattern in `OperatorDocumentUpload`).
- **`useBackButton` in `FilePreviewModal`:** the hook pushes a virtual history entry on mount and intercepts the resulting `popstate` to call `onClose`. The hook is already imported in `DocRow.tsx`; we just need to call it inside `FilePreviewModal`.
- **Back button position:** added to the **left** of the filename in the header (currently only the document icon + name sit there), so it's reachable with the thumb and visually balances the existing right-side action cluster.

### Out of scope

- Refactoring `useSignedUrl` to handle arbitrary `operator-documents` bare paths (we're standardizing on storing signed URLs at upload time, which is already the pattern everywhere else; not worth changing the hook).
- Reworking the truck photo modal into a multi-photo bulk upload (separate plan if you want it).

