Fix missing required indicators on the conditional Previous Address fields in the driver application form (Step 1).

Problem
- When a driver selects "Less than 3 years" for "How long at this address?", the Previous Address block appears.
- The Street Address, City, State, and ZIP Code fields in that block do not show the red asterisk required indicator.
- The current step validation also does not enforce those fields when they are visible.

Changes
1. src/components/application/Step1Personal.tsx
   - Add `required` prop to the four Previous Address FormField components (prev_address_street, prev_address_city, prev_address_state, prev_address_zip).
   - Pass the matching `error` prop for each so validation messages render.

2. src/components/application/utils.ts
   - In `validateStep(1, data)`, add conditional validation: if `data.address_duration === 'less_than_3'`, require `prev_address_street`, `prev_address_city`, `prev_address_state`, and `prev_address_zip`.

No UI/UX changes beyond the asterisks and validation messages. No database or backend changes.