# Compliance Alerts: remove the duplicated reminder pill

## Answering your question first

**Last Reminded and Last Renewed do not hold the same data.** Last Reminded is the date staff last emailed the driver; Last Renewed is the date the document was actually marked renewed. They only *look* alike because both render as a small green pill when recent.

The green pill you hovered that said "reminder" is the **Last Action** pill, not Last Renewed. Last Action shows whichever happened most recently — reminder or renewal — and turns green when a renewal is the newest event, so its tooltip text and its color can appear to disagree. Last Action stays untouched in this plan.

**The genuine duplicate is the "Xd ago" pill next to the Remind button.** It shows the same reminder date as the Last Reminded column, with the same staff name and the same delivered/failed tooltip. Nothing in it is unique.

## Proposed change

- **Remove the "Xd ago" pill next to the Remind button.** Its date, author, and delivery status all already live in the Last Reminded cell.
- **Add the relative age to the Last Reminded pill** so you keep the "how long ago" signal in one place — e.g. `Aug 9 · 3d`. Existing color coding stays (green recent, yellow stale, red email failed), as does the full tooltip with timestamp, staff name, and delivery result.
- **Make the two columns visually distinct** so they stop reading as twins: keep the check icon and reminder colors on Last Reminded, and give Last Renewed a single neutral-green treatment with the rotate icon, no relative age.
- **Reclaim the space.** Dropping the pill frees roughly 90px per row in the action group; the freed width goes to the Operator, Last Reminded, and Last Renewed tracks and lowers the table minimum width, so rows breathe and need less horizontal scroll.
- **Last Action column: unchanged.** No edits to its content, colors, tooltip, or sort toggle.

## Resulting row

```text
[dot]  Operator     Doc   Expires    Status    Last Action ▾   Last Reminded   Last Renewed   [Remind] [Renew] [Open →]
```

## Unchanged

Data loading, filters, the "No action yet" filter, bulk reminders, renew logic, tooltips content, and DOT Inspection tracking all behave exactly as they do now. This is presentation only.

## Technical notes

- File: `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Remove the reminder-age pill block (the `remindedAt && !isSent` IIFE) inside the action-buttons div.
- Last Reminded cell: append relative age using the already-imported `differenceInDays`. All other logic untouched.
- Last Action cell and its header sort button: no changes.
- Update `gridCols` / `subgridRow` track strings: widen Operator, Last Reminded, Last Renewed, narrow the actions track, and lower `min-w-[1240px]` accordingly.

## Verification

At laptop width: no "Xd ago" pill beside Remind, Last Reminded shows date plus age with its color coding and failure state intact, Last Action behaves exactly as before, and the table needs less horizontal scroll.
