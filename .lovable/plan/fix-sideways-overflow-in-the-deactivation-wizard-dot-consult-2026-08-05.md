# Fix sideways overflow in the Deactivation wizard (DOT Consultant step)

## What you're seeing
The whole wizard panel is wider than the space it sits in, so the right edge of the card, the "Add" button, the gold "Send Deactivation Notice" button and the "Next" button get clipped, and a horizontal scrollbar appears next to the Back button at the bottom. It is the container that overflows sideways — not any single label wrapping badly.

## Diagnosis status
The exact element forcing the extra width isn't confirmed yet. The likely candidates in `DeactivationWizardContent.tsx` / `DeactivationPage.tsx` are the two-column layout (fixed 288–320px step list plus step content) and the bottom action row, neither of which has width-containment classes on the page wrapper. Step 1 of the work is to measure it in the running app before changing anything.

## Plan
1. Reproduce at your window width, then measure which node is wider than its parent (compare `scrollWidth` vs `clientWidth` down the tree) so the fix targets the real cause.
2. Apply width containment on that path:
   - `src/pages/management/DeactivationPage.tsx`: add `min-w-0` (and `overflow-x-clip` on the outer wrapper) to the page column and the bordered card so the wizard can't push past the content area.
   - `src/components/management/DeactivationWizardContent.tsx`: add `min-w-0` to the wizard root row and to the step-content column, and let the bottom action row wrap (`flex-wrap gap-2`) so Back / Skip / Next stay inside the card at narrow widths.
3. Keep the To/CC chip and summary-row wrapping already in place; no new truncation of email addresses.
4. Verify in the preview at your width (~730px CSS and a laptop width): no horizontal scrollbar, Send button and Next fully visible.

Presentation-only change — no email, data, or wizard behavior is touched.
