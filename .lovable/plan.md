
## The Problem

The Document Hub currently only supports rich-text (TipTap editor) documents. There's no way to attach a PDF file as the document content. Drivers can acknowledge text-based documents by clicking a button, but there's no equivalent workflow for PDFs.

## The Solution

Add a **PDF attachment mode** to the Document Hub. Admins can choose between writing rich text OR uploading a PDF. Drivers see an embedded PDF viewer in the document viewer, then acknowledge they've read it using the same existing acknowledgment button. No new acknowledgment table or logic is needed — the same `document_acknowledgments` table handles it identically.

---

## What Changes

### 1. Database Migration
Add two columns to `driver_documents`:
- `pdf_url text` — public URL of the uploaded PDF from storage
- `pdf_path text` — storage path for file management/deletion
- `content_type text` — either `'rich_text'` (default) or `'pdf'`, so the viewer knows what to render

### 2. Storage
Use the existing `resource-library` public bucket (already exists and is public) to store document PDFs under a `doc-hub-pdfs/` prefix. No new bucket needed.

### 3. `DocumentHubTypes.ts`
Extend the `DriverDocument` interface with `pdf_url`, `pdf_path`, and `content_type` fields.

### 4. `DocumentEditorModal.tsx` — Admin Editor
- Add a **Content Type toggle**: "Rich Text" vs "PDF Upload" (radio or segmented control at the top of the Edit tab).
- When **PDF Upload** is selected: hide the TipTap editor, show a file drop zone that accepts `.pdf` files only. Upload on selection and show the filename + a remove button.
- When **Rich Text** is selected: existing TipTap editor appears as before.
- On save: persist `content_type`, `pdf_url`, `pdf_path` alongside existing fields. On overwrite (new PDF uploaded when one already exists), delete the old file from storage first.

### 5. `DocumentViewer.tsx` — Driver Viewer
- If `content_type === 'pdf'`: render an `<iframe src={doc.pdf_url}>` (or `<embed>`) at full width with a reasonable fixed height (e.g., 600px) instead of the TipTap HTML body.
- If `content_type === 'rich_text'` (default): existing `dangerouslySetInnerHTML` render, unchanged.
- The acknowledgment button at the bottom renders **identically** in both cases — drivers still click "I have read and understood this document" regardless of content type.

### 6. `DocumentCard.tsx`
- Show a small `FileText` PDF badge next to the category badge when `content_type === 'pdf'`, so drivers can see at a glance it's a PDF.

---

## UI Flow

**Admin side:**
```text
DocumentEditorModal → Edit Content tab
┌─────────────────────────────────────────────┐
│ Content Type:  [● Rich Text]  [○ PDF Upload] │
│                                              │
│  [Rich Text selected]                        │
│  ┌──────────────────────────────────────┐   │
│  │  TipTap editor (existing)            │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  [PDF Upload selected]                       │
│  ┌──────────────────────────────────────┐   │
│  │  Drop PDF here or click to browse    │   │
│  │  policy-handbook.pdf  [Remove]       │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Driver side:**
```text
DocumentViewer (PDF mode)
┌──────────────────────────────────────────────┐
│  [Category badge]  [Required badge]  [PDF]   │
│  Safety Handbook                             │
│  Last updated Mar 15                         │
│  ────────────────────────────────────────    │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │   <iframe — inline PDF render>         │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│  ────────────────────────────────────────    │
│  [ I have read and understood this document ]│
└──────────────────────────────────────────────┘
```

---

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/` | Add `pdf_url`, `pdf_path`, `content_type` columns to `driver_documents` |
| `src/components/documents/DocumentHubTypes.ts` | Extend `DriverDocument` interface |
| `src/components/documents/DocumentEditorModal.tsx` | Content type toggle + PDF upload zone |
| `src/components/documents/DocumentViewer.tsx` | Conditional PDF iframe vs rich text body |
| `src/components/documents/DocumentCard.tsx` | PDF badge indicator |

No changes to acknowledgment logic, the compliance dashboard, or any other component — existing behavior is fully preserved.
