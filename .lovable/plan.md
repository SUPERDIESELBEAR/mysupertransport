# Fleet Status: clarify the small name under each tile

## What those names actually are

Daniel Brown and Jason Jamal are not drivers. Both are staff with the **dispatcher** role (confirmed in the database). The small underlined text under each tile is a "last changed by" attribution: it shows the staff member who most recently set *any* driver to that status.

- Dispatched -> Daniel Brown was the last person to mark someone Dispatched.
- Not Dispatched -> Jason Jamal was the last person to mark someone Not Dispatched.
- Home / Truck Down show "Updated" because the last change there has a timestamp but no resolvable staff profile name.

Nothing is miscounted — the big numbers still come from the driver-based metrics. The label just reads like a driver name because there is no prefix and no consistent wording.

## Proposed fix

1. Prefix the attribution so it can't be mistaken for a driver: show `by Daniel Brown` instead of `Daniel Brown`.
2. Use the same wording when the name is unknown: `Updated <relative time>` becomes `by Staff` only when a name exists; otherwise keep "Updated".
3. Keep the tooltip as-is (name + full timestamp), but reword to `Last changed by Daniel Brown - Aug 10, 9:12 AM` so hover confirms the meaning.
4. Optional (say the word if wanted): drop the attribution line entirely and move it into the tooltip only, keeping the tiles to just number + label.

## Technical notes

- `src/pages/management/ManagementPortal.tsx`, Fleet Status tile map (~line 1275-1323): `triggerText` becomes `by ${changedByName}`; tooltip string standardized to "Last changed by X - <timestamp>".
- No change to `fetchDispatchBreakdown` or `fetchOverviewMetrics` — counts are already correct.
