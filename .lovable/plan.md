
Fix the ICA builder so the owner can actually continue through the carrier-signing flow.

What’s likely happening
- The first ICA step is currently blocked by this rule in `src/components/ica/ICABuilderModal.tsx`:
  `const canProceedStep0 = !!(data.truck_vin && data.owner_business_name);`
- That makes Business Name effectively required, even though the UI does not mark it required and many operators will not have one.
- There is also a second gate on the Carrier Signature step:
  `const canProceedStep2 = !!(carrierTypedName && carrierTitle);`
- For an owner account, those fields are not prefilled, so the flow can feel like it is not letting you continue “as the owner.”

Plan
1. Align the step validation with the actual form
- Update step 0 so it no longer requires `owner_business_name`.
- Require what the UI already implies instead: VIN plus contractor identity (`owner_name`, or `owner_business_name` if present).
- This removes the hidden blocker for sole proprietors and test operators.

2. Prefill carrier signer details for the logged-in owner/staff user
- In `ICABuilderModal.tsx`, use the authenticated user profile from `useAuth()`.
- If the draft does not already contain carrier signer info, prefill:
  - typed name = logged-in user’s full name
  - title = `Owner` for owner users, otherwise leave editable with a sensible fallback if needed
- Keep both fields editable so staff can override them.

3. Make the UI clearer
- Add required markers/help text so the button state matches what the screen communicates.
- If Continue is disabled, the user should be able to tell why immediately.

4. Preserve existing draft behavior
- If an ICA draft already has saved carrier name/title, do not overwrite it.
- Only apply the autofill when those fields are blank.

Files to update
- `src/components/ica/ICABuilderModal.tsx`
- Possibly `src/hooks/useAuth.tsx` usage only (read existing role/profile data, no auth-system redesign)

Technical details
- Replace:
  `const canProceedStep0 = !!(data.truck_vin && data.owner_business_name);`
- With validation closer to:
  `const canProceedStep0 = !!(data.truck_vin && (data.owner_name || data.owner_business_name));`
- Keep:
  `const canProceedStep2 = !!(carrierTypedName && carrierTitle);`
  but prefill those values from the logged-in owner profile so the owner can proceed without unnecessary manual re-entry.
- No database change should be required for this fix.

Expected result
- You will be able to open Prepare ICA, move past the first step without entering a business name when it is not applicable, and continue through the carrier-signature step as the owner with your name/title already filled in.
