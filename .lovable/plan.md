# Verbatim: the pilcrow capture, and the check that blessed it

## Findings (measured this turn)

**1. Nothing writes back to a verbatim field after verification. The comparator is clean.**
- `RateConfirmationParser.parse()` applies the parsed values to the form first, then calls `verifyAgainstLayer(file, result)` and only stores the returned verdicts (`result.verbatim_verification`, `setVerbatim`). No `form.setValue` runs on a verbatim path after that.
- `verifyVerbatim()` returns a verdict object and has no writer. The revision path reads the field straight off the parse response (`read: p => p.verbatim?.special_instructions?.value`); `loadSavePayload.ts` passes it through unchanged.
- So the layer did not win a reconciliation. **The model returned the pilcrow.** Cause (1), not cause (2).

Why it is not random: the PDF is handed to the gateway as a `file` block (`data:application/pdf;base64,...`). For a text-based tender the model's view of the page is that same embedded text layer — the one that renders `53' 102"` as a pilcrow. So the model is transcribing the damaged layer faithfully, which makes this recurrent, not a one-off slip that a re-parse reliably fixes.

**2. The verdict this field received: `verified`.** Reproduced against the Blue Grace fixture:

| Capture | similarity | tokens | region damage | verdict |
| :-- | :-- | :-- | :-- | :-- |
| Faithful (`53' 102"`) | 0.9929 | pass | 4.98% | verified |
| This run (`¶`) | **1.0000** | pass | 4.98% | **verified** |

`normalizeForVerbatim` strips `\u00B6` from *both* sides before scoring. The corrupted capture therefore normalizes to exactly the layer and scores a perfect 1.0 — **higher than the faithful transcription**. The comparator is not merely blind to this corruption; it rewards it.

**3. The token check could not see it, by construction.** Signal tokens are extracted from the region *after* the same normalization, so the layer no longer prints `53' 102"` either — nothing demands it. `missingTokens` is empty and `tokenPass` is true, correctly per its own contract. Nothing else on the review screen would surface it: the row renders as a plain verbatim change with a green verified marker.

**4. Raw response for this run is not recoverable.** The function logs only lengths: `special_instructions=648 chars` (19:44) and `678 chars` (19:46). No content is logged, so the pre-verification payload cannot be read back — itself a gap the fix closes.

## What gets built

### A. Damage in the transcription is a defect signal, not something to normalize away
Normalizing damage on the *layer* side is correct and stays. Normalizing it on the *transcription* side is what hid this: the printed page has no pilcrow, so a pilcrow, control character or `&amp;amp;` chain in the model's output can only mean the model copied the broken layer.

- New `detectTranscriptionDamage(raw)` in `verbatimVerify.ts`: returns the damage artifacts found in the transcription with their surrounding context (e.g. `REQUIRED ¶ SWING DOOR`).
- New verdict `transcription_damaged`, ranked above every other outcome — a field with damage markers in its captured text can never read `verified`, whatever the similarity is. Similarity, tokens and region damage are still computed and reported alongside, so the row stays diagnosable.
- `VerbatimVerification` gains `transcriptionDamage: string[] | null`.

### B. Surface it where the value is accepted
- Parser review list (`RateConfirmationParser.tsx`) and the revision diff row (`RevisedRateConModal.tsx`) show: "Contains text-layer corruption — the document prints something here that the parser could not read." Each artifact is shown with its context so the dispatcher sees exactly which span is affected.
- The diff row for a damaged verbatim field **defaults to reject**, the same treatment as a stop with driver data. Accepting it stays possible and stays a deliberate act.

### C. Let the dispatcher repair the span instead of choosing between two wrong values
A damaged verbatim row gets an inline editable field pre-filled with the captured text, with the artifact highlighted. The dispatcher types what the page shows (`53' 102"`) and applies that. The edit is recorded in the change reason as a manual verbatim correction, so a hand-repaired capture is never mistaken for a machine transcription.

### D. Ask the model not to copy corruption
Add to the verbatim rule in the parser prompt: never reproduce pilcrows, control characters or repeated `&amp;` chains; if a span renders as one of those, read the printed glyphs and transcribe what is printed. Bump `PARSER_BUILD.contract` notes (shape unchanged, so `contract` stays 3; `built_at` and `notes` move).

### E. Make the next occurrence diagnosable
The function logs a one-line damage fingerprint per verbatim capture — count and kinds of artifacts, no document content — so a repeat is visible in logs without re-running the parse.

## Tests
- The pinned regression, asserted directly: the pilcrow capture scores similarity 1.0 and must **not** read `verified` — it reads `transcription_damaged`, and the artifact list names the `¶`.
- The faithful capture still reads `verified` at 0.9929 with the same region damage.
- Entity-chain corruption (`OS&amp;amp;D` copied into the transcription) is caught the same way.
- A clean capture on a clean document produces `transcriptionDamage: null` — no false positive from ordinary punctuation.
- Diff default: a damaged verbatim row defaults to reject; the same row after inline repair defaults to accept and carries the manual-correction marker.

## Scope note
This changes verdict ranking, so fields previously reading `verified` while carrying artifacts will start reading `transcription_damaged`. That is the intent: they were never verified. Nothing is auto-modified — the comparator still only judges, and the only path that alters a captured value is the dispatcher's own edit.

Reimbursement pay class stays held. Nothing is applied or filed on ST26034 until you say so.
