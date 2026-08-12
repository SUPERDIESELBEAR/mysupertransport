# Fix Equipment Return Email Address Card Layout

## Goal
Make the two shipping-address cards in the equipment-return instructions email equal height, and keep the Option 1 phone number on a single line.

## Changes
1. Update `supabase/functions/_shared/transactional-email-templates/equipment-return-instructions.tsx`:
   - Set the two-column table cells (`twoColRow`) to `height: 100%`.
   - Set each `addressCard` to `height: 100%` so both boxes stretch to match the tallest card.
   - Apply `whiteSpace: 'nowrap'` to the Option 1 phone-number line so "P: (479) 498-2041" does not wrap.

## Verification
- Render the email template with its `previewData` to confirm both address cards visually align and the phone number stays on one row across common mobile email clients.
- Deploy the updated Edge Function so the change is live for future sends.
