

## In-App Document Viewing and Editing for Application Review

### Summary
Replace the `target="_blank"` links for DL Front, DL Rear, and Medical Certificate in the Application Review Drawer with the existing `FilePreviewModal` component, and wire up the image editor so staff can crop/edit these documents in-app — matching the pattern already used in the Inspection Binder, Document Hub, and Operator Detail Panel.

### What will change

**File: `src/components/management/ApplicationReviewDrawer.tsx`**

1. Import `FilePreviewModal` from `@/components/inspection/DocRow`
2. Add state for which document is being previewed (`previewDoc: { url, name } | null`)
3. Add state and logic for image editing (lazy-load `react-filerobot-image-editor`, same pattern as other areas)
4. Replace the three `<a href="..." target="_blank">` links (DL Front, DL Rear, Medical Cert) with `<button>` elements that open `FilePreviewModal` in-app
5. Pass an `onEdit` callback to `FilePreviewModal` so the pencil/edit icon appears, launching the image editor
6. On edit save, upload the edited image back to the `application-documents` bucket and update the signed URL

### No other files changed
- `FilePreviewModal` and the image editor pattern already exist
- No database or backend changes needed

