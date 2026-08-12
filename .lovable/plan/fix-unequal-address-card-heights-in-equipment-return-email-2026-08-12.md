# Fix Unequal Address Card Heights in Equipment Return Email

## Goal
Ensure the two shipping-address cards in the equipment-return email render at the same height across mobile and desktop email clients.

## Diagnosis
The previous change added `height: 100%` to the table cells and inner cards, but many email clients ignore percentage heights on table cells, so the cards still shrink to their content. Option 1 contains an address that mobile clients auto-link, which adds extra vertical space and makes it taller than Option 2.

## Changes
1. Update `supabase/functions/_shared/transactional-email-templates/equipment-return-instructions.tsx`:
   - Replace percentage-based equalization with a fixed minimum height on both address cards.
   - Set the same explicit `height` style (and HTML `height` attribute for Outlook) on both table cells so the cards cannot shrink below that value.
   - Add `mso-line-height-rule: exactly` to the address card text to prevent Outlook from expanding line height.
   - Keep the existing `whiteSpace: 'nowrap'` on the Option 1 phone number.

2. Choose a fixed height that comfortably fits the tallest content (Option 1 with auto-linked address) at the template's font size and padding.

## Verification
- Render the email template via `preview-transactional-email`.
- Screenshot the rendered HTML at mobile width to confirm both cards are the same height.
- Deploy the updated `send-equipment-return-instructions` Edge Function.
