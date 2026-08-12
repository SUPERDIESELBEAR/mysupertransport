# View return receipt from Assignment Sheets

Add a way for staff to open the driver-uploaded shipping receipt directly from the green "Return receipt received" block on each assignment sheet card.

## What changes

- Each receipt line in the green block gets a small "View" button next to the tracking/carrier/date text.
- Clicking it opens the receipt (photo or PDF) in the existing in-app file preview modal — same viewer used elsewhere in the app, with print and open-in-new-tab options — instead of a new browser tab.
- If more than one receipt exists on a sheet, each line gets its own View button.
- No layout change otherwise; the green block keeps its current wording and styling.

## Technical notes

- File: `src/components/equipment/SignOffSheetList.tsx`.
- Receipts are already fetched (`equipment_receipts`, `direction = 'return'`) with `file_url` and `file_name`, so no new query or database change is needed.
- Add local state `preview: { url, name } | null` and render `FilePreviewModal` from `@/components/inspection/DocRow` with `bucketName="operator-documents"`, mirroring how `EquipmentReturnCard.tsx` does it on the driver side.
