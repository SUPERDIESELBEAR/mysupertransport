

## Fix the truck photo flow for Samsung Android (and all mobile)

### Why the previous diagnosis was off

I had framed the symptoms around iPhone quirks, but you're on Samsung Android — the **mechanism is different but the fixes are the same**. Here's the corrected picture:

### What's actually breaking on Samsung Android

1. **"Next Photo" button stays gray after taking the photo**
   - Samsung's stock Camera app sometimes hands Chrome a file with **blank `file.type`** and a generic filename (e.g. `1714000000.jpg` or even no extension at all when sharing through certain Samsung gallery flows).
   - `validateFile()` requires the MIME to be in its allow-list. With blank MIME and no extension, it rejects the file with a toast like *"File type not allowed (UNKNOWN)"* — the toast may be hidden behind the modal so you don't notice.
   - Result: `uploaded[slot.key]` never gets set → button stays gray → you can keep advancing without anything actually saving.
   - Also: the input has `accept=".jpg,.jpeg,.png,.heic"`. Samsung's HDR/Scene Optimizer mode occasionally produces `.heif` files. Chrome may filter those out before `onChange` fires.

2. **"View photo" shows nothing**
   - The inline "View photo" link inside the guide is a raw `<a href={fileUrl} target="_blank">`. On Samsung Internet / Chrome PWA this opens a new tab *outside* the PWA. If the URL is relative or expired, the new tab gets a 404 / blank page.
   - Separately, the Documents tab's preview only auto-signs paths starting with `applications/` or `inspection-documents/`. Operator-prefixed paths (`{uuid}/truck_photos/...`) aren't signed → broken `<img>` → blank screen.

### The fix (works for Android, iOS, and desktop)

**A. Make camera files always pass validation**
- Add a small normalization step in `TruckPhotoGuideModal.handleFileSelect` that runs **before** `validateFile()`:
  - If `file.type` is blank, infer from extension; if extension is also missing, default to `image/jpeg`.
  - If filename has no extension, append `.jpg`.
  - Wrap into a fresh `File` object with the corrected name + type so validation accepts it.
- Broaden the input `accept` to `image/*` so Samsung HDR/HEIF captures aren't filtered at the picker level.

**B. Make the "Next Photo" button reflect reality**
- Already wired to `uploaded[currentSlot.key]` — once normalization fixes upload, this turns gold automatically.
- Add a clearer toast on failure (already in place; we'll surface the actual storage error instead of a generic "Unknown error" so we can debug if it ever happens again).

**C. Fix the inline "View photo" link**
- Replace the raw `<a target="_blank">` with the in-app `FilePreviewModal` (the same one the Documents tab uses). This guarantees:
  - URL gets normalized through `resolveDocumentUrl`/`useSignedUrl` before display
  - Hardware back / swipe-back closes the preview cleanly (already wired in `FilePreviewModal`)
  - The preview stays inside the PWA — no escape to a tab that might 404

**D. Fix the Documents-tab preview for operator-uploaded truck photos**
- Extend `useSignedUrl()` and `inferStorageInfo()` in `DocRow.tsx` to recognize bare operator-document paths (`{uuid}/...`) and sign them on the fly. Backwards-compatible — also still works for the new signed URLs we now store at upload time.

### Files touched

- `src/lib/validateFile.ts` — add `normalizeMobileCaptureFile()` helper that backfills MIME + extension from camera captures.
- `src/components/operator/TruckPhotoGuideModal.tsx` — call the normalizer before `validateFile`; broaden input `accept` to `image/*`; replace inline `<a>` with `FilePreviewModal`.
- `src/components/inspection/DocRow.tsx` — extend `useSignedUrl` + `inferStorageInfo` to handle bare `{operator-uuid}/...` paths.

### Why this works on Android specifically

- Samsung Camera → blank `file.type` + generic `1714…jpg` name → normalizer detects `.jpg` extension, sets `image/jpeg` → validation passes → upload runs → button turns gold.
- Samsung HDR → `.heif` capture → broadened `accept="image/*"` lets it through the picker → normalizer recognizes `.heif` extension → upload runs.
- Samsung Internet / Chrome PWA → in-app preview modal stays inside the PWA, no broken new-tab navigation.

### Out of scope

- Backfilling existing broken truck-photo records — once `useSignedUrl` is extended in step D, old records with bare paths will start rendering correctly automatically. No migration needed.
- HEIC → JPG conversion — not necessary; the storage bucket accepts HEIC and the in-app viewer renders it on modern Android. If we ever need universal HEIC support across all browsers, we can add a converter as a follow-up.

