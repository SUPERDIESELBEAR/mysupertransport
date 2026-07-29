Messaging Overhaul — Remaining Phases

## Already shipped (Phase 1)
- Database foundation: `message_threads`, `thread_participants`, `staff_messaging_settings`, `driver_staff_contacts`, `can_driver_message_staff`, `list_driver_contacts`.
- Staff availability mode (`all_drivers | specific_drivers | none`) in the Messages header.
- Driver Contacts tab, auto-populated with assigned dispatcher/onboarding lead + available staff.
- Oldest-unanswered-first sort for staff inboxes.
- Notification fan-out to all thread participants.

## Phase 2: Floating staff chat window
Build a draggable, minimizable chat window for staff so they can keep a conversation open while working in other parts of SUPERDRIVE.

- New component: `src/components/messaging/FloatingChatWindow.tsx`.
- Persist window position/size per user in `localStorage` so it survives navigation.
- Hook into the same `message_threads`/`messages` data layer used by the full Messages page.
- Show unread badge; collapse to a bubble when minimized.
- Restrict to a single floating window at a time (per the approved plan).

## Phase 3: Group chats
Allow mixed staff/driver conversations and staff-only groups.

- Create group UI in `MessagesView.tsx` for staff, and in `OperatorMessagesHub.tsx` for drivers.
- Rules:
  - Drivers can create groups with staff only (no driver-to-driver groups).
  - Staff can create mixed groups including drivers and other staff.
- Use existing `message_threads` + `thread_participants` tables; add UI for selecting participants and naming the group.
- Ensure notifications still fan out to every participant.

## Optional follow-up phases (not required to close the approved scope)
- Phase 4: Notification polish — desktop/browser push, read receipts, and a unified unread badge in the top bar.
- Phase 5: Search & thread management — search messages by participant or keyword; staff ability to mute/archive old threads.
- Phase 6: Mobile chat polish — bottom-sheet composer, better contact picker, and swipe gestures on driver app.

## Recommendation
Proceed with Phase 2 first, then Phase 3. Phase 2 is a pure UI addition on top of the tables already shipped, so it can land cleanly. Phase 3 depends on the same tables and can reuse the notification/availability logic already built.