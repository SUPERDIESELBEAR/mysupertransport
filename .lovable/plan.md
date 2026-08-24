# Rolling River, round two — one load-type change, one reference vocabulary

## What I confirmed by reading the code and the database

- **The banner does bypass the carry.** `RateConfirmationParser.confirmLoadout` calls `applyLoadoutFields`, which writes `load_type = 'loadout'` directly through `form.setValue`. `planLoadTypeCarry` lives only in `changeLoadType` inside `CreateLoadPage`, which the Load Type buttons call. Two writers of the same state, one without the logic — exactly the shape you named.
- **Per-ton does not lose the $150.** Switching to Per-Ton Bulk keeps `linehaul_rate` (both `standard` and `per_ton` map to the same amount field, so the carry is a deliberate no-op). What changes is that Per-Ton Bulk forces `rate_type = 'per_ton'`, which hides the Linehaul Rate input and makes Total Load Value `rate_per_ton x tons` = $0. So it reads as a zeroed rate while the number is still in the form — which is why switching on to Loadout could hand you the $150 back. Deliberate, but silent, and it should not be silent.
- **The placeholder check is not on the path that filled Stop 1.** `isPlaceholderReferenceValue` is only consulted inside `classifyReferences`, which produces the load-level `references` array. A stop's `reference_number` / `reference_label` come from `pickReference(stop.references)` in `applyParsedToForm` — a separate route that never sees the vocabulary. That is why "Assign at pickup" still landed.
- **Diagnostics: grants and the insert policy are healthy**, and two Blue Grace rows from earlier exist. No rows from tonight's Rolling River parse landed, and nothing else drains the miss buffer, so the cause is not yet established — the plan makes proving it a step rather than guessing.

## What gets built

### 1. One function for a load-type change

Move the carry logic out of the page into a shared `useLoadTypeChange(form)` hook (new `src/components/dispatch/loadForm/useLoadTypeChange.ts`). It owns everything a type change means: `planLoadTypeCarry`, the write, the conflict toast, and recording what it changed for undo.

- The Load Type buttons call it (as today).
- `confirmLoadout` calls it, then applies the trailer detail fields. `applyLoadoutFields` stops writing `load_type` itself — it only fills loadout fields — so it is no longer possible to change load type without going through the hook.
- Guard test extending the wiring-test idea: assert no file outside the hook writes `load_type` via `setValue`, so a third caller cannot reintroduce the gap.

### 2. Per-ton says what it is doing

When the switch is standard/loadout to Per-Ton Bulk and a flat amount is present, the hook toasts: the flat amount is kept, but Per-Ton Bulk bills per ton, so the total is Rate Per Ton x Estimated Tons until those are entered. The Per-Ton block also shows the retained flat amount as a line the dispatcher can see and reuse, so no number ever appears to vanish.

### 3. The loadout banner is answerable and reversible

The banner stays after it is answered, showing the answer:

- Answered "Yes": "Switched to Loadout" with an **Undo** button.
- Answered "No": "Kept as is" with a **Switch to Loadout** button.

Undo restores the prior load type, reverses the carry (amount back to the field it came from), and restores every loadout field the action wrote — including the trailer use window (`loadout_use_start`, `loadout_use_end`, `loadout_use_period_days`) the parser read off the document. Redo re-applies the whole change from the snapshot, dates included, so answering the banner twice never costs a re-parse. The hook snapshots the tracked fields before and after the change; nothing is inferred from the current form.

### 4. The placeholder vocabulary covers stop reference numbers

`pickReference` filters out placeholder values using the same `isPlaceholderReferenceValue` vocabulary, so Stop 1 comes through blank. Each stop-level placeholder it drops is added to the diagnostics rows as `reference_row_dropped` (label and class only, never a value beyond the placeholder phrase itself), so the vocabulary keeps growing from the same log. Tests cover the stop path directly, since the existing test only covered classification.

### 5. Prove diagnostics rows land

`logParserDiagnostics` already returns the number of rows written. The parse panel will state it: "N parser diagnostics recorded" on success, and it already toasts on failure. Then Rolling River is re-parsed and I read the table back and state plainly whether the rows landed and what they contain — kind, failure code, stop number, captured heading lines. If they still do not land, that is a second, separate cause and it gets named as its own finding rather than folded back into this item.


### 6. Anchor findings recorded, no anchors added

Appended to `docs/tms-build-status.md`, held for the three-document design:

- Rolling River prints **no "Stop N" headings at all**, so stop slicing has nothing to cut — `stop_not_found`, a structurally different problem from a `Comments` heading missing its colon.
- `broker_terms` -> `anchor_not_found`; no printed heading matched the terms anchors.
- Standing note: an anchor set that assumes stop headings exist cannot serve documents that number stops only in a table.

## Technical notes

Files touched: new `useLoadTypeChange.ts`; `CreateLoadPage.tsx` (uses the hook); `RateConfirmationParser.tsx` (banner state, hook call, diagnostics count line); `src/lib/rateConfirmation.ts` (`applyLoadoutFields` no longer sets `load_type`; `pickReference` placeholder filter; stop drops fed to diagnostics); tests for the stop placeholder path and the single-writer guard; `docs/tms-build-status.md`. No database changes.
