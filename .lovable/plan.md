
## Root Cause

The "ELD Quick Start Guide" lives in the **Resource Library** tab of the Operator Portal — rendered by `OperatorResourcesAndFAQ.tsx` (`OperatorResourceLibrary` component). This is a **separate** component from the Service Library (`ResourceViewer.tsx`) that was fixed earlier.

In `OperatorResourcesAndFAQ.tsx` (lines 92–102), every document card renders a plain `<a href={doc.file_url} target="_blank" download>` anchor tag. That's what opens the new browser tab — it was never updated to use `FilePreviewModal`.

The Management Portal's `ResourceLibraryManager.tsx` (lines 462–471) has the same issue: its "Preview file" button is also a plain `<a href target="_blank">` link.

---

## Fix

**File 1: `src/components/operator/OperatorResourcesAndFAQ.tsx`**

Replace the `<a href target="_blank" download>` "Download" link with two side-by-side buttons:
- **View** — opens `FilePreviewModal` (in-app PDF viewer)
- **Download** — keeps a direct download link (useful for saving to device)

Add `FilePreviewModal` import, add `previewDoc` state to track which document is open.

**File 2: `src/components/management/ResourceLibraryManager.tsx`**

Replace the `<a href target="_blank">` "Preview file" anchor (lines 462–471) with a button that opens `FilePreviewModal`. Import `FilePreviewModal` and add `previewUrl`/`previewTitle` state at the top of `ResourceLibraryManager`.

---

## What won't change

- Download behaviour is preserved alongside the View button in the Operator Portal
- All other actions (edit, delete, visibility toggle, history) in the Management list are untouched
- No database changes, no new components, no edge functions
