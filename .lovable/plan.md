# Fleet Status: clarify the small name under each tile

## What those names actually are

Daniel Brown and Jason Jamal are not drivers. Both are staff with the **dispatcher** role (confirmed in the database). The small underlined text under each tile is a "last changed by" attribution: it shows the staff member who most recently set *any* driver to that status.

- Dispatched -> Daniel Brown was the last person to mark someone Dispatched.
- Not Dispatched -> Jason Jamal was the last person to mark someone Not Dispatched.
- Home / Truck Down show "Updated" because the last change there has a timestamp but no resolvable staff profile name.

Nothing is miscounted — the big numbers still come from the driver-based metrics. The label just reads like a driver name because there is no prefix and no consistent wording.

## Proposed fix

Remove the "last changed by" / "Updated" attribution line entirely from all four Fleet Status tiles. Each tile should only display:

- The large number.
- The status label.
- For Truck Down with a value > 0, the existing red pulse indicator.

The tooltip on the tile will still show the full "Last changed by <name> · <timestamp>" on hover, so the attribution is not lost — it just doesn't occupy a permanent line under the label.

## Technical notes

- `src/pages/management/ManagementPortal.tsx`, Fleet Status tile map (~line 1275-1323): remove the conditional `Tooltip` block and the `changedByName` / `triggerText` usage; keep the outer `TooltipProvider` wrapping in case we decide to add a simple tile-level tooltip later, but no tooltip content is needed if we remove it completely. If we keep the tile tooltip, set `title` attribute on the button instead of the hover line.
- No change to `fetchDispatchBreakdown` or `fetchOverviewMetrics` — counts are already correct. The `dispatchLastChanged` and `dispatchLastChangedAt` state can be removed if it is no longer used elsewhere; otherwise leave it for any other consumer.
