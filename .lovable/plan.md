# Revised rate confirmation — four findings, confirmed and planned

All four were reproduced in the code. Findings first, then the fix.

## 1. Broker text is rewritten, not captured

Confirmed. The extraction prompt instructs the model to *compose* these fields rather than transcribe them:

- Special instructions: "sweep the ENTIRE document, every page… Format as one short line per term… Omit anything not printed. Do not pad with prose."
- Stop notes: "driver-relevant instructions for this stop only."

Both are model-authored summaries, so two runs over a byte-identical PDF produce two different strings. That fully explains the phantom diff, the run-to-run drift, and the dropped phone/email — a summarizer decides each run what earns a line. It also explains the merge: one `special_instructions` field is the only destination, so the BGLF terms paragraph and the printed Special Instructions block collapse into it in whatever order the sweep produced.

Fix:

- Add verbatim fields to the extraction contract, each transcribed exactly as printed with original wording, order, line breaks and punctuation, and each tied to its own source block:
  - `special_instructions_verbatim` — the block printed under the Special Instructions / Comments heading only.
  - `broker_terms_verbatim` — the terms/agreement paragraph, kept separate, never concatenated.
  - per stop: `notes_verbatim` — the stop's comment field as printed.
- Prompt rule for all three: transcribe, never summarize, never reorder, never omit a phone number, email address or sentence, never normalize casing. If a block is absent, return null (not an empty summary).
- The existing condensed `special_instructions` stays only as a derived display value, computed at render time from the verbatim text. The stored value on the load is the verbatim text.
- The load form gets the second field (broker terms) alongside special instructions, read-only-ish free text, both stored on the load.

## 2. Free-text changes arrive pre-accepted

Confirmed: `buildRevisionDiff` sets `defaultAccept: true` for every non-financial row (stop rows only drop to false when the stop already has driver check-in data), and `initialDecisions` copies that straight into the checkbox state.

Fix: classify each non-financial spec as `structured` or `freeText`. Free-text — special instructions, broker terms, stop notes, and any description-like field — defaults to unchecked and is labelled as requiring a read. Structured fields (dates, times, numbers, addresses, city/state/ZIP, contact, equipment, commodity) keep the current default-accept behaviour, still overridden to unchecked when the stop carries driver data.

## 3. The PRO row is dropped before the diff can see it

Two separate causes, both confirmed:

- **Dedup keyed on value alone.** In `parse-rate-confirmation`, `normRef(value)` strips punctuation and case, then any stop reference whose normalized value matches a load-level id (BOL, PO, broker load number) is discarded as "duplicates a load-level id", and any value appearing on more than one stop is dropped as an internal code. PRO BG969676425 carries the same value as the BOL row, so it is discarded before it ever reaches the client.
- **Only one reference per stop survives the diff.** `revisedRateCon.ts` diffs exactly two reference fields — `reference_number` and `reference_label` — both read through `pickReference(...)`, which returns a single winner. Added, removed and additional references are not diffed at all.

Fix:

- Key both dedup passes on `type + normalized value` (label class, not raw label), so PRO and BOL sharing one number both survive. Keep dropping a genuine repeat of the *same* labelled type.
- Diff the reference list as a set per stop: added, removed and changed rows each become their own non-financial change with the printed label and value, replacing the single-winner `reference_number` / `reference_label` pair for diff purposes. The primary gate reference the stop form displays is still chosen by `pickReference`.

## 4. Charge classification has no reimbursement class

Current options, and what each maps to in the active company pay policy ("SUPERTRANSPORT Standard"):

| Classification | Driver pay treatment |
| --- | --- |
| Linehaul | 72% |
| Fuel surcharge | 72% |
| Detention | 100% |
| Layover | 100% |
| Stop-off | 72% |
| TONU | 72% |
| Lumper | 100% (`lumper_reimbursement_pct`) |
| **Other** | **72%** (`other_accessorial_pct`) |

So `other` — the default the washout landed on — pays the driver 72% of a cost he paid in full out of pocket. On $30 that is a $8.40 loss to the driver, silently. Lumper is already the one-off exception the finding predicted: a dedicated column at 100%, with nothing declaring *why* it is 100%.

Fix — define the class rather than adding washout:

- Give every charge type a **pay class**: `revenue` (split at the policy percentage) or `reimbursement` (passes through whole at 100%, excluded from the revenue split and reported separately on the settlement).
- Add a `reimbursement` charge classification to the dropdown ("Reimbursement — driver-paid cost"), with a required description, so washout, pallet fees, wash-outs, scale tickets and anything else the driver fronts is one class, not a growing list of columns. Lumper stays as its own named type for reporting but is declared `reimbursement`, and its 100% comes from the class rather than from a bespoke column.
- Pay class stays policy-configurable per the SaaS rule; the percentage for a reimbursement class is fixed at 100 by definition and the UI states that.
- `other` remains revenue at 72% but is no longer the safe default: an accepted financial row classified `other` already requires a typed description, and the dropdown will show the pay treatment inline next to each option so a misclassification is visible before Apply.

## Regression tests

- Re-parse an unmodified document fixture and assert the comparison screen reports **zero** changes — this is the guard for item 1, and it also covers the reference set once item 3 lands.
- Reference diff: same value under BOL and PRO produces two surviving rows; an added PRO row appears as a non-financial change.
- Defaults: free-text rows unchecked, structured rows checked.
- Pay class: a `reimbursement` charge yields 100% to the driver and is excluded from the revenue split; `other` yields the policy percentage.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts`: verbatim fields in the JSON contract and prompt; dedup keyed on reference type + value.
- `src/lib/rateConfirmation.ts`: extend `ParsedRateConfirmation` / `ParsedStop`; add a `condenseInstructions` helper used only for display.
- `src/lib/revisedRateCon.ts`: per-spec `freeText` flag driving `defaultAccept`; reference-set diffing; reimbursement classification.
- `src/lib/loadRateMath.ts` / pay policy: pay-class map; migration adds the verbatim columns on `loads` and `load_stops` and the pay-class metadata. No RLS change — existing table policies cover new columns.

Nothing on screen changes until this is approved.
