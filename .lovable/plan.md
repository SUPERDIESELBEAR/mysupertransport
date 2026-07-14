# Task Verification: Birthday & Anniversary Popups

**Status: Complete — no code changes needed.**

## Requirements vs. Implementation

| Requirement | Implementation |
|---|---|
| Small popup (not permanent red dot) | `BirthdayAnniversaryPopup.tsx` renders a fixed bottom-right card stack (320px wide), mounted in `StaffLayout.tsx` for every staff view |
| Dismissible with an X | X button in top-right of each card calls `acknowledge(ev)` |
| Send birthday/anniversary message via email + driver app | "Send Message" button opens `SendBirthdayAnniversaryModal`, which invokes the `send-staff-birthday-message` edge function (email) and writes an in-app notification for `userId` |
| Stays until acknowledged | Ack is persisted per staff user in `staff_event_acknowledgments` (keyed by `operator_id + event_type + event_date`); dismissed events do not reappear on reload |
| Early warning for weekends/holidays | `earlyWarnDateFor()` in `lib/birthdayAnniversary/holidays.ts` walks back to the prior business day; hook shows the event from that early date through the actual date, flagged `isEarly` with "Upcoming …" label + calendar date |

## Additional Behavior Confirmed

- Central Time day rollover (`todayInCentral`) — no off-by-one.
- Only surfaces for active operators past Go Live (anniversaries require `go_live_date.year < currentYear`).
- Multiple concurrent events collapse to 3 with a "+N more / Show fewer" expander.
- Sending a message auto-acknowledges the event.

Nothing to fix — feature matches the requested spec end-to-end.
