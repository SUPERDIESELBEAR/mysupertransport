# Compliance Alerts: remove the "Xd ago" pill next to the Remind button

## What changes

Remove the small "Xd ago" / "Today" pill that appears between the **Last Renewed** column and the **Remind** button on every compliance alert row. This pill duplicates the date already shown in the **Last Reminded** column.

## What stays the same

- Last Action column (content, colors, sort toggle, tooltip)
- Last Reminded column (content, colors, tooltip)
- Last Renewed column (content, colors, tooltip)
- Row layout, column widths, scrolling, and breathing room
- Remind / Renew / Open button group

## File

- `src/components/inspection/ComplianceAlertsPanel.tsx`

## Location

Inside the row-rendering map, in the action-buttons area, there is an inline IIFE block that renders the relative-age pill when `remindedAt && !isSent`.

## Verification

At laptop width, each compliance alert row still shows Last Reminded with its date and color, but no "Xd ago" / "Today" pill appears between Last Renewed and the Remind button.
