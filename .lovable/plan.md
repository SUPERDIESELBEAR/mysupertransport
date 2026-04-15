

## Convert PDFs to Editable Images in FilePreviewModal

### What this does
When viewing a PDF document anywhere in the app, users will see the same pencil (edit) icon that currently only appears for image files. Clicking it will:
1. Render the PDF's first page to a canvas using `pdfjs-dist` (Mozilla's PDF.js library)
2. Export that canvas as a PNG
3. Open the existing `DocumentEditor` with that PNG
4. On save, overwrite the original file in storage with the edited PNG (changing the extension from `.pdf` to `.png`)

### How it works

**1. Install `pdfjs-dist`** — the standard client-side PDF rendering library (~400KB).

**2. Create a helper `pdfToImage.ts`** in `src/lib/`:
- Takes a PDF URL, renders page 1 at 2x resolution to a canvas
- Returns a PNG data URL
- Handles CORS by fetching the PDF as a blob first (same pattern we use for iframe rendering)

**3. Update `FilePreviewModal` in `DocRow.tsx`:**
- Remove the `&& isImage` guard on line 403 so the pencil appears for PDFs too
- When the user clicks the pencil on a PDF, call the `pdfToImage` helper first
- Pass the resulting PNG data URL to `DocumentEditor` instead of the PDF URL
- On save, the file is stored as `.png` (replacing `.pdf` in the storage path), and the database `file_url` is updated accordingly

**4. Update `DocumentEditor.tsx`:**
- When saving an edited PDF-turned-PNG, adjust the storage path to use `.png` extension
- Update the corresponding database record (`inspection_documents.file_url` or `operator_documents.file_url`) so future loads reference the new PNG

### Important considerations
- **Multi-page PDFs**: Only the first page will be editable. This is appropriate for most trucking documents (CDLs, registrations, inspection reports) which are typically single-page scans.
- **One-way conversion**: Once a PDF is edited and saved as PNG, it stays as a PNG. The original PDF is replaced.
- **No database migration needed** — file URLs are already flexible strings.

### Files to change
| File | Change |
|------|--------|
| `package.json` | Add `pdfjs-dist` dependency |
| `src/lib/pdfToImage.ts` | New helper: render PDF page 1 → PNG data URL |
| `src/components/inspection/DocRow.tsx` | Remove `isImage` guard on pencil; add PDF→image conversion before opening editor; update DB `file_url` on save with new extension |
| `src/components/shared/DocumentEditor.tsx` | Handle `.pdf` → `.png` extension swap in save path |

