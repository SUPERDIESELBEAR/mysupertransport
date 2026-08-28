## Technical

New helper in `src/lib/equipmentSync.ts`:

- `serialDiffPositions(a, b): number[]` — compares the two serials after `normalizeSerial` (dashes/spaces stripped, uppercased). Equal length is the normal case for a canonical collision; when lengths differ, fall back to marking the trailing overflow so the helper never throws.
- `describeSerialDiff(a, b): string | null` — "Differs at position N: X vs Y" (or "positions N and M" for two marks), returning null when there is nothing to mark.

New presentational component `src/components/equipment/SerialDiffText.tsx`:

- Props `{ value: string; against: string; className?: string }`.
- Renders the serial in `font-mono`, wrapping characters at diff positions in a `<mark>`-style span using accent tokens (`bg-accent text-accent-foreground rounded-sm px-0.5 font-semibold`) — no hardcoded colors.
- Positions are computed on the normalized string but applied to the displayed raw value by index mapping, so a serial containing a dash still highlights the right glyph.

Wiring:

- `src/components/equipment/SerialConflictsPanel.tsx` — replace the plain `<p className="font-mono">{item.serial_number}</p>` with `SerialDiffText`, comparing against the other record in the pair (for groups of more than two, compare against the first record that is not itself). Add the `describeSerialDiff` line under the device-type label. Use `SerialDiffText` for the two serials named in the confirm dialog.
- `src/components/equipment/EquipmentItemModal.tsx` — in the near-match and collision callouts, render the matched serial with `SerialDiffText` against the value currently typed.

Accessibility: the highlighted span carries a `title`/`aria-label` describing the character, so the meaning is not carried by color alone; the text note above the pair states the difference in words.

No database, RLS, or matching-logic changes.
