# Compliance Alerts: fix the shifted columns, then drop the one real duplicate

## Why the two pills show the same information

They are not the columns you think you are hovering. The header labels and the data cells are out of alignment in this table — you can see it in the header itself, where "OPERATOR" and "DOC" are printed on top of each other, and the Status pill ("Expired 8m 15d ago") sits under the LAST ACTION heading.

Everything after Status is shifted one column to the left of its label:

```text
Header:   ... STATUS          LAST ACTION      LAST REMINDED    LAST RENEWED
Actual:   ... (expiry date)   Status pill      Last Action      Last Reminded   -> Last Renewed pushed past the label
```

So on Christopher Harris's row:
- the yellow "Aug 10" pill sitting under LAST REMINDED is really the **Last Action** cell
- the green "Aug 10" pill sitting under LAST RENEWED is really the **Last Reminded** cell

Both describe the same event, which is why the tooltips match. Confirmed against the data: there is no `cert_renewed` record for Christopher Harris (the most recent renewals in the system are from June and late July, for other drivers), so his true Last Renewed value is an em dash — it just isn't where the label says it is.

The columns themselves are genuinely different:
- **Last Reminded** = when staff last emailed the driver, who sent it, and whether the email was delivered.
- **Last Renewed** = when the document was actually marked renewed (`cert_renewed` in the audit log), and by whom.
- **Last Action** = whichever of those two is more recent. When a driver has been reminded but never renewed, Last Action is by definition a copy of Last Reminded — that is the one real redundancy.

## Proposed change

1. **Fix the column alignment.** Make the header row use the exact same track layout and padding as the data rows so every label sits over its own data. This alone resolves most of the confusion.
2. **Remove the "Xd ago" pill next to the Remind button.** Its date, sender, and delivered/failed status are already in the Last Reminded cell — this is a straight duplicate and it eats horizontal space.
3. **Add the relative age to the Last Reminded pill** (e.g. `Aug 10 · 2d`) so the "how long ago" signal you liked is preserved in one place, keeping the existing colors (green recent, yellow stale, red failed) and the full tooltip.
4. **Leave the Last Action column exactly as it is** — content, colors, tooltip, and sort toggle all unchanged.
5. **Reclaim the freed space.** The width released by the removed pill goes to the Operator, Last Reminded, and Last Renewed tracks and lowers the table's minimum width, so rows feel less crowded and need less horizontal scrolling.

## Resulting row

```text
[dot]  Operator     Doc   Expires    Status    Last Action ▾   Last Reminded   Last Renewed   [Remind] [Renew] [Open →]
```

## Technical notes

- File: `src/components/inspection/ComplianceAlertsPanel.tsx`.
- Alignment: the header and body rows both use `grid-cols-subgrid` with `px-4`, but the header's `items-start` cells and the sort `<button>` render at different intrinsic widths than the body cells; audit the nine header cells against the nine body cells and normalize each cell's alignment/justify classes so the tracks line up. Verify visually at laptop width before considering it done.
- Remove the `remindedAt && !isSent` pill IIFE inside the action-buttons div.
- Last Reminded cell: append relative age using the already-imported `differenceInDays`.
- Update `gridCols` tracks: widen Operator, Last Reminded, Last Renewed, narrow the actions track, and lower `min-w-[1240px]` accordingly.

## Verification

At laptop width: every header label sits directly over its column, drivers with no renewal show an em dash under LAST RENEWED, no "Xd ago" pill beside Remind, Last Reminded shows date plus age with its color and failure states intact, Last Action unchanged, and less horizontal scroll.
