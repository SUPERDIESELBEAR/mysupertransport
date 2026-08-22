# Revision review: stop notes churn, and pay treatment in the classifier

## 1. Stop notes stop generating change rows

`stop_notes` is a model-composed field. The parser prompt asks for "driver-relevant instructions for this stop only" — a written summary, not a transcription. `stop_notes_verbatim` is the transcription slot, governed by the strict verbatim rule, and it is already on this screen as a first capture.

So `stop_notes` is the same class of field `special_instructions` was, and gets the same treatment: removed from the stop diff specs entirely. It stays a stored display field, written when a load is created or a revision is applied, but it never produces a change row. That removes both rows the dispatcher flagged — Stop 1's paraphrase churn and Stop 2's empty-to-content row.

## 2. firstCapture applied by condition, not by field list

Today `firstCapture` is only considered when a spec is marked `verbatim`. That is why Stop 2's null-to-content row was not labelled. The condition becomes structural: any diff row where the stored side is empty and the document has content is a first capture — labelled "not previously stored", excluded from the change count, and left unchecked.

Verbatim fields keep their existing wording. With `stop_notes` out of the diff, the only rows this newly touches are genuinely absent stored values.

## 3. Pay treatment shown inline in the classification dropdown

Each option in the dropdown gets its settlement consequence next to the name, read from the pay policy in force for this load's driver (driver-specific assignment where one exists, otherwise the company default), not hardcoded:

```text
Detention                     100% to driver
Layover                       100% to driver
Lumper reimbursement          100% to driver
Linehaul rate correction       72% to driver
Fuel surcharge correction      72% to driver
Stop-off charge                72% to driver
TONU                           72% to driver
Other                          72% to driver
```

The same line repeats under the closed dropdown for the chosen option, replacing the current 100%-only hint, so the consequence is visible without opening the menu. The dropdown no longer preselects `Other`: the dispatcher picks deliberately, and the parser's suggested category is offered as a pre-selection only when the document gave one.

Where the policy cannot be read, the options render without percentages rather than showing a guessed number.

No reimbursement class is added — that spec is still coming.

## Answer on the reference question

Confirmed: with all five reference rows unchecked, applying writes no reference rows. `applyRevision` only pushes a reference into the form values for a row the dispatcher accepted, and the modal calls the reference save only when that array is non-empty. The load keeps zero rows on file, and the next revision review shows the same no-baseline note and the same five uncomparable rows.

If you want a baseline established without treating the numbers as broker changes, the natural place is a single "these are the numbers on this document — file them as the baseline" action on the no-baseline note, separate from the per-row accept. Say the word and it goes in this pass; it is not in scope as written.

## Technical notes

- `src/lib/revisedRateCon.ts`: drop the `stop_notes` entry from `STOP_FIELDS`; move the `firstCapture` test off `spec.verbatim` onto the empty-stored-side condition in both the load and stop diff loops.
- `src/components/dispatch/loadDetail/RevisedRateConModal.tsx`: render pay treatment per option and under the trigger; remove the `Other` default.
- New helper for resolving the effective pay policy for a load (assignment then company default), queried by the modal.
- Tests: stop-notes churn produces no row; empty-to-content non-verbatim row is labelled and uncounted; percentage labels follow a non-default policy.
