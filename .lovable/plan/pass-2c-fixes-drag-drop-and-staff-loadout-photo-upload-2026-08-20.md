# Pass 2C Fixes — Drag & Drop and Staff Loadout Photo Upload

Scope: `DocumentsSection.tsx`, `UploadDocumentsDialog.tsx`, `LoadoutGallery.tsx`, and small additions to `src/lib/loadDocuments.ts`. No database or table changes, no driver-side flow work.

## Fix 1 — Drag and drop onto the Documents section

The whole Documents section becomes a drop zone, but only for users with upload permission (`canManage`). Operators get no drag handlers, no drop styling, and no hint text — the section behaves exactly as it does today for them.

- Drag-over shows a clear state: dashed gold-accent border and a muted overlay line ("Drop files to upload"), removed on drag-leave or drop.
- Only actual file drags trigger the state (checked via the drag data types), so dragging text or a link does nothing.
- On drop, files run through the existing `validateLoadDocumentFile` check. Rejected files raise the same message the picker shows. Accepted files open the upload dialog pre-populated, so a document type is still chosen before anything is written.
- If every dropped file is rejected, the dialog does not open.
- A one-line static hint ("or drop files here") sits next to the Upload button for staff so the affordance is discoverable without dragging.
- In the empty state, the existing "No documents have been attached to this load yet." line is extended for staff to mention both the Upload button and drag-and-drop, e.g. "No documents yet. Use the Upload button or drag and drop files here to add them." Operators continue to see the original neutral message.

The dialog already accepts `initialFiles`; it will be opened with the dropped set.

## Fix 2 — Staff-uploaded loadout inspection photos

### Type list
`loadout_pickup_inspection` and `loadout_delivery_inspection` are appended to the upload dialog's type dropdown only when `load.load_type === 'loadout'`. Standard and per-ton loads are unchanged.

### Photo mode
Selecting either inspection type switches the dialog into photo mode:

- Image files only. A PDF (or any non-image) is rejected with a clear message naming the file, both from the picker and from a drop.
- Switching to an inspection type while a PDF is already queued flags that row as not accepted and blocks upload until it is removed.
- The stop attachment and shared-note fields are replaced by a per-photo editor.

### Per-photo rows
Each queued file gets a row with:

- Thumbnail-free filename + size (as today).
- Photo label: a combobox offering Front, Driver Side, Passenger Side, Rear Doors Closed, Rear Doors Open, Trailer Number Plate, Delivery Location Signage, Other, with free text allowed for anything else.
- Damage noted checkbox; when checked, a damage notes textarea appears for that photo.
- Up/down reorder controls (and remove), since order sets `photo_sequence`.

`photo_sequence` is assigned 1..n from the final on-screen order at upload time. `upload_channel` stays `office_upload`.

### Gallery indicator
In `LoadoutGallery`, any photo whose `upload_channel` is not `driver_app` gets an understated marker: a small muted building/office icon in the tile corner with an accessible title, and a muted "Added by office" line in the lightbox metadata. No colored badge.

## Technical notes

- `src/lib/loadDocuments.ts`: extend `UploadLoadDocumentInput` with optional `photoLabel`, `photoSequence`, `damageNoted`, `damageNotes`, written into the existing `load_documents` columns; add an image-only validation variant and the standard label list as an exported constant. Column structure untouched.
- `UploadDocumentsDialog` keeps its current per-file progress and partial-failure behavior; photo metadata travels with each file's upload call.
- Existing shadcn components and charcoal/gold tokens only; no hardcoded colors.
- Tests: extend `loadDetailOperatorAccess.test.tsx` to assert the drop affordance renders for a dispatcher and not for an operator on their own load.
