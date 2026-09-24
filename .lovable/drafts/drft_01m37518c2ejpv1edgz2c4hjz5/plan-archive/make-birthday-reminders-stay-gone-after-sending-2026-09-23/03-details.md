## Build details

1. Include `subject_user_id` when loading saved birthday acknowledgments, so staff birthday rows can match their saved records exactly as driver birthday rows already do.
2. Make acknowledgment persistence explicit: only remove the card permanently after the send succeeds and the saved send-state succeeds. If saving fails, show an error and keep/restore the card rather than silently letting it return later.
3. Remove the card X as a permanent acknowledgment path. Keep minimize as the temporary way to get the popup out of the way without claiming a message was sent.
4. Add focused tests covering staff and driver birthdays separately:
   - staff acknowledgment matches by staff user ID;
   - driver acknowledgment still matches by driver ID;
   - successful send remains hidden after a fresh load;
   - close/minimize does not save completion;
   - reminders disappear after the birthday in US Central Time;
   - another staff member’s send does not hide the current user’s card.
5. Verify Yasir’s existing saved row now suppresses Marcus’s card without changing or deleting any real birthday or message data. Confirm the same matching behavior for Emma’s saved rows.

## Personal messages, not identical copies

Today every sender gets the same prefilled text signed "The SUPERTRANSPORT Team", so the recipient receives several identical messages with no way to tell who sent which.

6. The message opens signed with the sender's own name, for example "— Marcus Mueller, SUPERTRANSPORT", instead of the generic team sign-off.
7. A short line above the message box prompts: "Add a personal note — everyone else on the team may be sending one too." The text stays fully editable.
8. The email and in-app note both show who sent it ("From Marcus Mueller"), taken from the signed-in account on the server, so it cannot be faked or left blank.
9. Nothing else about sending changes: each staff member still sends their own message, and drivers' birthday and anniversary messages get the same sender name.

## Scope

No birthday dates, sent messages or existing acknowledgment rows need to be changed. No new table is required. The sending function is updated to add the sender's name and redeployed.
