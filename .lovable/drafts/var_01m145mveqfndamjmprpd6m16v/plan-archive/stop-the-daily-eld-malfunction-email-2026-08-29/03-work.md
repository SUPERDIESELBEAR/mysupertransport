## Delete the test event

Permanent removal of malfunction event `6529849b…` (ELD-TEST harness):

- its escalation ledger rows in `eld_malfunction_notifications` (~230 rows across 8 days)
- any in-app notification rows generated from it
- the stored notice PDF in the `eld-notices` bucket
- then the event row itself

No other malfunction event exists in the database, so nothing else is touched, and the
staff ELD Malfunctions panel drops to its empty state.

## Cap the past-deadline cadence

In the ladder rules (`_shared/eld/escalationLadder.ts`):

- Day 9 fires once — "repair deadline passed", the loud one.
- After that, fire only every 7th day: day 16, day 23.
- Day 30 and beyond: no more individual escalation emails. The event stays open, stays
  red in the console, and stays in the daily compliance digest — it just stops filling
  inboxes.

Everything before day 9 is unchanged: rungs 3, 5, 6, 7, 8, the 24h/72h acknowledgment
chase, and the 5-day extension prompt all behave exactly as they do now. A granted
extension still holds the ladder, and resolving the event still ends it immediately.

## Technical notes

- `evaluateEvent`: replace the `day >= 9` predicate with `day === 9 || (day > 9 && day <= PAST_DEADLINE_LAST_DAY && (day - 9) % 7 === 0)`, with `PAST_DEADLINE_LAST_DAY = 23` as a named constant.
- Unit tests in the ladder spec: assert day 10–15 and day 30+ produce no `escalation_day` action, and days 9/16/23 do.
- Deletion runs as a data operation (delete + storage remove), not a migration.
- `process-eld-escalations` must be redeployed after the ladder change, since the shared module is bundled into the function.
