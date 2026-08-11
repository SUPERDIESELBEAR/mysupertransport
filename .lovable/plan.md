# Fix the document retake reason dropdown

## Goal
Make the reason selector in “Request a document retake” open visibly and show all seven existing reasons.

## Confirmed cause
The retake modal uses a `z-[130]` overlay, while the shared dropdown renders through a portal at `z-50`. The menu opens behind the modal overlay, making the click appear to do nothing. The seven options are already present in `RETAKE_REASONS`; this is a layering issue, not missing data.

## Plan
1. Give this dropdown’s portaled menu a layer above the retake modal while preserving the shared Select defaults elsewhere.
2. Keep the existing seven reasons and current default selection unchanged.
3. Strengthen the component test to verify the dropdown opens and exposes all seven options.
4. Verify the actual modal in the running app, including selection of a reason other than “Blurry / out of focus.”

## Technical details
- Apply a local high z-index class to `SelectContent` in `RequestRetakeModal.tsx` rather than changing every Select in the app.
- Validate both DOM presence and visible interaction, because the existing test only proves the items are mounted and does not catch portal stacking failures.
