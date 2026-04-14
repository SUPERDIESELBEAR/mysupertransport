

## Fix: Editor Closes When Dragging Crop Handles

### Root Cause
The `DocumentEditor` is rendered **inside** the `FilePreviewModal` backdrop div, which has `onClick={onClose}` (line 363 of DocRow.tsx). The editor's root `<div>` (line 276 of DocumentEditor.tsx) does **not** call `e.stopPropagation()`. When the user finishes dragging a crop handle, the `mouseup` completes and the browser synthesizes a `click` event that bubbles up to the backdrop's `onClick={onClose}`, closing the entire preview modal and destroying the editor.

### Fix — two lines
Add `onClick={e => e.stopPropagation()}` to the editor's root `<div>` in `DocumentEditor.tsx` (line 276). This prevents any click/mouseup within the editor from reaching the parent modal's backdrop close handler.

**File: `src/components/shared/DocumentEditor.tsx`**
- Line 276: change `<div className="fixed inset-0 z-[9999] flex flex-col bg-black/95">` to `<div className="fixed inset-0 z-[9999] flex flex-col bg-black/95" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>`.

This single change stops all mouse events from bubbling out of the editor, preventing the parent modal from closing during crop interactions.

### Why this is the complete fix
- The crop drag logic (mousedown → mousemove → mouseup on `window`) is correct
- The crop coordinate math is correct
- The only problem is event propagation closing the parent modal
- No other files need changes

