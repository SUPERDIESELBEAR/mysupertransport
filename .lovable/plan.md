## Plan

Fix the remaining iPhone overlap on the Operator Driver App notification history page by making the mobile layout unconditional at phone widths and adding a fallback that does not depend on the current `sm:` breakpoint behavior.

## What I’ll change

1. **Notification history list**
   - Update `src/components/management/NotificationHistory.tsx` so phones render only the stacked mobile notification card layout.
   - Hide the desktop column header and desktop row grid below a larger breakpoint (`md`) instead of `sm`, so iPhone standalone sizing cannot fall into the desktop table layout.
   - Show the mobile stacked row below `md`, with Type/Sent/Status in a wrapping metadata row under the notification text.

2. **Mobile overflow hardening**
   - Add `min-w-0`, wrapping, and max-width safeguards to the Type badge/date/status row so long labels like “Notification” cannot bleed into the Sent or Status text.
   - Keep desktop/tablet layout intact at `md` and above.

3. **No data or auth changes**
   - Leave notification fetching, mark-read behavior, filters, counts, and routing untouched.

## Verification

After implementation, check the phone-width Operator route `/operator?tab=notifications` and confirm:
- The header columns are gone on iPhone width.
- Each notification is stacked vertically.
- Type, Sent, and Status no longer overlap or bleed into each other.
- Desktop/tablet still use the column grid.