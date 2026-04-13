

## Fix Resource Center: Email, Mobile PDF Viewing, and Navigation

### Problems
1. No way for operators to email/share files from the Resource Center
2. PDFs fail to render on mobile phones (iframes don't reliably display PDFs on iOS/Android)
3. Non-PDF files (like Adobe .ai) just download — no meaningful preview possible
4. After opening a file viewer, pressing the phone's back button navigates away from the app instead of closing the viewer

### Plan

**1. Add "Email" / Share button to each resource card**

Add a share/email button that uses the Web Share API on mobile (which lets operators share via email, Messages, WhatsApp, etc.) with a fallback `mailto:` link on desktop that pre-populates the subject and body with the file's title and public URL.

- Add a `Mail` (or `Share2`) icon button next to the existing View/Download buttons
- On mobile: call `navigator.share({ title, text, url })` which opens the native share sheet
- On desktop: fall back to `mailto:?subject=...&body=...` with the file link

**2. Fix mobile PDF viewing**

The current `FilePreviewModal` uses an iframe with a blob URL. On many mobile browsers (especially iOS Safari), iframes cannot render PDFs. Replace the iframe approach on mobile with:
- For PDF files: Use an `<object>` tag with a blob URL, with a fallback that shows a "Download to view" button and an `<embed>` attempt
- Alternatively, detect mobile and show the PDF blob URL directly via `window.open` or render a simplified view with download/share CTAs instead of the non-functional iframe

The most reliable mobile-friendly approach: detect mobile + PDF, and instead of the iframe, show a clean card with the document title, a large "Open PDF" button (which opens the blob URL directly in the browser's native PDF viewer), and the share/download actions.

**3. Handle non-PDF files gracefully**

For files that aren't PDFs or images (like `.ai` files), skip the preview modal entirely and trigger a direct download via `downloadBlob`. Update the "View" button to show "Download" for non-viewable file types, or show a preview-unavailable card with download/share options.

**4. Wire up hardware back button for the preview modal**

Import and use the existing `useBackButton` hook in `FilePreviewModal` so that pressing the phone's hardware back button closes the viewer instead of navigating away from the app.

### Files Modified
| File | Change |
|------|--------|
| `src/components/operator/OperatorResourcesAndFAQ.tsx` | Add share/email button per resource; detect non-viewable files and skip preview |
| `src/components/inspection/DocRow.tsx` (`FilePreviewModal`) | Add `useBackButton` hook; add mobile-friendly PDF fallback; add share button to header toolbar |

### Technical Details
- The `useBackButton` hook already exists at `src/hooks/useBackButton.ts` — just import and call it
- The `resource-library` bucket is public, so `file_url` values are full public URLs that can be shared directly
- Web Share API (`navigator.share`) is widely supported on mobile browsers and provides native email/messaging integration
- File type detection will use the `file_name` or `file_url` extension to determine if a file is a PDF, image, or other

