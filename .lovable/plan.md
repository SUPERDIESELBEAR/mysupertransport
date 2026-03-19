
## Add In-App Document Viewer (No New Tab)

### What's happening now
Every "View" / eye-button across the Inspection Binder opens the file in a new browser tab via `<a href target="_blank">`. There are **5 locations** that need changing:

1. `InspectionBinderAdmin.tsx` line 670 — Company/Driver Docs eye button  
2. `InspectionBinderAdmin.tsx` line 1057 — Driver Uploads eye button  
3. `InspectionBinderAdmin.tsx` line 1258 — Staging tab eye button  
4. `OperatorBinderPanel.tsx` line 152 — Staff-side operator panel eye button  
5. `OperatorBinderPanel.tsx` line 307 — Staff-side uploads eye button  
6. `OperatorInspectionBinder.tsx` line 49 — Driver-facing "View" link on their own uploads  

### What already exists
`DocRow.tsx` exports a `PDFModal` component (lines 121–150) that renders the file in a full-screen in-app overlay with an `<iframe>`, close button, and an optional "open externally" escape hatch. It works for both PDF and image files.

### Plan

**Step 1 — Create a shared `FilePreviewModal` utility**  
Generalise the existing `PDFModal` into a slightly more generic `FilePreviewModal` that accepts `{ url, name, onClose }` so it can be reused across all 6 locations without tying them to an `InspectionDocument` object. Keep it in `DocRow.tsx` alongside the existing component (or extract to a small shared file).

**Step 2 — Admin binder (`InspectionBinderAdmin.tsx`)**  
- Add a `previewUrl / previewName` state pair.  
- Replace the three `<a target="_blank">` eye-button links with `<Button>` calls that set that state.  
- Render `<FilePreviewModal>` at the bottom of the component when the state is set.

**Step 3 — Staff operator panel (`OperatorBinderPanel.tsx`)**  
- Same pattern: add `previewUrl / previewName` state, replace the two eye-button links, render the modal.

**Step 4 — Driver portal (`OperatorInspectionBinder.tsx`)**  
- Replace the plain `<a>View</a>` link on driver upload rows with a button that opens the same modal.  
- The existing `DocRow` component already opens its PDF inline via the modal; this just closes the last gap on the uploads list.

### Result
Every document/file in the binder opens inside the app in a full-screen overlay. The modal still includes a small "external link" icon for users who genuinely need to open the file in a new tab.

### Technical notes
- No database changes needed.
- The `PDFModal` iframe already uses `#toolbar=0` to suppress the browser PDF toolbar for a cleaner look.
- Image files (`.jpg`, `.png`) will also render correctly inside the iframe.
- The `ExternalLink` escape hatch remains so staff can still download or open externally if needed.
