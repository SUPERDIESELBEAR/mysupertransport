# Absence Log reasons — what exists and the one step left

The Absence Log already has this feature built in this draft. Dispatch picks a
day (or a week, with the range tool) on a driver's calendar, sets the status —
Home, Not Dispatched, Truck Down — and chooses a reason with an optional note.
Reasons are stored **per day**, never overwritten, and the Absence Log reads
them back as a dated time log with totals and a month / quarter / year /
all-time or custom range.

The reason picker is currently greyed out with the note "Reasons become
available once this update is accepted." That is not a missing feature: the
reason field is a new database column, and a draft is not allowed to change the
live database. It is staged and applies the moment you accept this draft.

## The one step left

Accept this draft. On accept:

- the per-day reason column is added to the dispatch day log
- the reason picker on the day popover and the range tool unlocks
- every reason entered from then on is kept as history, with who set it and when
- the Absence Log lists stretches labelled by reason (consecutive same-reason
  days collapse into one row; a gap or a change starts a new row)

Nothing needs rebuilding, and the calendar colours you have back now stay as
they are.

## Reasons dispatch can pick

Truck Down · Home Time · Vacation · Medical · Personal · Waiting On Load ·
No Driver · Other (a note is required when Other is chosen)
