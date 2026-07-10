# Add Procedure Docs to Stage 9 (Staff View)

## Why the docs aren't showing
The earlier change only updated the **driver-facing** Stage 9 (`ContractorPaySetup.tsx`). The **staff-side** Stage 9 in `OperatorDetailPanel.tsx` (the screen in the screenshot) has its own hardcoded doc list that still only shows Payroll Deposit Overview and Payroll Calendar. Handbook, BOL/POD Procedures, and Loadout Trailer Guide were never added there.

## What to change
Edit `src/pages/staff/OperatorDetailPanel.tsx` (Stage 9 block, ~lines 6229–6380):

1. **Add a new "Operational Procedure Documents" section** directly below the Payroll Reference Documents block, listing:
   - SUPERTRANSPORT Handbook (PDF)
   - BOL / POD Procedures (PDF)
   - Loadout Trailer Guide (rich text)
   
   Docs are fetched live from `driver_documents` by the same three IDs used in `ContractorPaySetup.tsx` (`HUB_DOC_IDS`). PDF rows open in the existing `previewDoc` modal; the rich-text row opens in a small dialog using `sanitizeRichHtml` (same pattern as the operator component).

2. **Extend the Doc Acknowledgments summary** to also show acknowledgment status (and timestamp) for each of the 3 hub docs, pulled from `document_acknowledgments` for this operator's `user_id` — matching the driver-side gating so staff can see all 5 required acknowledgments in one place.

3. **Data fetch**: add one `useEffect` in the panel that loads the 3 hub docs + this operator's acknowledgments + signed URLs for PDF paths, storing them in local state (`hubDocs`, `hubAcks`, `hubPdfUrls`). Keyed off the selected operator's `user_id`.

No schema changes, no driver-side changes, no gating changes — this is purely surfacing the same data on the staff panel.

## Files touched
- `src/pages/staff/OperatorDetailPanel.tsx` — add fetch effect + render 3 procedure rows + extend ack summary
