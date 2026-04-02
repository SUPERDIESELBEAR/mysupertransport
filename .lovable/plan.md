

## Fix Document Editing Black Screen + Consistent Viewer Behavior

### Problems identified

1. **Black screen when editing**: The `DocumentEditor` receives a signed/storage URL for cost attachments. When `react-filerobot-image-editor` initializes, it can fail silently if the fetch returns a CORS error or the blob conversion produces an invalid data URL — the editor shows a black canvas with no fallback. Additionally, the editor overlay at `z-[60]` sits below the Suspense fallback at `z-[9999]`, which can cause layering issues.

2. **No edit button on Stage 2 docs**: The Stage 2 `FilePreviewModal` (line 5585) has no `onEdit` callback, so the pencil icon never appears for Form 2290, Truck Title, etc.

3. **Inconsistent display**: Some attachments render as iframes (PDFs), some as images — this is actually correct behavior, but the viewer doesn't normalize the visual frame. The real inconsistency is that different surfaces (Stage 2 vs. cost attachments vs. inspection binder) wire up the preview modal differently.

4. **App revert on close**: When `DocumentEditor` crashes (black screen), closing it can cause React to lose component state because the error isn't caught. A missing `ErrorBoundary` around the lazy-loaded editor means a crash takes down the parent component tree.

### Plan

**1. Harden `DocumentEditor` — prevent black screen** (`src/components/shared/DocumentEditor.tsx`)

- Add error state and catch block around the `FilerobotImageEditor` initialization
- If the image source fails to load (fetch error, invalid blob), show an error message with a "Close" button instead of a black void
- Add an `ErrorBoundary` wrapper inside the component to catch internal editor crashes
- Fix z-index to `z-[9999]` to match the Suspense fallback

**2. Add `onEdit` to Stage 2 document preview** (`src/pages/staff/OperatorDetailPanel.tsx`)

- Add `stage2Editing` state (same pattern as `costEditing`)
- Wire `onEdit` callback into the Stage 2 `FilePreviewModal` (line 5585)
- Add a `DocumentEditor` instance for stage 2 edits below the existing cost editor
- Derive the correct storage path from the stage 2 document's `file_url` (bucket: `operator-documents`, path: `{operatorId}/{docType}/...`)

**3. Add `onEdit` to the main `previewDoc` modal** (`src/pages/staff/OperatorDetailPanel.tsx`)

- The first `FilePreviewModal` (line 5580) for general onboarding docs also lacks an `onEdit` — add it with the same pattern

**4. Wrap all `DocumentEditor` instances in ErrorBoundary** (`src/pages/staff/OperatorDetailPanel.tsx`)

- Add a simple `ErrorBoundary` class component that catches editor crashes and shows a toast + closes the editor cleanly, preventing the entire panel from unmounting

### Regarding a third-party uniform viewer plugin

I recommend **keeping the current approach** (preview-only with `FilePreviewModal`, edit with `react-filerobot-image-editor`) rather than adding a new third-party plugin. The current stack already handles PDFs, images, and HEIC well — the real issue is error handling and missing edit wiring, not the viewer itself. Adding another plugin would increase bundle size and introduce a new maintenance surface. The fixes above will make the experience consistent across all attachment types.

### Files changed

| File | Change |
|------|--------|
| `src/components/shared/DocumentEditor.tsx` | Add error boundary, error state fallback, fix z-index |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add `onEdit` to Stage 2 and general preview modals; add `stage2Editing` state + editor instance; wrap editors in ErrorBoundary |

