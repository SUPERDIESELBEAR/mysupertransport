# Make the whole Vehicle Hub card open the vehicle

## What the code says today

Each card in Vehicle Hub is a plain `div` whose `onClick` opens the vehicle detail screen. Everything inside it — unit number, DOT pill, driver name, specs, VIN, serials, Repair Cost — is non-interactive text, so a click on any of it should bubble up to that one handler. The only children that deliberately swallow clicks are the real controls: the Truck and Decal photo buttons, Edit, Log Update, and Reactivate Unit.

That means "only Repair Cost works" is not explained by the markup as written, so I am not going to claim a root cause I haven't confirmed. Step 1 is reproducing it in the preview and reading what element actually receives the click in the name/whitespace areas; the fix below is written so the card works regardless of what that turns out to be.

## What changes

1. **Verify first.** Open Vehicle Hub in the preview, click the driver name, the empty space between rows, and the Repair Cost label on the same card, and record which ones navigate and which element is under the cursor.
2. **Make the card target explicit instead of relying on bubbling.** Give the card a real accessible activation target covering its full area: `role="button"`, `tabIndex={0}`, and Enter/Space handling, with the click handler reading the card's own row rather than depending on which text node was hit. Text areas get `select-none` so a stray drag on the driver name can't turn the tap into a text selection instead of a click.
3. **Keep the real controls isolated.** Photo buttons, Edit, Log Update, and Reactivate Unit continue to stop propagation, so they never open the vehicle by accident.
4. **Table view.** Rows already carry the same open-on-click handler with the Actions cell stopping propagation. I'll click a row's Driver, Unit, VIN, and Repair Cost cells and confirm all four open the vehicle; if any cell swallows the click, it gets the same treatment as the card.

No data, permission, or query changes — this is presentation and event wiring only.
