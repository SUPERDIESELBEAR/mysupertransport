# Applications list: show a real date instead of a dash

## What's happening

The dash you see isn't a strike-through — it's the "no date" placeholder. Two things combine:

- 39 of the 96 approved applications have no submitted date stored at all (older records from Mar–Jun, plus staff-added ones). Those rows render a dash.
- The list is sorted by submitted date, newest first. In Postgres, rows with no date sort to the **top** with that ordering, so the entire first screen of the Approved tab is exactly the rows that have no date. That's why it looks like dates suddenly stopped displaying.

Rows further down the list still show their dates.

## The fix

1. Sort so the missing-date rows fall to the bottom instead of the top, keeping the newest real submissions first.
2. When there's no submitted date, fall back to the record's created date and label it so it's clearly not a submission timestamp (e.g. "Jun 15, 2026" with a muted "created" tag). Only show a dash when neither date exists.

Applies to the table view, the compact/mobile row, and the card list so all three read the same.

## Technical detail

- `src/pages/management/ManagementPortal.tsx`, `fetchApplications`: change `.order('submitted_at', { ascending: false })` to include `nullsFirst: false`, with `.order('created_at', { ascending: false })` as a secondary sort.
- Same file, the three places that render the submitted date (table cell ~line 1737, compact row ~line 1763, card ~line 1489): use a small shared helper that returns the submitted date, else the created date flagged as a fallback.

No database or backend changes — this is display and ordering only. Historical submitted dates that were never captured can't be recovered.
