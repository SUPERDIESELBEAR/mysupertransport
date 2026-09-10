# PEI menu rename + follow-up controls

## 1. Shorter menu name

The Management sidebar item currently reads "Previous Employer Checks" and gets cut off as "Previous Employer Ch...". It becomes **PEI**. The Staff sidebar already reads "PEI Queue" and stays as is. The page heading itself keeps the full "Previous Employment Investigations" title so the meaning is still spelled out once.

## 2. Follow-up timing you can set

Today the reminders to previous employers go out on a fixed rhythm: every 5 days, and on day 30 the file is closed automatically with a Good Faith Effort record. Both numbers become settings on the PEI screen:

- **Follow up every N days** (1–15)
- **File Good Faith Effort after N days** (7–60, must be greater than the interval)

Changing them takes effect on the next run — nothing already sent is re-sent, and a request that has already had, say, three reminders is not caught up retroactively.

## 3. Two on/off switches

- **Company-wide switch** in a small "Follow-up settings" panel at the top of the PEI screen. Off means no automatic reminders and no automatic Good Faith Effort for anyone; staff can still send manually.
- **Per-employer pause** on each employer card (the ones showing "Sent"). Pausing stops the automation for that one employer only; resuming clears it. This reuses the existing pause marker, so the cards that currently read "AUTO-PAUSED: SUPPRESSED" will read "PAUSED BY STAFF" when a person paused them.

Both switches are limited to management and owner, and every change records who made it and when.
