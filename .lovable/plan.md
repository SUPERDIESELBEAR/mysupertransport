# Change 1 — Take verbatim verification off the parse screen

Verification keeps running, keeps persisting, keeps logging. It stops being something a dispatcher is shown while creating a load.

## What comes off the parse screen

In `RateConfirmationParser.tsx`, remove the whole "Verbatim capture checked against the page" block: the section heading, the per-field verdict cards, the similarity / token / word / page-damage figures, the region-failure expanders, and the `VerbatimRepairField` repair flow with its page render and correction box.

That also retires from this screen the local repair plumbing that only fed that block (`verbatimValue`, `repairVerbatim`, and the `VerbatimRepairField` import). The `verbatim` state stays, because the results still have to reach the save payload and the diagnostics count.

## What stays on the parse screen

- Extracted values and the "Verify these against the document" chips
- Broker card
- Loadout assessment (score, signals, contradictions, derived window)
- Diagnostics count, including the count of regions that did not resolve
- Parse run fingerprint (client build, parser build, contract, model, seed)
- Source document viewer

## What keeps working, unchanged

- `verifyParsedVerbatim` still runs on every parse
- Results still ride on `result.verbatim_verification` and still persist to `loads.verbatim_verification` on save
- Diagnostics rows still write, including anchor misses and region failures
- `VerbatimVerificationCard` on Load Detail and the Parser Diagnostics page stay exactly as they are — that is where staff go deliberately to ask whether the parser is doing its job

Nothing is deleted from `verbatimVerify.ts`, `verbatimRegions.ts`, `verbatimCheck.ts`, `VerbatimRepairField.tsx`, or any test.

## Recommendation for the revision review screen

Keep a verdict block there, but narrow it to the one case a dispatcher can act on.

Today `RevisedRateConModal` renders repair cards for both `transcription_damaged` and `unverified`. My recommendation:

- **Keep `transcription_damaged`.** This is the Blue Grace case — four corrupted characters, visually obvious, and the dispatcher is about to accept a change to stored text. The verdict is relevant to a decision they are actually making, and the repair is a few seconds of typing.
- **Drop `unverified`.** This is the Nationwide and MegaCorp case: a similarity or token score the reader cannot interpret, attached to a repair box that asks for a 1,700-word retype. On the revision path it would sit next to the diff row and cast doubt on a change that is usually correct.
- **Drop `region_unresolved` / `layer_unreliable` / `no_layer`** from the screen too (they are already not rendered — this just makes it deliberate rather than incidental).

So the section stays, gated on `verdict === 'transcription_damaged'`, and its heading and copy narrow to corrupted captures rather than "did not pass the check". Everything still persists and is still readable on Load Detail.

If you would rather the revision screen also go silent, say so and I will gate it to nothing — but I think losing the pilcrow case there is a real loss, because that is the one path where the corrupted text is about to overwrite good stored text.

## Technical notes

- Files touched: `src/components/dispatch/loadForm/RateConfirmationParser.tsx` (remove the section and its repair handlers) and `src/components/dispatch/loadDetail/RevisedRateConModal.tsx` (narrow the filter and copy).
- `parserPathWiring.test.ts` asserts each `@parser-check` function is *called* somewhere reachable from both entry points. `verifyParsedVerbatim` keeps its call site on both paths, so the guard stays satisfied — I will run that test plus the verbatim suites to confirm.
- `docs/tms-build-status.md` gets a short standing rule: a check whose output a dispatcher cannot act on belongs in diagnostics and on Load Detail, not on the parse screen. Verification remains an operator-facing diagnostic, and the attached PDF remains the authority for any disputed charge.

Change 2 (taking verbatim text from a clean text layer) is not part of this pass and lands after this ships.
