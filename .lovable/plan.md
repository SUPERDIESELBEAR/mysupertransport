
## Add PDF Viewer to All Resource Library Items

### What the request means

Currently:
- **Operator portal** (`ResourceViewer.tsx`): Only resources explicitly typed as "PDF" get a "View PDF" button. All other types (Setup Guide, FAQ, Contact & Support) that have a PDF URL show nothing or just an open-link button.
- **Management portal** (`ServiceLibraryManager.tsx` → `ResourceAdminRow`): Staff have no way to preview any PDF at all — only edit/delete buttons exist.

The goal: any resource that has a URL pointing to a PDF should be openable in the in-app `FilePreviewModal` PDF viewer, in both portals.

---

### Changes

**File 1: `src/components/service-library/ResourceViewer.tsx`**

The `renderContent()` function has separate branches for `Tutorial Video`, `External Link`, `PDF`, and a rich-text fallback. The `PDF` branch already uses `FilePreviewModal`.

Add a secondary "View PDF" button to the `External Link` branch and any other branch where `url` is set and does not parse as a video embed. This covers Setup Guide, FAQ, and Contact & Support resources that have a PDF stored at their URL. Specifically:
- In the `External Link` block: add a second "View PDF" button below "Open Link" when `url` ends in `.pdf` or has a PDF content indicator (or simply always offer it as a fallback — simplest is always show it for any URL that isn't a video).
- Add a catch-all: if `resource_type` is not `Tutorial Video` and not `External Link` and `url` is present (covers Setup Guide, FAQ, Contact & Support), render a "View PDF" button + `FilePreviewModal`.

The cleanest implementation: after each branch that has a `url`, check if a PDF viewer button should appear. Since staff can upload PDFs to any resource type, the rule is: **if `url` is present and not a video embed URL, show a "View PDF" button**.

**File 2: `src/components/service-library/ServiceLibraryManager.tsx`**

The `ResourceAdminRow` component (lines 626–687) has no preview. Add:
- Import `FilePreviewModal` from `@/components/inspection/DocRow`
- Add local state `const [previewUrl, setPreviewUrl] = useState<string|null>(null)` inside `ResourceAdminRow`
- Add a "Preview" button (eye icon) in the action bar, only shown when `resource.url` is set
- Render `FilePreviewModal` when `previewUrl` is set

---

### Files changed

1. `src/components/service-library/ResourceViewer.tsx` — make all resource types with a URL open in `FilePreviewModal`
2. `src/components/service-library/ServiceLibraryManager.tsx` — add PDF preview button to `ResourceAdminRow`

**No database changes. No new components. No edge functions.**
