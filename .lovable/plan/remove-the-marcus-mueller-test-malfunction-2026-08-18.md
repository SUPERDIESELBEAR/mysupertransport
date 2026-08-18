# Remove the Marcus Mueller test malfunction

## What happens

The ELD Malfunctions menu shows one open event for Marcus Mueller (code R — data recording, discovered Aug 3, 2026). It was a test on the previous build. It will be permanently deleted, along with everything hanging off it, so nothing is left to escalate or display.

## What gets deleted

- The malfunction event row (id `9bf43797…`)
- Its 373 escalation notification rows
- The stored notice PDF in the `eld-notices` bucket for that event

No other driver or record is touched — this is the only malfunction event in the database.

## Steps

1. Delete the notification rows for the event, then the event row (data operation, not a schema change).
2. Remove the notice PDF object at `ee993ec0…/9bf43797…/notice.pdf` from the `eld-notices` bucket.
3. Verify: `eld_malfunction_events` and `eld_malfunction_notifications` return zero rows for that event, and the staff ELD Malfunctions panel renders its empty state.

## Notes

No code changes are needed — the panel is driven entirely by the table. The escalation cron will have nothing to act on once the row is gone.
