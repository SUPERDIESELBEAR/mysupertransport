
## Audit: All PDF/document viewers across the app

### Summary of findings

Every `<iframe>` in the app falls into one of three categories:

**Category A — Already using `FilePreviewModal` (correct, no action needed)**
- `ContractorPaySetup.tsx` — just fixed
- `PEScreeningTimeline.tsx` — uses `FilePreviewModal`
- `OperatorStatusPage.tsx` — uses `FilePreviewModal`
- `OperatorBinderPanel.tsx` — uses `FilePreviewModal`
- `InspectionBinderAdmin.tsx` — uses `FilePreviewModal`
- `OperatorInspectionBinder.tsx` — uses `FilePreviewModal`

**Category B — Video/YouTube iframes (correct, no action needed)**
These embed YouTube/Vimeo URLs (not Supabase storage), so `X-Frame-Options` does not apply. `DocumentViewer.tsx`, `DocumentEditorModal.tsx`, `ResourceFormModal.tsx`, `ResourceViewer.tsx` video blocks — all fine.

**Category C — Direct Supabase URL iframes (broken — need fixing)**

1. **`OperatorDetailPanel.tsx` lines 4781–4822** — Staff-side "Company Payroll Doc Preview Modal". Identical to the old `ContractorPaySetup` bug: `DialogContent` with its own X close button + a direct `<iframe src={signedUrl}>`. Will show blank PDFs and has the same double-X potential if a manual close button were added. → Replace with `FilePreviewModal`.

2. **`DocumentViewer.tsx` lines 147–155** — Operator Document Hub PDF viewer. Renders a document's `pdf_url` (a Supabase storage URL) in a plain iframe embedded inline in a page (not a Dialog, so no double-X issue, but PDFs will be blank). → Replace inline iframe with a blob-fetching approach or swap to `FilePreviewModal`.

3. **`ResourceViewer.tsx` lines 160–165** — Service Library PDF viewer (operator-facing). Same issue: direct `pdf_url` in a plain iframe. No dialog/double-X, but PDFs will be blank. → Same fix.

4. **`InspectionSharePage.tsx` lines 98–105** — Public share page. Uses `doc.file_url` directly. This is a public-facing page accessed without auth — the URL here may be a public URL (not a signed Supabase URL), so it may already work. Worth fixing consistently anyway.

5. **`DocumentEditorModal.tsx` lines 522–530** — Staff-side document editor PDF preview (admin-only, shows preview of a doc being edited). Uses `pendingPdfUrl` (a blob URL from `URL.createObjectURL` for a local file upload) or `form.pdf_url`. The `pendingPdfUrl` is already a blob URL so it works. `form.pdf_url` is a Supabase URL and may be blank. Low priority since this is a staff admin tool and not operator-facing.

---

### What to fix (prioritized)

**Fix 1 — `OperatorDetailPanel.tsx`** (staff side, high impact)
Replace the `Dialog + DialogContent + iframe` block (lines 4781–4822) with `FilePreviewModal`. This is the exact same pattern as the old `ContractorPaySetup` bug. Import `FilePreviewModal` from `@/components/inspection/DocRow`, remove the `Dialog`/`DialogContent` block, and render:
```tsx
{previewDoc && (
  <FilePreviewModal url={previewDoc.url} name={previewDoc.title} onClose={() => setPreviewDoc(null)} />
)}
```

**Fix 2 — `DocumentViewer.tsx`** (operator Document Hub, medium impact)
Replace the inline `<iframe src={doc.pdf_url}>` with `FilePreviewModal`. Since `DocumentViewer` is a full-page component (not a dialog), the `FilePreviewModal` will render as a full-screen overlay when the user is reading the document — which is the right UX. Add a "View PDF" button that opens the `FilePreviewModal`, and replace the blank iframe with it. Or, use a blob-fetch approach inline. Simplest: render a "View PDF" button + `FilePreviewModal` state.

**Fix 3 — `ResourceViewer.tsx`** (operator Service Library, medium impact)
Same approach as DocumentViewer — replace the `<iframe src={url}>` with a "View PDF" button that opens `FilePreviewModal`.

**Fix 4 — `InspectionSharePage.tsx`** (public share page, lower priority)
This page is public (no auth) and the URL may be a public Supabase storage URL. Test first; if PDFs are already rendering, leave it. If not, swap to blob-based approach.

**Fix 5 — `DocumentEditorModal.tsx`** (staff admin only, lowest priority)
The `pendingPdfUrl` path already works (it's a blob URL). The `form.pdf_url` path may be blank for staff admins previewing existing docs. Leave for a later pass.

---

### Files to change

1. `src/pages/staff/OperatorDetailPanel.tsx` — swap Dialog+iframe → `FilePreviewModal`
2. `src/components/documents/DocumentViewer.tsx` — swap inline iframe → `FilePreviewModal` via state button
3. `src/components/service-library/ResourceViewer.tsx` — swap inline iframe → `FilePreviewModal` via state button

**No database changes. No new components. No edge functions.**
