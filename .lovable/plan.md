# Open images & files in an in-app modal

## Goal
Stop image/file links in the authenticated app from opening in a new browser tab. Reuse the existing `FilePreviewModal` (exported from `src/components/inspection/DocRow.tsx`) so users stay inside SUPERDRIVE. Keep public share pages (PEI Respond, Inspection Share) and print/export routes as new-tab — those are out of scope.

## Approach
`FilePreviewModal` already handles images, PDFs (inline iframe with fallback), signed-URL resolution, and unsupported types (download card). It's used in ~24 places today. The remaining anchor tags and `window.open` calls in authenticated surfaces need to be converted to open the same modal, keeping an "Open in new tab" escape hatch inside the modal for iOS PDF reliability and printing.

## In-scope conversions

Each item below currently uses `<a target="_blank">` or `window.open(url)` and will switch to opening `FilePreviewModal`:

- **Staff — Operator Detail Panel** (`src/pages/staff/OperatorDetailPanel.tsx`)
  - Stage 6 PE results doc link (~line 5519)
  - Current-doc link (~line 228)
- **Operator — Document Upload** (`src/components/operator/OperatorDocumentUpload.tsx`)
  - Driver decal photo, passenger decal photo, truck photo thumbnails (lines ~825, 865, 903)
- **Staff — Decal Photo Editor** (`src/components/staff/StaffDecalPhotoEditor.tsx`) — thumbnails (137, 182)
- **Staff — Truck Photo Grid** (`src/components/staff/TruckPhotoGridModal.tsx`) — file links (218, 307)
- **Operator — Truck Info Card** (`src/components/operator/TruckInfoCard.tsx`) — truck photo (118)
- **Equipment — Asset Sheet** (`src/components/equipment/EquipmentAssetSheet.tsx`) — attachment link (689)
- **Equipment — History Modal** (`src/components/equipment/EquipmentHistoryModal.tsx`) — attachment (281)
- **Management — Application PEI Tab** (`src/components/pei/ApplicationPEITab.tsx`) — attachment (404)
- **Documents — Editor Modal** (`src/components/documents/DocumentEditorModal.tsx`) — doc link (934)

**Fallback inside modal:** `FilePreviewModal` already renders an "Open in new tab" link (see `DocRow.tsx:601, 847`, `BinderFlipbook.tsx:178, 196`). Confirm it's visible in every trigger surface and rendered for image, PDF, and unsupported types.

## Explicitly out of scope (staying as new-tab)

- **Chat attachments** — `MessageBubble.tsx`, `PinnedMessagesSheet.tsx` (per user answer)
- **Public share pages** — `InspectionSharePage.tsx`, `PEIRespond.tsx`, `PEIResponseViewer.tsx`
- **Print/HTML export routes** — `printDocument.ts`, `equipmentExport.ts`, `SubmittedApplicationSnapshot.tsx` (these open a print window, not a file)
- **`mailto:` / `sms:` / external links** — BinderFlipbook, DocRow, OperatorInspectionBinder, ServiceLibraryManager external-confirm, ServiceDetailPage support chat, EmailCatalog route preview

## Technical notes

- **Signed URLs:** any converted call site that references `/storage/v1/` must resolve URLs through the existing signed-URL helper (see `mem://arch/file-handling/signed-url-resolution`). Public buckets pass their URL through unchanged.
- **iOS PDF quirk:** inline `<iframe>` PDF rendering is unreliable on iOS Safari. The modal already falls back to a download button; the "Open in new tab" escape hatch remains for print/download.
- **Non-previewable types** (docx/xlsx/zip): `FilePreviewModal` already shows a download card — no change needed.
- **Trigger pattern:** each call site adopts a local `const [preview, setPreview] = useState<{url, name} | null>(null)` and renders `{preview && <FilePreviewModal ... onClose={() => setPreview(null)} />}` at the component root. Click handler becomes `onClick={(e) => { e.preventDefault(); setPreview({url, name}); }}` on the existing anchor (keeps right-click "open in new tab" for power users).

## Verification

- Emma's operator detail: click PE results doc → modal opens with PDF preview + "Open in new tab" button.
- Operator PWA: tap decal / truck photo → modal opens with image; ESC and hardware back close it (per `useBackButton` pattern).
- Equipment Asset Sheet attachment: image + PDF both preview inline; docx shows download card.
- Right-click on any converted link still offers "Open link in new tab" (native browser behavior — we're not removing `href`).
- Typecheck passes; no runtime console errors on modal open/close cycle.
