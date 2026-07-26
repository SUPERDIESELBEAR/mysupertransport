## Goal
Make the "Open Assignment Sheet & Upload Receipt" button land on the right screen, make the upload block easy to find, and simplify the UPS address block in the email.

## 1. Remove hours of operation from Option 1 (email)
In the equipment-return email template, the UPS Store card keeps only:
- THE UPS STORE #4564
- 608 W. Parkway Dr., Russellville, AR 72801
- Phone line kept? Proposal: keep the phone, drop the Mon–Fri / Sat / Sun hours lines.

Also drop the same hours text from the driver-app address card so the app and email match.

## 2. Fix the broken deep link
The email currently builds `/dashboard?view=onboard-systems&sheet=…&return=1`. The driver app does not use `/dashboard`, and it reads the view from the URL path (`/operator/onboard-systems`) — a `view=` query param is ignored, so the driver lands on their default screen.

Fix: build the link as `/operator/onboard-systems?sheet=<id>&return=1` in the send-equipment-return-instructions function, then redeploy it. Existing emails already sent keep the old link; a resend produces the corrected one.

## 3. Make the upload block findable
Today the receipt upload card only renders on the "Onboard Systems" screen, and that sidebar item only appears when the driver has assignment sheets. Drivers who go to "My Documents" (where the signed sheet lives) see no upload spot.

Changes:
- Render the equipment-return upload card at the top of **My Documents** as well, directly above the signed assignment sheets list, whenever a return has been requested and no receipt is on file.
- Keep the existing card on Onboard Systems, with the deep-link auto-scroll behavior.
- Add a visible pointer inside the signed assignment sheet entry ("Return requested — upload your shipping receipt") that jumps to the upload card.

## Technical notes
- Files: `supabase/functions/send-equipment-return-instructions/index.ts` (URL), `supabase/functions/_shared/transactional-email-templates/equipment-return-instructions.tsx` (hours), `src/components/operator/EquipmentReturnCard.tsx` (hours text), `src/pages/operator/OperatorPortal.tsx` (render card in `my-docs`), `src/components/operator/SignedAssignmentSheetsCard.tsx` (pointer).
- Redeploy the edge function and the email template after edits.
- Verify with a test resend that the link opens Onboard Systems scrolled to the upload block.
