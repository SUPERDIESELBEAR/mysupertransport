# Revision review: close the reference write path, label first captures, retain the revised PDF

Four changes, all in this pass. Confirmed against the code before writing this.

## 1. References: close the write path, and be honest until it is closed

Verified: `saveLoadReferences` has no production call site (only `RevisedRateConModal` and `CreateLoadPage` build the payload, and both drop `payload.references`), and `loadToFormValues` returns `references: []` with a comment saying the form does not carry them. So the diff always compares against an empty set — hence five additions where only PRO is new.

- Call `saveLoadReferences(loadId, payload.references)` after the RPC returns the load id, on both the create/edit save path and the revision apply path. Failure is reported like the rate-confirmation attach failure — the load stays saved, the dispatcher is told.
- `loadToFormValues` reads real rows. Because the form hydration is synchronous and the RPC read is not, references are fetched alongside the load in `fetchLoadForEdit` and passed through, so no call site changes shape.
- An empty `references` array remains a NO-OP on save (already the behaviour in `saveLoadReferences`) — editing a load through the form must not wipe what the document established.
- When the load has **no** reference rows on file, the review screen shows a note: references cannot be compared for this load, everything below is what the document prints. In that state reference rows default to **unchecked** (`defaultAccept: false`), not checked.

### 1a. Citations must survive the write path, with their printed labels

Checked, and the payload is not sufficient today. `referenceSchema.citations` is `number[]` — bare stop sequences — and `classifyReferences` keeps a single `label` for the collapsed row (first one wins). `saveLoadReferences` then writes `printed_label` from that one collapsed label. So on this document Stop 1's `PU#` and the References table's `Pickup Number` collapse to one row and the per-stop printed label is lost at save — exactly the relocation of the failure you describe.

Fix, end to end:

- `ClassifiedReference.citations` becomes `{ stopSequence: number; printedLabel: string }[]`, so the label as each stop printed it is carried through the collapse. The row's own `label` stays the load-level printed label (`Pickup Number`), falling back to the class label when the row is stop-only.
- `referenceSchema.citations` takes the same object shape, so the form payload carries it rather than bare numbers. Both `classifyReferences` consumers (`rateConfirmation.ts` create path, `revisedRateCon.ts` diff/apply path) are updated together.
- `saveLoadReferences` writes one `load_reference_citations` row per citation with `printed_label` from that citation, not from the reference row, and `load_stop_id` resolved by sequence as it does today.
- `fetchLoadReferences` reads the printed label back with each citation so the review screen can show `Stop 1 — PU#`.

Diffing continues to key on class + normalized value; citations are never part of the identity, so a label difference between stop and load scope does not create a second reference row.


## 2. First capture is not a change

`special_instructions_verbatim`, `broker_terms_verbatim` and `stop_notes_verbatim` are null on loads that predate verbatim capture. A null → content transition is a first capture.

The diff row carries a `firstCapture` flag when the stored side is empty and the document side has content. The review screen renders those as "captured from this document (not previously stored)" rather than `— → [content]`, groups them out of the change count, and leaves them unchecked as they are today.

## 3. The display summary stops producing a diff row

`special_instructions` is a model-authored summary — three runs of the same document have produced three wordings. Its `LOAD_FIELDS` spec is removed so it never generates a change row. It stays a stored/render-time field; only `special_instructions_verbatim` is compared.

## 4. Revised PDF retention — confirmed unbuilt

Verified in `RevisedRateConModal`: `uploadLoadDocument` runs only inside `apply()`, after the save succeeds. Cancel discards the file, which matches what you saw.

New behaviour: the file uploads once the document-identity check passes (immediately after parse for a clean match, or after the dispatcher confirms on the identity step), as `revised_rate_confirmation`, with a note recording that it was uploaded for review. On cancel, the note is updated to record reviewed, not applied, with the timestamp and the reviewer. On apply, the same row's note is replaced with the revision reason — no second upload, no duplicate file. If the review is abandoned by closing the browser, the file is still attached with the review-pending note.

## Test coverage

An integration-level test for the write path, per your addition: save a load through the real save path, read it back through `loadToFormValues`, assert the reference rows and citations return with the right class, value and stop scope. Deleting either the `saveLoadReferences` call or the read must turn it red.

Wiring audit reported before the charge diff is touched: each function added in this pass gets checked for a production call site and reported as wired or test-only.

## Technical notes

- `src/lib/loadReferences.ts` — unchanged; it was already correct.
- `src/lib/loadDetail.ts` — `fetchLoadForEdit` also reads `load_references` with citations.
- `src/lib/loadEdit.ts` — `loadToFormValues` maps those rows instead of `[]`.
- `src/pages/dispatch/CreateLoadPage.tsx`, `src/components/dispatch/loadDetail/RevisedRateConModal.tsx` — call `saveLoadReferences` post-RPC.
- `src/lib/revisedRateCon.ts` — `firstCapture` on `NonFinancialDiff`, reference rows default unchecked when the comparison set is empty, `special_instructions` spec removed.
- `RevisedRateConModal` — upload-on-identity-pass, note lifecycle, no-baseline note, first-capture rendering and change-count exclusion.
- No schema changes.
