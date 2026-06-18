## Lock "Acknowledge" Until Driver Reads the Document

Make the green Acknowledge button in the driver-facing Document Hub stay locked until the driver has actually viewed the content. Videos and already-acknowledged docs behave the same as today.

### Behavior per document type

| Type | Unlock rule |
| --- | --- |
| **PDF** | Unlocks once the driver clicks **View PDF** at least once (opens the preview modal). |
| **Rich-text policy doc** | Unlocks once the driver scrolls to the bottom of the in-app text. |
| **Video** | Unchanged — already requires opening; Acknowledge stays enabled as today. |
| **Already acknowledged (current version)** | Unchanged — green "You have acknowledged this document" confirmation. |

### UI changes (`src/components/documents/DocumentViewer.tsx`)

1. Add two pieces of local state:
   - `hasOpenedPdf` — flips to `true` the first time the driver clicks **View PDF**.
   - `hasReadToBottom` — flips to `true` when the rich-text container is scrolled to the bottom (within a small threshold, e.g. 16px).

2. **PDF docs:** Set `hasOpenedPdf = true` in the existing **View PDF** button handler (alongside `setPdfPreviewOpen(true)`).

3. **Rich-text docs:** Wrap the existing prose `<div dangerouslySetInnerHTML=…>` in a scrollable container with a capped height (e.g. `max-h-[60vh] overflow-y-auto`) and attach an `onScroll` handler that sets `hasReadToBottom` when `scrollTop + clientHeight >= scrollHeight - 16`. Also set `hasReadToBottom = true` immediately on mount if the content already fits without needing to scroll (so short docs aren't permanently locked).

4. **Acknowledge footer:** Compute `canAcknowledge`:
   - PDF → `hasOpenedPdf`
   - Rich-text → `hasReadToBottom`
   - Video / other → `true` (current behavior)

   Apply `disabled={acknowledging || !canAcknowledge}` to the existing Acknowledge `<Button>`. Keep the button label as today.

5. **Helper text above the Acknowledge button** (replaces the current single sentence, only shown when not yet acknowledged):
   - PDF + not yet opened: *"Please open the PDF above before acknowledging."*
   - Rich-text + not yet scrolled to bottom: *"Please scroll to the bottom of the document above before acknowledging."*
   - Otherwise: the current confirmation sentence ("By clicking below, you confirm that you have read and understood this document.").

   A small lock icon (`Lock` from `lucide-react`) next to the helper text when locked makes the gate obvious.

### Out of scope

- Videos — no completion gating in this pass (can be a follow-up).
- Staff-side Compliance Dashboard, Document Editor, notifications, and DB schema — unchanged.
- No changes to the `document_acknowledgments` table, RLS, or API calls.
- No changes to `FilePreviewModal` itself.

### Files touched

- `src/components/documents/DocumentViewer.tsx` (only)