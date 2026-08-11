Verify and fix the document retake reason dropdown if it is not displaying all seven defined reasons.

## Goal
The "Request a document retake" modal in the applicant sidebar should show all seven reasons already defined in `src/lib/applicationDocumentRetake.ts`. The user currently sees only "Blurry / out of focus" and wants to keep the existing reasons while ensuring they all appear in the dropdown.

## Current state
`src/lib/applicationDocumentRetake.ts` already defines seven reasons:
- Blurry / out of focus
- Edges cut off
- Glare or shadow over the text
- Text is not readable
- Document is expired
- Wrong document uploaded
- Other

`src/components/management/RequestRetakeModal.tsx` maps over `RETAKE_REASONS` to render the `<SelectContent>` items, so the intended behavior is to show all seven.

## Plan
1. Inspect the running preview by opening the "Request a document retake" modal in the management dashboard and expanding the reason dropdown to confirm whether it shows one option or all seven.
2. If all seven appear: no code change is needed; confirm this to the user.
3. If only one appears: diagnose the root cause by checking:
   - Browser console logs for errors in the modal or Select component.
   - Whether the `RETAKE_REASONS` array is being imported correctly.
   - Whether a runtime build error (e.g., the reported dynamic module import failure) is preventing the component from fully hydrating.
4. Apply the minimal fix based on the diagnosis:
   - If the array is imported correctly but the Select component is not rendering items, fix the rendering logic.
   - If the component itself is not loading due to a broader app failure, resolve that loading issue first.
   - If a recent edit accidentally truncated the reasons, restore the full list.
5. Verify the fix by reopening the modal and confirming all seven reasons are selectable.

## Out of scope
- Adding new reasons.
- Removing existing reasons.
- Changing the default selected reason.
