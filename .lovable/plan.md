

## Fix Image Previews in Inspection Binder

### Problem
When clicking the "eye" icon to view documents in the Inspection Binder, images (JPG, PNG, etc.) don't load properly. The `FilePreviewModal` renders **all** files inside an `<iframe>`, which works for PDFs but fails for images — browsers either show a tiny thumbnail or a blank frame.

### Solution
Detect whether the file is an image (based on URL extension or blob MIME type) and render it with an `<img>` tag instead of an iframe. This is a single-file change in the `FilePreviewModal` component.

### Changes

**File: `src/components/inspection/DocRow.tsx`**

1. Add an `isImage` check based on file extension (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`)
2. When the file is an image: render a zoomable `<img>` element instead of the iframe
3. Keep the iframe path for PDFs and other document types
4. Update the `useBlobUrl` hook to also expose the blob's MIME type so we can double-check image detection

The image will be rendered centered in the viewer area with `object-contain` styling, supporting the existing zoom controls. The `onLoad` handler will still trigger so the loading spinner dismisses correctly.

### Technical Detail
- The `isImage` regex: `/\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i`
- The `<img>` tag uses the same `blobUrl` already fetched by `useBlobUrl`
- Zoom scaling applies via CSS `transform: scale()` just like the iframe
- Mobile PDF fallback logic remains unchanged

