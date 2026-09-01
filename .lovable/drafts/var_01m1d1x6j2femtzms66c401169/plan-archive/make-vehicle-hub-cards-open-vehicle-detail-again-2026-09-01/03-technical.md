## Technical notes

Single file: `src/components/fleet/FleetRoster.tsx`.

- **Card wrapper (~line 554):** keep `onClick={() => onSelectOperator(row.operatorId)}`, add `role="button"`, `tabIndex={0}`, and `onKeyDown` for `Enter`/`Space`. Add `select-none` on the card so a drag over the driver name or a spec value cannot convert the gesture into a text selection.
- **Instrumented check before/after:** in the preview, use `document.elementFromPoint` over the driver-name and whitespace coordinates of a card to confirm which node receives the pointer, and confirm the card's handler fires. If an unexpected node is on top, fix that node (`pointer-events-none` on decorative layers) in the same pass.
- **Controls unchanged:** the truck/decal photo buttons (~640, ~658), Edit (~695), Log Update (~705), and Reactivate Unit (~717) keep `e.stopPropagation()`.
- **Table view (~759):** `TableRow` already has `onClick={() => onSelectOperator(row.operatorId)}` and the Actions cell already stops propagation. Add the same `select-none` treatment if a cell is found to swallow clicks; otherwise no change beyond verification.
- **Verification:** preview run clicking driver name, card whitespace, VIN, and Repair Cost in card view, then Driver/Unit/VIN/Repair Cost cells in table view, plus a keyboard Enter on a focused card. `bunx vitest run src/components/fleet` for regressions.
