

## Add In-App Document Editor

### What it does
Adds an "Edit" button to the existing `FilePreviewModal` that opens a full image editor. Staff can edit any uploaded document; operators can edit only their own uploads. Supports JPG/PNG directly and PDFs by rendering pages as images first.

### Library choice
**react-filerobot-image-editor** — free, MIT-licensed, React-native component with crop, rotate, flip, brightness/contrast, filters, and annotations (text, shapes, arrows, drawing). No backend needed — all processing happens client-side on a canvas.

### How PDFs are handled
PDFs cannot be edited directly on a canvas. The editor will use **pdfjs-dist** to render each PDF page as an image. Staff selects which page to edit, edits it as an image, and saves the result as a new file (JPG/PNG) uploaded alongside or replacing the original. A full PDF re-assembly is complex and rarely needed for scan cleanup — saving edited pages as images is the practical approach.

### Technical plan

**1. Install dependencies**
- `react-filerobot-image-editor` (+ peer dep `react-konva`)
- `pdfjs-dist` (for rendering PDF pages to canvas/image)

**2. Create `src/components/shared/DocumentEditor.tsx`**
- A modal component wrapping `FilerobotImageEditor`
- Props: `fileUrl`, `fileName`, `bucketName`, `filePath`, `onSave`, `onClose`
- On open: fetch file as blob, detect type (image vs PDF)
- If PDF: use pdfjs to render selected page → feed image to editor
- If image: feed directly to editor
- Editor tabs: Adjust (brightness, contrast), Filters, Crop, Rotate, Resize, Annotate (text, shapes, arrows, pen)
- On save: upload edited image back to the same storage bucket (as a new version or replacement), then call `onSave` callback

**3. Add "Edit" button to `FilePreviewModal` (`src/components/inspection/DocRow.tsx`)**
- New pencil/edit icon in the header toolbar (next to print/download)
- Visible based on permissions:
  - Staff/management: always shown
  - Operators: shown only when viewing their own uploads
- Opens `DocumentEditor` with the current file URL and storage path

**4. Permission logic**
- Use existing `useAuth` hook to get current user role
- Pass `canEdit` prop into `FilePreviewModal`
- Staff roles (`onboarding_staff`, `dispatcher`, `management`): `canEdit = true` for all files
- Operator role: `canEdit = true` only when `file.driver_id === currentUser.id` (their own uploads)

**5. Save behavior**
- Edited file uploaded to the same bucket with suffix `_edited` or replaces original (based on context)
- Update the relevant database record (`file_url`) if replacing
- Toast confirmation on success

### Files changed
| File | Change |
|------|--------|
| `package.json` | Add `react-filerobot-image-editor`, `react-konva`, `pdfjs-dist` |
| `src/components/shared/DocumentEditor.tsx` | **New** — editor modal component |
| `src/components/inspection/DocRow.tsx` | Add Edit button to `FilePreviewModal` header |

### Limitations
- PDF editing works page-by-page (renders page as image, saves as image) — not full PDF reassembly
- Very large images may be slow on lower-end devices (client-side canvas processing)

