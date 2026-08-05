# Keep messages inside SUPERDRIVE (no instant email), add a 48-hour unread reminder

## What happens today
When a message is sent, an edge function (`notify-new-message`) creates the in-app notification and, if the recipient looks "offline", also emails them the screenshot you attached. That email goes only to the recipient — no one else is copied, and there is no CC/BCC anywhere in the message path. So the privacy concern is already satisfied; the issue is that an email is sent at all.

## Change 1 — Stop instant message emails
- Remove the email branch from the message notification path entirely. Sending a message will only:
  - create the in-app notification (bell / badge), and
  - update the unread state in the app.
- The presence check and 10-minute throttle logic that only existed to gate the instant email are removed with it.
- Verify no other path emails on message send (bulk staff messages, group threads) and strip any that do.

## Change 2 — 48-hour unread reminder (recommended)
Recommendation: keep a reminder, but only one, at 48 hours. Going to zero email means a driver who does not open the app can miss a message indefinitely, which is a real operational risk for dispatch and compliance. One quiet nudge after two full days is not noise.

How it works:
- A once-daily scheduled job finds messages that are still unread 48+ hours after they were sent.
- It groups them per recipient into a single digest email — never one email per message.
- The email includes the sender name and the message preview text, plus an "Open Messages" button that deep-links into the app (driver app or management dashboard depending on role).
- A message is reminded about exactly once. Once reminded, or once read, it is never reminded again.
- Applies to both drivers and management staff.
- Respects the existing per-user "new message" email preference and the unsubscribe/suppression list, so anyone can turn it off.

## Technical notes
- `supabase/functions/notify-new-message/index.ts`: delete the Resend send, presence check, and throttle read/write; keep in-app notification insert.
- `message_notification_throttle` becomes unused — leave the table in place, stop writing to it.
- New edge function `send-unread-message-reminders`: selects unread, non-deleted, non-system messages older than 48h with no reminder recorded; groups by recipient; sends one branded email via the existing shared email helpers; records `reminder_sent_at` so it never repeats.
- New nullable column on `messages` (or a small companion table) to record that a reminder was sent.
- New daily cron job (via pg_cron) to invoke the reminder function.
- Demo-account rerouting and suppression handling come free from the shared send helpers.
