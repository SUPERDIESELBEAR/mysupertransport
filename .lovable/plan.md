## Problem

In the Launch SUPERDRIVE dialog, only the first ~5 operators are visible and the inner list cannot be scrolled. All other content (header, template picker, force-resend toggle, filters, selection toolbar, footer) takes up most of the dialog, leaving the operator list with no usable scroll area.

## Root Cause

The shared `DialogContent` (in `src/components/ui/dialog.tsx`) applies `overflow-y-auto` and `max-h-[90dvh]` on the dialog container itself. `LaunchSuperdriveDialog` then layers `flex flex-col p-0 gap-0` on top and puts a Radix `ScrollArea` with `flex-1 min-h-0` inside.

Because `overflow-y-auto` from the base class is not overridden, the dialog itself becomes the scroll container. That means the inner `ScrollArea` has no bounded height — its `flex-1` parent is allowed to grow past the viewport — so the list never gets its own scrollbar. Whatever rows fit before the dialog hits `90dvh` are visible; the rest is clipped/awkward.

## Fix

In `src/components/management/LaunchSuperdriveDialog.tsx`, change the `DialogContent` className to explicitly override the inherited overflow:

- Add `overflow-hidden` so the dialog itself does not scroll.
- Keep `flex flex-col`, `max-h-[90dvh]`, `p-0`, `gap-0`.

This forces the inner `ScrollArea flex-1 min-h-0` to bound the operator list and produce a working internal scrollbar, so all eligible operators (not just the first five) can be reached.

No other components are affected; this is a single-line className change.

## Verification

- Open Launch SUPERDRIVE on `/dashboard`.
- Confirm the operator list scrolls independently while the header, template picker, force-resend toggle, filters, toolbar, and footer stay pinned.
- Confirm behavior is unchanged at smaller viewports (mobile sheet still respects `max-h-[90dvh]`).
