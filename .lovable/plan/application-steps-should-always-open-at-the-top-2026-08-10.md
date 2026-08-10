# Application steps should always open at the top

## What's happening

The application form already tries to jump back to the top when an applicant taps Continue, but it does it at the wrong moment: the scroll is triggered in the same instant the step number changes, before the new step has actually rendered. The next step loads lazily (a spinner shows first) and slides in with an animation, so the page height changes right after the scroll starts. A smooth scroll that's already in flight gets cut short by that shift — and on touch screens it can be cancelled outright by the finger still on the glass. The result: the applicant lands partway down the new step and has to scroll up.

## The fix

Move the "go to top" behavior so it runs *after* the new step is on screen, and make it immediate instead of animated:

1. Remove the scattered `window.scrollTo` calls from the Continue / Back handlers on the public application form.
2. Add a single effect that watches the step number and, once the browser has painted the new step (two animation frames later), jumps the window to the top instantly. Instant beats smooth here: nothing to interrupt, and a new page is expected to start at the top.
3. Keep the top-of-page scroll for validation errors, since that one needs to reveal the error banner on the *same* step — but route it through the same helper so behavior stays consistent.
4. Apply the same treatment to the staff-assisted application drawer, where the scrolling element is the drawer panel rather than the window, so staff filling out an application on someone's behalf get the same behavior.
5. Move focus to the step heading at the same time so screen-reader and keyboard users are announced the new step instead of being left in the old form's field order.

## Technical notes

- File: `src/pages/ApplicationForm.tsx` — drop the inline `window.scrollTo({ top: 0, behavior: 'smooth' })` calls in `goNext`, `goBack`, and the post-duplicate-email-check branch; add a `useEffect` on `step` using a double `requestAnimationFrame` and `window.scrollTo({ top: 0, behavior: 'auto' })`. Guard against firing on the initial mount and on draft-resume restore so a resumed applicant isn't yanked around.
- File: `src/components/management/StaffApplicationModal.tsx` — same pattern, but scroll the `SheetContent` scroll container via a ref rather than `window`.
- Error-path scrolls stay, unchanged in intent, so the red "Can't continue past Step N" banner is still brought into view.
- No backend, validation, or data changes.
