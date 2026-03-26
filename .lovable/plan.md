
## Fix: Double Close Button on Payroll Document Viewer

### Root Cause

`ContractorPaySetup.tsx` still has the old `DocPreviewModal` (lines 36–75) that wraps its content in `<DialogContent>`. The `DialogContent` component from `src/components/ui/dialog.tsx` always injects its own `X` close button. `DocPreviewModal` also has a manual `X` button in its own header row — so two X icons appear stacked in the corner.

The fix from the previously approved plan was never applied to this file.

### What Changes

**`src/components/operator/ContractorPaySetup.tsx` only:**

1. Add import: `import { FilePreviewModal } from '@/components/inspection/DocRow';`
2. Remove the entire `DocPreviewModal` function (lines 36–75)
3. Remove unused imports: `Dialog`, `DialogContent`, `X` (from lucide-react)
4. Replace the render at lines 704–710:
   ```tsx
   {previewDoc && (
     <DocPreviewModal title={previewDoc.title} url={previewDoc.url} onClose={() => setPreviewDoc(null)} />
   )}
   ```
   with:
   ```tsx
   {previewDoc && (
     <FilePreviewModal url={previewDoc.url} name={previewDoc.title} onClose={() => setPreviewDoc(null)} />
   )}
   ```

The `previewDoc` state, the signed URL fetch, and the "View" button click handlers are completely unchanged.

### Result
- Single close button (from `FilePreviewModal`'s own dark header)
- PDFs load reliably via blob object URL (bypasses X-Frame-Options)
- Consistent viewer experience across the entire portal

**One file changed. No database changes. No new components.**
