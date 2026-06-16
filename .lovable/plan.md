## Goal

In the driver app's Notifications page, tapping a notification should:
1. **Expand inline** to show the full message body (no more 2-line truncation).
2. **Deep-link** to the exact place where the driver can take action (e.g., the QPassport notification opens the Background Check section with the download button).

## Changes

### 1. Inline expand/collapse on tap — `src/components/management/NotificationHistory.tsx`
- Track an `expandedId` in state. Tapping a row toggles expand instead of immediately navigating.
- Remove `line-clamp-2` on the body when expanded; show full `n.body` text with `whitespace-pre-wrap`.
- When expanded, render a footer row with:
  - A primary "Go to [contextual label]" button (only if the notification has a deep link) that calls `navigate(n.link)`.
  - A subtle "Mark as read"/"Mark unread" toggle.
- Tapping the row only expands/collapses; navigation is an explicit button press. This fixes the current behavior where users can't read the full message because the tap immediately tries to navigate.
- First tap on an unread row still calls `markRead` (in addition to expanding).
- Keep the `ArrowRight` chevron, but rotate it 90° when expanded to signal expand state.
- Apply to both desktop and mobile layouts.

### 2. Deep-link the QPassport notification to the exact section — `supabase/functions/send-notification/index.ts`
- The `ni_uploaded` notification currently sets `link: '/operator'`, which drops the driver on the home tab. Change it to `link: '/operator?tab=progress#ni'` so it lands on the Background Check / PE Screening timeline that already renders the QPassport download button.
- Update the matching email CTA URL to the same path for consistency.

### 3. Anchor scrolling in the progress page — `src/components/operator/PEScreeningTimeline.tsx` (or its parent `OperatorStatusPage.tsx`)
- After mount, if `location.hash === '#ni'`, scroll the QPassport step into view and briefly highlight it (ring/gold pulse for ~2s) so the driver immediately sees the download button.

### 4. Sanity sweep of other notification links
- Quickly audit existing `link:` values in `send-notification/index.ts` to confirm each lands somewhere the driver/staff can act on (e.g., `new_message` → `/operator?tab=messages` already correct). No behavior change unless a link is clearly wrong; if it is, fix it in the same edit. This is a small follow-up, not a full refactor.

## Out of scope
- No changes to notification creation triggers, schema, or RLS.
- No redesign of the notification list visual style beyond the expand affordance.
- Staff notification routes are unchanged.

## Verification
- On iPhone PWA: open Notifications → tap "Your QPassport is Ready" → full body text shows inline; "Go to Background Check" button appears; tapping it lands on the progress page with the QPassport step highlighted and the Download button visible.
- Tap a notification with no `link` (e.g., a generic info one) → expands to show full body, no navigate button shown.
- Tap again to collapse.
