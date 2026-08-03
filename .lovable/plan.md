# Message settings access + bulk message clarity

## 1. Reword "Driver Availability"

No access changes. The settings panel already appears only in the staff Messages view, and the driver-facing messaging view has no settings surface — drivers cannot mute or opt out today.

The problem is the label: "Driver Availability" reads like it changes a driver's settings, when it actually controls the staff member's own availability to receive driver-initiated messages.

- Rename the section to "My Availability to Drivers".
- Reword the control to "Which drivers can start a conversation with me?", with the options phrased from the staff member's point of view.
- Add a clarifying line: "This only limits who can start a new conversation with you. Messages you send always reach the driver, and existing threads stay open."

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

- `src/components/staff/StaffAvailabilityCard.tsx` — section rename and clarified availability copy.
- `src/components/staff/MessagesView.tsx` — add the bulk item to the "+" dropdown (accepts an `onBulkMessage` callback prop).
- `src/pages/management/ManagementPortal.tsx`, `src/pages/staff/StaffPortal.tsx`, `src/pages/dispatch/DispatchPortal.tsx` — pass the existing bulk-modal opener into `MessagesView`.
- `src/components/staff/BulkMessageModal.tsx` — header subtitle, notice bar on the select step, count-based send confirmation and toast.

No database or policy changes.
