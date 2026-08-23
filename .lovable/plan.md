# Verbatim: the pilcrow capture, and the check that blessed it

## Findings (measured this turn)

**1. Nothing writes back to a verbatim field after verification. The comparator is clean.**
- `RateConfirmationParser.parse()` applies the parsed values to the form first, then calls `verifyAgainstLayer(file, result)` and only stores the returned verdicts. No `form.setValue` runs on a verbatim path after that.
- `verifyVerbatim()` returns a verdict object and has no writer. The revision path reads the field straight off the parse response; `loadSavePayload.ts` passes it through unchanged.
- So the layer did not win a reconciliation. **The model returned the pilcrow.** Cause (1), not cause (2).

Why it is not random: the PDF is handed to the gateway as a `file` block. For a text-based tender the model's view of the page is that same embedded text layer — the one that renders `53' 102"` as a pilcrow. So the model is transcribing the damaged layer faithfully, which makes this recurrent, not a one-off slip a re-parse reliably fixes.

**2. The verdict this field received: `verified`.** Reproduced against the Blue Grace fixture:

| Capture | similarity | tokens | region damage | verdict |
| :-- | :-- | :-- | :-- | :-- |
| Faithful (`53' 102"`) | 0.9929 | pass | 4.98% | verified |
| This run (`¶`) | **1.0000** | pass | 4.98% | **verified** |

`normalizeForVerbatim` strips `\u00B6` from *both* sides before scoring, so the corrupted capture normalizes to exactly the layer and scores a perfect 1.0 — **higher than the faithful transcription**. The comparator was not merely blind to this corruption; it was rewarding it.

**3. The token check could not see it, by construction.** Signal tokens are extracted from the region after the same normalization, so the layer no longer prints `53' 102"` either — nothing demands it. `tokenPass` is true, correctly per its own contract. Nothing on the review screen would have surfaced it: the row renders as a plain verbatim change with a verified marker.

**4. Raw response for this run is not recoverable.** The function logs only lengths (`special_instructions=648 chars` at 19:44, `678 chars` at 19:46). No content is logged — a gap section E closes.

**5. Blast radius: zero stored loads.** Queried directly — no row in `loads` has a non-empty `special_instructions_verbatim` or `broker_terms_verbatim`, and no row in `load_stops` has a non-empty `stop_notes_verbatim`. The damaged capture exists only in the unapplied ST26034 review session. Nothing needs re-parsing or back-filling.

## What gets built

### A. Damage in the transcription is a defect signal, not something to normalize away
Normalizing damage on the *layer* side is correct and stays. Normalizing it on the *transcription* side is what hid this: the printed page has no pilcrow, so a pilcrow, control character or `&amp;amp;` chain in the model's output can only mean the model copied the broken layer.

- New `detectTranscriptionDamage(raw)` in `verbatimVerify.ts`: returns each artifact with its surrounding context (e.g. `REQUIRED ¶ SWING DOOR`) and a character offset.
- New verdict `transcription_damaged`, ranked above every other outcome — a field whose captured text carries damage markers can never read `verified`, whatever the similarity is. Similarity, tokens and region damage are still computed and reported alongside.
- `VerbatimVerification` gains `transcriptionDamage: TranscriptionArtifact[] | null`.

### B. Surface it where the value is accepted
- Parser review list and the revision diff row show: "Contains text-layer corruption — the document prints something here that the parser could not read", with each artifact in context.
- The diff row for a damaged verbatim field **defaults to reject**, same treatment as a stop with driver data. Accepting stays possible and stays deliberate.

### C. Repair only against the rendered page — never against the captured text alone
The pilcrow is exactly where the information was lost, so the captured text cannot tell the dispatcher what to type. The repair field is therefore gated on showing the page.

- The review dialog renders the source PDF with the existing `pdfFileToImages` (in-memory File, no round trip) and shows the page beside the repair field, zoomed to the damaged span where it can be located.
- Locating the span: `extractPdfTextLayer` starts returning per-page text with character offsets, so the resolved region maps to a page number. The artifact's offset inside the region gives an approximate vertical position, used to scroll/zoom the rendered page. When only the page is known, the whole page is shown, unzoomed.
- **If the page cannot be rendered** (a non-PDF upload, a render failure, an unresolved region with no page): the field is **read-only**. The capture stays flagged, and the dialog says the page could not be displayed so the text cannot be repaired here. No guessing surface.
- A repaired value is stored with `verbatim_source: 'manual_repair'` plus who and when, and the change reason records it, so a hand-typed capture is never mistaken for a machine transcription.

### C2. Declining to repair keeps the flag, permanently
Rejecting or ignoring the row leaves the damaged capture exactly as parsed, verdict `transcription_damaged`, and that verdict is **persisted with the load**, not scoped to the review session:

- New `verbatim_verification jsonb` on `loads` and on `load_stops`, written by the same save path that writes the verbatim values (`loadSavePayload.ts` → `update_load_with_stops`). It holds, per field: verdict, similarity, tokenPass, region damage, anchor id, the **artifact list with its context strings**, and the source (`parsed` / `manual_repair`).
- Load Detail renders a persistent marker on any field whose stored verdict is not `verified` — "captured with text-layer corruption", artifacts listed on expand. Someone opening the load next week sees the same flag the dispatcher saw.
- The stored artifact list is the later diagnostic. It is document content the load already holds, so keeping it alongside the value is no new exposure; the *log* line in section E stays content-free.

### D. Ask the model not to copy corruption
Add to the verbatim rule in the parser prompt: never reproduce pilcrows, control characters or repeated `&amp;` chains; if a span renders as one of those, read the printed glyphs and transcribe what is printed. Shape is unchanged, so `PARSER_BUILD.contract` stays 3; `built_at` and `notes` move.

### E. Make the next occurrence diagnosable from logs
One line per verbatim capture: artifact count and kinds, no document content — a recurrence signal that does not duplicate the stored artifact list.

### F. Write the finding down
`docs/tms-build-status.md` records it plainly, with the table above: the corrupted capture scored 1.0000 against the faithful capture's 0.9929, so the comparator ranked the corruption higher than the truth. Stated as the reason `transcription_damaged` outranks similarity, so the next person does not "simplify" it back.

## Tests
- The pinned regression: the pilcrow capture scores similarity 1.0 and must **not** read `verified` — it reads `transcription_damaged`, and the artifact list names the `¶` in context.
- The faithful capture still reads `verified` at 0.9929 with the same region damage.
- Entity-chain corruption (`OS&amp;amp;D` copied into the transcription) is caught the same way.
- A clean capture on a clean document produces `transcriptionDamage: null` — no false positive from ordinary punctuation.
- Repair gating: with no page image available the repair field renders read-only; with one available it is editable and the applied value carries `manual_repair`.
- Persistence: a declined damaged row saves the damaged value **and** its `transcription_damaged` record, and Load Detail shows the flag on a fresh read.
- Page location: the resolved region for special instructions maps to the page that prints it.

## Scope note
Fields previously reading `verified` while carrying artifacts were never verified, and will now read `transcription_damaged`. Confirmed above: no stored load is affected — the only such capture is the unapplied ST26034 review.

Reimbursement pay class stays held. Nothing is applied or filed on ST26034 until you say so.
