# Driver Messages: read state, new-chat choice, and UX upgrades

## 1. What exists today for read/unread

Confirmed in the code:

- **Inbox list**: a red count badge on the avatar, bold name, and darker preview text for threads with unread messages; a total unread badge next to the "Messages" header. Group rows show an unread count too.
- **Inside a thread**: messages the driver sent show a double-check that turns colored once staff read it (`read_at`). There is **no** marker for messages the *driver* has not read — opening the thread silently marks everything read.

So the driver can see *which conversation* has unread messages, but once they tap in, there is no way to see where they left off, and no way to flag a message to come back to.

## 2. Recommended read/unread improvements

- **"New messages" divider** inside the thread, inserted above the first unread message on open, so the driver sees exactly where they stopped.
- **Delay the mark-as-read** until the message is actually scrolled into view (not just on thread open), so a glance at the inbox does not clear a long unread run.
- **Unread pill in the thread header** ("3 new") that scrolls to the divider when tapped.
- **"Mark as unread"** action on a conversation row (long-press / swipe on mobile, kebab on desktop) so a driver can save a message for later.
- **"Unread only" filter chip** above the list, matching the filter pattern used in the staff chat widget.
- Keep the existing sent double-check receipt, and add a small "Read <time>" hint on the driver's last sent message.

## 3. New chat: individual OR group

Today the gold "+" opens the group modal only, and — important — that modal lists **every** staff account rather than the driver's permitted contacts.

Planned change:

- The "+" opens a small **"New message"** chooser sheet with two options: **Direct message** and **Group chat**.
- **Direct message** shows the driver's allowed contact list; tapping a person opens (or creates) that 1:1 thread.
- **Group chat** keeps name + multi-select, but the selectable people come from the same allowed contact list.
- Both lists are sourced from the existing driver-contacts function that already applies the rules: only management staff assigned to that driver, excluding staff whose driver-messaging toggle is off or who are limited to specific other drivers. Other drivers are never selectable in driver mode.
- If a driver has no available contacts, the chooser shows an explanatory empty state instead of an empty picker.

## 4. Other UX enhancements worth adding

Prioritized, small to large:

1. **Sticky "Announcements / Direct / Contacts" unread badges** — Direct tab currently has no badge; add the total unread count.
2. **Attachment and photo previews** in the inbox row (`📷 Photo`, `📎 name`) instead of a generic label.
3. **Typing indicator and online/last-active dot** for staff, using the realtime channel already in place.
4. **Quick replies** ("Got it", "On my way", "Call me") above the composer for one-tap responses while on the road.
5. **Search inside a conversation**, not just across conversation names.
6. **Pull-to-refresh** and an offline banner with queued-send retry, matching the app's offline-first ELD behavior.
7. **Message search empty/error states and skeleton rows** instead of the bare spinner.

## Technical notes

- Files touched: `OperatorMessagesView.tsx` (inbox, "+" chooser, filters), a new `NewChatChooser` modal, `NewGroupModal.tsx` (driver-mode candidate source), `MessageThread.tsx` / `useMessageThread.ts` (unread divider, viewport-based read marking), `MessageBubble.tsx` (read hint).
- Driver-mode candidates switch from the raw `user_roles` + staff-profile query to the existing `list_driver_contacts` RPC, which already encodes the contact/toggle rules.
- "Mark as unread" needs a per-thread client marker or a small backend field; simplest first pass is a local per-thread `unread_from` timestamp persisted in local storage, upgraded to a backend column only if the owner wants it to follow the driver across devices.
