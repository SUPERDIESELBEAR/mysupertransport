

## Add Rich Text Preview to Document Hub Admin List

### What changes
Add a preview button for rich text documents in the admin document list, matching the existing PDF and Video preview pattern.

### Current behavior
- **PDF docs**: Eye icon button → opens `FilePreviewModal`
- **Video docs**: Video icon button → opens embed dialog
- **Rich text docs**: No preview button — staff must click Edit to see content

### New behavior
- **Rich text docs**: Eye icon button → opens a dialog modal that renders the HTML body in the same prose styling used by the operator-facing `DocumentViewer`

### Technical detail

In `src/components/documents/AdminDocumentList.tsx`:

1. Add a `richTextPreviewOpen` state (like `previewOpen` and `videoOpen`)
2. After the video preview button (line ~194), add a condition for rich text:
   ```
   if content_type is not 'pdf' and not 'video' and doc.body exists → show Eye button
   ```
3. After the video preview dialog (line ~230), add a `Dialog` that renders `doc.body` via `dangerouslySetInnerHTML` with the same prose classes used in `DocumentViewer.tsx`

No new components or dependencies needed — reuses existing `Dialog` and prose styling.

### Files changed
| File | Change |
|------|--------|
| `src/components/documents/AdminDocumentList.tsx` | Add rich text preview button + dialog in `SortableRow` |

