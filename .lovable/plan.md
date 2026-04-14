
## Fix the document editor white screen by replacing the unstable editor integration

### What I found
The current issue is very likely not the file download anymore. The bigger problem is the editor package itself:

- `DocumentEditor.tsx` mounts `react-filerobot-image-editor`
- The installed version is `react-filerobot-image-editor@5.0.0-beta.156`
- That package declares peer requirements for:
  - React 19
  - React DOM 19
  - React Konva 19
  - styled-components 6
- This app is using React 18, and there is no app-level `styled-components` setup in the codebase

So the editor is probably crashing as soon as it mounts, which matches your symptom exactly: click pencil → white screen overlay → app appears frozen.

### Plan

**1. Remove the unstable editor dependency from the document editing flow**
- Stop using `react-filerobot-image-editor` inside `src/components/shared/DocumentEditor.tsx`
- Replace it with a native editor built from libraries already compatible with this app:
  - `react-easy-crop` for crop/zoom
  - canvas-based transforms for rotate / export
  - simple width/height resize controls
  - optional quick actions like rotate left/right and reset

**2. Rebuild `DocumentEditor` as a stable modal**
- Keep the existing full-screen editor shell, loading state, save flow, and storage upload logic
- Add:
  - rotate 90° left/right
  - crop box
  - zoom
  - resize width/height inputs
  - reset to original
  - save edited image back to storage
- Keep PDF behavior simple:
  - either disable editing for PDFs for now and show a clear message
  - or continue rendering a page as image, then save edited page as PNG
- Preserve the existing close button so the app can always recover

**3. Add proper back-button handling to the editor layer**
- `FilePreviewModal` imports `useBackButton` but does not currently use it
- Add back-button support for:
  - preview modal open state
  - editor open state
- Ensure pressing browser/mobile back closes the editor first, then the preview, instead of trapping the user on a white overlay

**4. Harden the modal state so it cannot get stuck**
- Ensure `showEditor` always resets on:
  - editor close
  - editor load failure
  - save failure that should return to preview
- Add a visible fallback panel if the editor cannot initialize
- Avoid `Suspense fallback={null}` for this flow; use a visible loading/failure state instead

**5. Verify the fix in all document-viewer areas**
After implementation, test the edit flow in:
- Inspection Binder admin
- Operator inspection binder
- Driver Vault
- PE Screening receipt preview
- Operator document upload preview
- Any other `FilePreviewModal` image surface now exposing the pencil

### Files to update
- `src/components/shared/DocumentEditor.tsx`
- `src/components/inspection/DocRow.tsx`

Possibly small follow-up touches if needed:
- `src/components/inspection/InspectionBinderAdmin.tsx`
- `src/components/inspection/OperatorInspectionBinder.tsx`
- `src/components/drivers/DriverVaultCard.tsx`
- `src/components/operator/PEScreeningTimeline.tsx`
- `src/components/operator/OperatorDocumentUpload.tsx`

### Technical notes
- The current storage download/upload approach should stay; that part looks reasonable
- The main change is replacing the incompatible editor runtime
- I would follow the existing canvas/crop pattern already used in `src/components/EditProfileModal.tsx` to keep behavior consistent and reduce risk

### Expected result
Clicking the pencil on Bobby Thompson’s CDL should open a working editor instead of a white screen, and the user should always be able to back out safely without refreshing the app.
