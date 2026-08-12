# Compliance Alerts: remove the duplicated "last reminder" displays

## What you're seeing today (confirmed in the code)

There are four surfaces showing overlapping data on every row:

1. **Last Action** column — shows whichever happened most recently, a reminder *or* a renewal. Its pill turns green with a "Renewed" tooltip when the renewal is newer, blue when the reminder is newer. This is why the green pill also mentions a reminder: it is a merged column, not a renewal column.
2. **Last Reminded** column — the reminder date, colored green if within 7 days, yellow if 30+ days old, red if the email failed.
3. **Last Renewed** column — the renewal date.
4. **"3d ago" pill next to the Remind button** — the same reminder date as #2, expressed relatively, with an identical tooltip.

So #1 is a computed duplicate of #2 and #3, and #4 is a second copy of #2. Two of the four can go.

## Proposed change

Keep **Last Action** as the at-a-glance column and drop the two displays that duplicate it:

- **Keep the "Last Action" column.** It stays the sortable, most-recent-touch column, and it keeps its sort toggle (urgency / newest action / oldest action).
- **Make Last Action clearer.** Label the pill with what actually happened instead of relying on color alone — e.g. `Reminded Aug 9 · 3d` or `Renewed Aug 2`. That removes the confusion where a green pill's tooltip talked about a reminder.
- **Remove the "Last Reminded" column.** Its date, staff name, freshness color, and email-delivery result all fold into the Last Action cell and its tooltip.
- **Remove the "Xd ago" pill next to the Remind button.** It is a third copy of the same reminder date.
- **Keep the "Last Renewed" column.** Renewal history is genuinely separate information and stays its own column.
- **Reclaim the space.** Dropping one column and one pill frees roughly 200px per row; the table minimum width comes down accordingly and the remaining columns get wider tracks, so rows feel less crowded and need less horizontal scrolling.

## Resulting row

```text
[dot]  Operator        Doc     Expires       Status         Last Action ▾   Last Renewed   [Remind] [Renew] [Open →]
```

## Unchanged

Data loading, filters, the "No action yet" filter, bulk reminders, renew logic, tooltips content, and DOT Inspection tracking all behave exactly as they do now. This is presentation only.

## Technical notes

- File: `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Remove the Last Reminded header cell and its row cell IIFE; remove the reminder-age pill block inside the action-buttons div.
- Extend the Last Action cell: prefix the pill with `Reminded` / `Renewed`, append relative age via the existing `differenceInDays` import, and carry over the email-failure red state plus the `✗ Email failed` / `✓ Email delivered` tooltip line from the removed Last Reminded cell.
- Sort toggle stays on the Last Action header; comparator unchanged (`max(lastReminded, lastRenewed)`).
- Update `gridCols` / `subgridRow` track strings: drop one track, widen Operator, Last Action, Last Renewed, and lower `min-w-[1240px]`.

## Verification

At laptop width: one reminder display per row, Last Action still present and sortable with an explicit Reminded/Renewed label, email-failure state still visible, and the table needs noticeably less horizontal scroll.
