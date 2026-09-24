# Make birthday reminders stay gone after sending

## Confirmed cause

The saved records are present for both staff birthdays, including Marcus’s Yasir record. The popup reload asks for `operator_id`, event type and date, but **does not ask for `subject_user_id`**. Staff birthday matching depends on that omitted ID, so every reload rebuilds the same card even after Send saved the acknowledgment.

There is a second behavior that conflicts with the requested rule: the card’s X currently saves the same acknowledgment as a successful Send. That lets someone permanently clear the reminder without sending anything.

## Intended behavior

- A birthday card remains visible through the birthday unless that logged-in staff member successfully sends the message.
- After a successful send, it disappears immediately and remains gone after refresh, sign-out and sign-in.
- Closing or minimizing does not count as sending and cannot permanently clear it.
- The card naturally expires after the birthday in Central Time.
- Each staff member has their own send state; one person sending does not clear another person’s reminder.

This matches your proposed behavior and is the clearest rule: the popup is a personal “message still owed” reminder, not a general announcement.
