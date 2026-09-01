## What changes

In `src/components/fleet/FleetRoster.tsx`, card grid item (~line 554):

1. Make the card an explicit activation target: `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler for Enter/Space, so it also works by keyboard.
2. Add `select-none` to the card so a slight drag while tapping text (driver name, VIN, serials) does not turn into a text selection that cancels the click.
3. Move activation to a handler that ignores events coming from real controls: if `event.target.closest('button, a, input, [role="dialog"]')` is inside the card, do nothing; otherwise call `onSelectOperator(row.operatorId)`. This makes the DOT pill, driver name, and all white space work while keeping Edit, Log Update, Reactivate, and the Truck/Decal photo buttons doing their own thing.
4. Keep the existing `stopPropagation` on those nested buttons as a second line of defense.

Table view: rows already navigate via `onClick` on `TableRow` with the action cell isolated — verify the Driver, Unit, VIN, and Repair Cost cells all navigate, and add the same `select-none` guard if a cell swallows the click.

No data, routing, or business-logic changes; `onSelectOperator` continues to set the selected operator and switch the Management view to `vehicle-detail`.
