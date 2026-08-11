# Fix sideways scrolling in the Assignment Sheet "View" popup

## What's wrong

The popup opens with a horizontal scrollbar and cuts off content on the right, so staff have to drag side to side to read the sheet and reach the buttons.

Confirmed cause: the row of action buttons at the bottom (Delete, Copy sign link, Send to Operator, Send Return Instructions, Close) is set to stay on a single line and never wrap. Five buttons are wider than the popup, so they push the whole popup wider than the window and force horizontal scrolling of everything inside it.

## The fix

In the assignment sheet preview popup:

- Let the bottom action buttons wrap onto a second line when they don't fit, instead of forcing the popup wider.
- Keep Delete on the left and the rest grouped to the right, with even spacing in both the one-line and wrapped layouts.
- Prevent any horizontal overflow inside the popup so nothing can push it sideways again (long emails, long serial numbers, etc. wrap instead).
- Keep the popup within the window width on narrow screens and phones.
- Vertical scrolling stays exactly as it is today.

## Technical notes

- `src/components/equipment/SignOffSheetPreviewModal.tsx`: replace the `DialogFooter` single-row layout with a wrapping flex row (`flex-wrap`, `justify-end`, `gap-2`, Delete keeps `mr-auto`), add `overflow-x-hidden` and a `w-[calc(100vw-2rem)]` clamp on the `DialogContent`, and add `min-w-0` / `break-words` to the info grid fields and device table cells.
- No behavior, data, or backend changes.