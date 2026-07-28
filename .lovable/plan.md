## Root cause: duplicate `new_message` in-app notifications

The staff Messages view uses `MessageThread` → `useMessageThread`, which already invokes the `notify-new-message` edge function on every send. `notify-new-message` inserts the in-app notification (title `New message from {sender}`) and handles the offline-throttled email.

However, `src/components/staff/MessagesView.tsx` (`handleMessageSent`) *also* invokes `send-notification` with `type: 'new_message'`, and that function inserts a second in-app notification (title `💬 New message from {sender}`) plus a second email. Verified against the database: recipient `1af…` has two rows per message — one titled `New message from …` and one titled `💬 New message from …`, seconds apart.

## Fix

**1. Remove the redundant call from staff Messages view**  
`src/components/staff/MessagesView.tsx`: delete the `handleMessageSent` callback and the `onMessageSent={handleMessageSent}` prop on `<MessageThread />`. `notify-new-message` (already fired inside `useMessageThread.sendMessage`) is the single source of truth for both in-app + email of DM notifications.

**2. Leave the other `new_message` producers alone (verified single-source)**
- `useMessageThread.ts` → `notify-new-message` (only path for 1:1 chat in staff/operator/dispatch UIs).
- `BulkMessageModal.tsx` → inserts messages directly and calls `send-notification` once; no `useMessageThread`, so no duplicate.
- `OperatorPortal.tsx` and `DispatchPortal.tsx` realtime handlers only fire desktop/OS push (`fireNotification`) — they do not insert `notifications` rows.

## Broader audit — other duplicate/near-duplicate notifications

Checked the DB and code paths:

- **Fully-onboarded milestone** — historic rows show two in-app notifs (`🎉 You are fully onboarded!` from the DB trigger, plus `Welcome to SUPERTRANSPORT — You're Fully Onboarded!` from `send-notification`). This was already fixed by `skipSendNotification: true` in `OperatorDetailPanel.tsx` (rows from 2026-07-27 onward only show the single trigger notif). No further change needed; the older duplicates in the screenshot are pre-fix data.
- **ICA complete** — `send-notification` has an explicit skip comment to prevent a duplicate operator email against `notify-onboarding-update`. Already handled.
- **`go_live_set` vs `fully_onboarded` emails** — consolidated in `notify-onboarding-update` (10-minute suppression window). Already handled.
- All other `send-notification` types (`truck_down`, `document_uploaded`, `dispatch_status_change`, `pay_setup_submitted`, `application_approved`, etc.) are each fired from a single call site with no parallel trigger/edge insert. Confirmed via `rg` on their producers.

## Verification after the change

1. From staff Messages, send a message to a demo driver.
2. Query `notifications` for the recipient — expect exactly one row per message (title `New message from …`, no `💬` variant).
3. Confirm the driver still sees the notification in the bell dropdown and still gets the throttled offline email from `notify-new-message`.

## Technical details

- Files changed: `src/components/staff/MessagesView.tsx` only (delete `handleMessageSent` and the `onMessageSent` prop). No migrations, no edge function changes.
- No behavioral change for email delivery: `notify-new-message` already sends the offline-throttled email; the removed path was sending a second, non-throttled email in addition.
