## Problem

The driver-facing signed Assignment Sheet preview (`src/components/operator/SignedAssignmentSheetsCard.tsx`) renders only a summary: assignment date, status, device/serial list, and the signature block. It omits the terms verbiage the driver actually agreed to — the $1,000.00 unreturned-ELD replacement charge, the note about additional charges for unreturned plates/other issued equipment, the BestPass $60.00 acknowledgement line, and the "I have received the devices listed above and agree to these terms" acknowledgement statement. Those paragraphs exist today only in the signing screen (`OperatorOSASSign.tsx`) and, partially, in the staff preview (`SignOffSheetPreviewModal.tsx`, which shows one condensed "Important:" line).

## Fix

1. **Create one canonical terms source** — a small presentational module (e.g. `src/components/equipment/AssignmentSheetTerms.tsx`) exporting the full terms block, taking `bestpassIncluded` as a prop and rendering:
   - Heading: "Important Notice — Equipment Return & Charges"
   - Unreturned ELD equipment → $1,000.00 replacement charge
   - Additional charges may be incurred for unreturned license plates or other issued equipment
   - BestPass transponder fee of $60.00 acknowledged (only when included)
   - The acknowledgement sentence: "I have received the devices listed above and agree to these terms."

2. **Driver signed preview** — render the full terms block inside the preview dialog in `SignedAssignmentSheetsCard.tsx`, between the device table and the signature block, styled as the document body (gold-accented notice consistent with the signing screen). For signed sheets, show the acknowledgement as an affirmed statement (checkmark + "Acknowledged by {name} on {date}") rather than an interactive checkbox. Also surface the unit number, driver name, and terms version so the preview reads as the complete document.

3. **Signing screen** — replace the inline terms `<ul>` in `OperatorOSASSign.tsx` with the shared component so the signed record and the signing view can never drift apart.

4. **Staff preview** — replace the single condensed "Important:" line in `SignOffSheetPreviewModal.tsx` with the same shared block, so staff and driver see identical verbiage.

No database or business-logic changes; this is presentation only. Existing terms wording is preserved verbatim.

## Verification

Open a signed sheet in the driver app preview via Playwright at a mobile viewport, screenshot the dialog, and confirm the full notice text and acknowledgement line appear above the signature, with the dialog still scrollable within `max-h-[90dvh]`.
