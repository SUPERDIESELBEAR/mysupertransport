# Compliance Alerts: remove the duplicated "last reminder" displays

## What you're seeing today (confirmed in the code)

There are four surfaces showing overlapping data on every row:

1. **Last Action** column — shows whichever happened most recently, a reminder *or* a renewal. Its pill turns green with a "Renewed" tooltip when the renewal is newer, blue when the reminder is newer. This is why the green pill also mentions a reminder: it is a merged column, not a renewal column.
2. **Last Reminded** column — the reminder date, colored green if within 7 days, yellow if 30+ days old, red if the email failed.
3. **Last Renewed** column — the renewal date.
4. **"3d ago" pill next to the Remind button** — the same reminder date as #2, expressed relatively, with an identical tooltip.

So #1 is a computed duplicate of #2 and #3, and #4 is a second copy of #2. Two of the four can go.

## Proposed change

Keep two real columns and drop the duplicates:

- **Remove the "Last Action" column entirely.** It carries no information that Last Reminded and Last Renewed don't already show, and it is the source of the confusing green "Reminded/Renewed" mix.
- **Remove the "Xd ago" pill next to the Remind button.** Its date, its author, and its delivery status all already live in the Last Reminded cell.
- **Keep the sort control.** The "Last Action" header is currently the sort toggle (urgency / most recent action / oldest action). Move that toggle onto the **Last Reminded** header so sorting behavior is unchanged, still ranking by the most recent of reminder-or-renewal.
- **Make Last Reminded carry the relative age.** Show the date plus a muted relative age on the same pill (e.g. `Aug 9 · 3d`) so the "how long ago" signal you liked from the button pill is preserved in one place. Keep the existing color coding (green recent, yellow stale, red failed) and the full tooltip with time, staff name, and delivery result.
- **Reclaim the space.** Dropping one column and one pill frees roughly 200px per row; the table minimum width comes down accordingly and the remaining columns get wider tracks, so rows feel less crowded and less horizontal scrolling is needed.

## Resulting row

```text
[dot]  Operator        Doc     Expires       Status         Last Reminded ▾   Last Renewed   [Remind] [Renew] [Open →]
```

## Unchanged

Data loading, filters, the "No action yet" filter, bulk reminders, renew logic, tooltips content, and DOT Inspection tracking all behave exactly as they do now. This is presentation only.

## Technical notes

- File: `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Remove the Last Action header cell and its row cell IIFE; remove the reminder-age pill block inside the action-buttons div.
- Move the sort `<button>` markup onto the Last Reminded header; sort comparator keeps using `max(lastReminded, lastRenewed)`.
- Update `gridCols` / `subgridRow` track strings: drop one track, widen Operator, Last Reminded, Last Renewed, and lower `min-w-[1240px]`.
- Add the relative-age suffix using the existing `differenceInDays` import.

## Verification

At laptop width: one reminder display per row, no "Last Action" column, sorting still toggles from the Last Reminded header, and the table needs noticeably less horizontal scroll.
