
## Add PDF Viewer to Document Hub Admin List

### What's missing

In the Management Portal's Document Hub (`AdminDocumentList.tsx`), each document row has Edit and Delete buttons but no way to preview a PDF. Staff must open the editor just to see the file. The fix adds a preview button to each PDF row.

### Change — one file only: `AdminDocumentList.tsx`

**Inside `SortableRow`:**

1. Add local state: `const [previewOpen, setPreviewOpen] = useState(false)`
2. Import `FilePreviewModal` from `@/components/inspection/DocRow`
3. In the Actions section (alongside the existing Edit/Delete buttons), add an eye-icon `Button` that is only rendered when `doc.content_type === 'pdf' && doc.pdf_url`:
   ```tsx
   {doc.content_type === 'pdf' && doc.pdf_url && (
     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewOpen(true)} title="Preview PDF">
       <Eye className="h-3.5 w-3.5" />
     </Button>
   )}
   ```
   (`Eye` is already imported in the file.)
4. Render `FilePreviewModal` below when open:
   ```tsx
   {previewOpen && (
     <FilePreviewModal url={doc.pdf_url!} name={doc.title} onClose={() => setPreviewOpen(false)} />
   )}
   ```

**No database changes. No new components. No edge functions. One file changed.**
