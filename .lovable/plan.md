# Message settings access + bulk message clarity

## 1. Message settings stay staff-only

Current state (verified): the settings gear and the availability/alerts panel live only in the staff `MessagesView`, which renders in the Management, Staff, and Dispatch portals. The driver-facing messaging view has no settings surface, so drivers cannot mute or opt out today.

To make that guarantee explicit rather than incidental:
- Gate the settings gear behind a staff role check (management / owner / onboarding staff / dispatcher) instead of relying on which portal renders the component.
- Reword the availability control so it is unambiguous: it only controls whether a driver can **start** a new thread with you. Messages management sends to a driver always arrive, and existing threads always stay open.
- Add a short line under the control: "Drivers always receive messages you send. This only limits who can start a new conversation with you."

## 2. Bulk message: make 1:1 fan-out obvious

Yes — the sender should be told clearly, in three places:

- **Modal header**: subtitle "Sends a separate 1-on-1 message to each person. Recipients cannot see each other, and replies come back to you privately."
- **Recipient step**: a small notice bar with the same idea plus a "Need everyone in one conversation? Use New group chat instead" pointer.
- **Send confirmation**: before sending, confirm "Send 14 separate messages?" with the recipient count, so the fan-out is stated at the moment of commitment. Success toast becomes "Sent 14 individual messages."

## 3. Bulk message button placement

Current placement in the Messages page header (top-right, opposite the title) is reasonable but disconnected from where composing actually starts — the "+" button on the conversation rail.

Recommendation: put it in both places, with the "+" menu as the primary path.
- Add a third item to the "+" dropdown: "Bulk message — 1-on-1 to many", directly under "New message" and "New group chat". That puts all three send modes side by side, which is where the group-vs-bulk distinction matters most.
- Keep the header button as a secondary shortcut, retitled "Bulk Message" with a tooltip describing the 1:1 fan-out.

The existing Driver Hub bulk entry point (with preselected drivers) stays unchanged.

## Technical notes

- `src/components/staff/StaffAvailabilityCard.tsx` — role gate helper text, clarified availability copy.
- `src/components/staff/MessagesView.tsx` — role-gate the settings `Sheet` trigger; add the bulk item to the "+" dropdown (accepts an `onBulkMessage` callback prop).
- `src/pages/management/ManagementPortal.tsx`, `src/pages/staff/StaffPortal.tsx`, `src/pages/dispatch/DispatchPortal.tsx` — pass the existing bulk-modal opener into `MessagesView`.
- `src/components/staff/BulkMessageModal.tsx` — header subtitle, notice bar on the select step, count-based send confirmation and toast.

No database or policy changes.
