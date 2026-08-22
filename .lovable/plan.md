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

The label is produced by the pay class, not formatted from a percentage at the call site. Each class returns its own treatment description; the percentage classes return "72% to driver" and so on, and a class whose treatment is not a percentage — the reimbursement class, when it ships — returns its own wording such as "reimbursed at cost" without any change to the dropdown. Where the policy cannot be read, options render without a treatment line rather than a guessed number.

No reimbursement class is added now — that spec is still coming.

## 4. File the document's references as the load's baseline

A separate action on the no-baseline note: "File these as the load's reference numbers." It is not an accept and not an Apply — it can be used on its own and leaves the per-row decisions and the change count untouched.

What it does:

- Writes every reference the document printed, with its citations and each stop's printed label, as the load's reference rows. Nothing else on the load is written.
- Records provenance: which document established the baseline, when, and which staff member did it — stored on the load's change history as a baseline event, distinct from a revision, and surfaced on the load so it is later visible that the references came from a revised rate confirmation rather than the original.
- Refreshes the review screen in place: the note is replaced by the filed baseline, and the reference rows disappear because the document now matches what is on file.

Once filed, the same document re-reviewed produces no reference rows at all. That is the assertion the test asserts.

## Answer on the reference question

Confirmed: with all five rows unchecked, applying writes no reference rows. `applyRevision` only pushes a reference into the form values for an accepted row, and the modal saves references only when that array is non-empty. Before this change the load kept zero rows on file and the next review repeated the same no-baseline note; the baseline action above is what closes that.

## Technical notes

- `src/lib/revisedRateCon.ts`: drop the `stop_notes` entry from `STOP_FIELDS`; move the `firstCapture` test off `spec.verbatim` onto the empty-stored-side condition in both the load and stop diff loops.
- `src/components/dispatch/loadDetail/RevisedRateConModal.tsx`: render pay treatment per option and under the trigger; remove the `Other` default; add the baseline action to the no-baseline note with its own confirm and busy state.
- New helper resolving the effective pay policy for a load (driver assignment, then company default) and returning a per-class treatment descriptor rather than a raw number.
- Baseline write reuses `saveLoadReferences` with the document's classified references, plus a `load_change_history` entry of a new baseline kind carrying the document id and actor.
- Tests: stop-notes churn produces no row; an empty-to-content non-verbatim row is labelled and uncounted; treatment labels follow a non-default policy and a non-percentage class; filing the baseline then re-diffing the same document yields zero reference rows.

