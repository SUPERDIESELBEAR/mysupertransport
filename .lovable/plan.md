# Revised rate confirmation — verbatim capture, accept defaults, reference diffing

Approved scope: verbatim capture, free-text accept defaults, reference class map + reference diffing, and revised-document retention. The reimbursement pay class stays **specified but unbuilt**.

The text-layer measurement you asked for was run first, on both Blue Grace PDFs. Results below; they changed the comparator design.

---

## Text-layer results (both Blue Grace documents)

Both PDFs pulled from the load's documents and text-extracted. The layer is degraded exactly where you said, and in one more place:

- `53' 102"` extracts as a single pilcrow `¶` in **both** documents. The model reads it correctly, so a faithful transcription will never match the layer at that spot.
- `OS&D` inside Special Instructions extracts as `OS&amp;amp;amp;amp;amp;amp;amp;amp;D` — an eight-deep escape chain. The *same* `OS&D` in the BGLF terms paragraph one block above extracts clean. Same document, same word, two different fidelities.
- The two documents do not agree on the same printed sentence: original has `REQUIRED ¶  SWING`, revised has `REQUIRED ¶SWING`. Whitespace-collapsing still leaves them one space apart, because the difference sits against the unmappable glyph.
- `**CAN GET NEED TIH.**` — the double asterisks **are** in the text layer. Your correction is right and the fixture will carry them.

Measured against a faithful transcription of the original (glyphs read correctly, everything else as printed):

| Comparator | Result |
| --- | --- |
| Exact containment in the raw layer | **fails** — false negative |
| Containment after whitespace + entity normalization | **fails** — the pilcrow alone still breaks containment |
| Similarity, whitespace only | 0.969 |
| Similarity, whitespace + entity chains | **0.993** |
| Same, with casing collapsed | 0.993 — **no gain**, so casing stays significant |
| A condensed paraphrase vs the layer | **0.041** |

So: any containment-based check produces a false negative on this document, 100% of the time, on both files. Similarity at 0.90 accepts the faithful transcription and rejects a paraphrase by a wide margin. But it does not catch the failure this work exists to prevent — measured below — so it is now one of two checks, not the check.

## Token-presence check — measured (correction 1)

You are right, and the numbers are worse than the estimate. Against the ~640-character Special Instructions block of the original:

| Transcription | Similarity | Token check |
| --- | --- | --- |
| Faithful | 0.995 pass | **pass** — no missing tokens |
| Phone `(800) 697-4477` deleted | **0.987 pass** | **fail** — reports `(800) 697-4477` |
| Phone and `CALAVO@BLUEGRACEGROUP.COM` deleted | **0.972 pass** | **fail** — reports both |
| Condensed paraphrase | 0.081 fail | fail — reports both plus `2025` |

The exact bug that started this — both contact methods dropped — scores 0.972 and sails through any similarity threshold that a faithful transcription can also survive. Similarity cannot see omission; it is a length-weighted measure and these tokens are 2.8% of the block.

The two checks are complementary rather than redundant, which the other measurements confirm: a sentence-reordered transcription with every token present scores 0.118 and is caught by similarity alone, and a case-collapsed transcription scores 0.071 — so case sensitivity earns its keep and correction 3 costs nothing.

**Design.** From the normalized text layer, extract every email address, every phone number, and every digit run of four or more characters. Assert each appears in the transcription. **Layer → transcription only, never the reverse** — degradation removes content and never adds it, so a layer that lost `53' 102"` to a pilcrow no longer contains those digits and cannot demand them. A field fails if *either* check fails. The report names the missing tokens, not a boolean.

Phone and digit comparison runs on digits-only forms so `(800) 697-4477` matches `800-697-4477`. Digit runs match as substrings of the transcription's digit stream, which is what keeps a truncated layer token safe: the short-field case below extracts `0028606` from a damaged layer, and that is a substring of the correct `00286060`, so it passes rather than firing falsely.

**Short fields.** Stop 1's `PU# IX00286060` is fourteen characters; a single damaged glyph scores 0.929 — above threshold, so similarity alone would call it verified. Degradation scoring runs first and sees an unmappable glyph where the model reports printable text, so the field reports `text_layer_unreliable`, not `verified` and not `verbatim_unverified`. Order of evaluation is therefore load-bearing and is asserted in the tests: degrade → token → similarity.

## Comparator design (corrections 2 and 3, prior pass)

- Normalize **both sides**: collapse whitespace and soft hyphens; unescape HTML entities repeatedly until the string stops changing, so `&amp;amp;…&D` resolves to `&D`.
- **Keep casing significant** — measured cost is zero, and it catches a rule violation nothing else would.
- Similarity at 0.90, **plus** the token-presence check. Either failure fails the field.
- **Degradation detection, evaluated first and reported separately.** Score the layer itself: unmappable glyph substitutions (`¶`, `□`, replacement chars) where the model reports printable text, entity chains, and characters missing against the model's output. A degraded layer yields `text_layer_unreliable` — stored, and labelled "the document's text layer is unreadable here; transcription not machine-checked." `verbatim_unverified` means the comparator ran cleanly and the transcription still failed — "the model may have gotten this wrong." One label is about the document, the other about the model.
- No case blocks the save; free-text already defaults unchecked.

Extraction happens client-side with the existing `pdfjs-dist` and is sent as `text_layer` alongside the file. Image uploads and text-free scans report `no_text_layer` — not verifiable, stated as such.


## Fixture

The fixture is **extracted from the PDF, never retyped**. A checked-in script pulls the printed text from `Blue_Grace_Rate_Con.pdf` into `src/lib/__tests__/fixtures/bluegrace-BG969676425.txt`, and the extracted file is read back and asserted to contain `**CAN GET NEED TIH.**` with the asterisks intact before it is used as an expectation. Where the layer is degraded (`¶`, the entity chain) the fixture records both the raw extraction and the corrected printed string, with a comment naming the degradation — the corrected form is what the verbatim assertion uses, and it is the only hand-touched text in the file.

Both hand-corrected spots — exactly two, the pilcrow standing in for `53' 102"` and the `OS&D` entity chain — are read off the **rendered page image**, not the extraction, before check-in, and the check-in note records that they were verified visually.


Two tests:

- **Fidelity** — `special_instructions_verbatim`, `broker_terms_verbatim` and each stop's `notes_verbatim` equal the fixture strings exactly, including `(800) 697-4477`, `CALAVO@BLUEGRACEGROUP.COM` and the asterisks. Run against the normalizer with canned parser output for CI determinism.
- **Stability** — re-parsing the unmodified fixture through `buildRevisionDiff` yields zero changes.

Your note is taken: no test exercises the live model, so the runtime text-layer check is the only thing between a drifting summarizer and the database. That is why the comparator is tuned for a low false-negative rate rather than strictness.

---

## What gets built

### 1. Verbatim capture

Extraction contract gains, alongside the existing condensed field:

- `special_instructions_verbatim` — the printed Special Instructions block only.
- `broker_terms_verbatim` — the BGLF terms paragraph, separate, never concatenated.
- per stop `notes_verbatim` — the stop's Comments field as printed.

Prompt rule: transcribe exactly as printed — same wording, order, line breaks, casing, punctuation. Never summarize, reorder, or drop a phone number, email address or sentence. Absent block returns null. Each field carries its verification result (`verified`, `verbatim_unverified`, `text_layer_unreliable`, `no_text_layer`).

Stored values are the verbatim strings. The condensed one-line-per-term view survives only as a render-time `condenseInstructions` derivation.

### 2. Accept defaults

Non-financial diff rows carry a `freeText` flag. Free-text rows — special instructions, broker terms, stop notes, descriptions, and anything not `verified` — default **unchecked**. Structured rows — dates, times, numbers, addresses, city/state/ZIP, contact, equipment, commodity, references — keep default-accept, still forced unchecked when the stop has driver check-in data.

### 3. Reference class map and dedup

Classes, matched after lowercasing and stripping `#`, `no.`, `number`, punctuation and whitespace:

| Class | Labels |
| --- | --- |
| `bol` | bol, bl, b/l, bill of lading |
| `pro` | pro, pro number |
| `pickup` | pu, pickup, pick up, pickup ref, shipment pickup |
| `delivery` | del, dl, delivery, drop number |
| `po` | po, purchase order |
| `order` | order, load, load id, shipment, so, si, lo, ref, reference |
| `seal` | seal |
| `appointment` | appt, appointment, confirmation, conf |
| `mode` | mode |

`PU# IX00286060` in Stop 1's Comments and `Pickup Number IX00286060` in the References table both resolve to `pickup` and collapse to one row. An unmapped label becomes `unclassified` — never its own class from the raw string — keeps its printed label, falls back to value-only dedup, and every occurrence is logged with label and value.

All three dedup passes re-key on **class + value**:

- load-level pass: a stop reference is dropped only when it matches a load id *of the same class*, so PRO no longer dies against BOL;
- cross-stop pass: a repeat under a mapped class is kept on every stop (a shipment number at both ends is what the guard asks for); only `unclassified` repeats are dropped, and logged;
- the `refCore` near-duplicate collapse — the pass that actually killed the PRO row — collapses only within one class.

### 4. Reference diffing and storage

References move to a proper table, `load_stop_references`: `id`, `load_stop_id` FK, `reference_class`, `printed_label`, `value`, standard audit columns, indexed on `value` and on `(load_stop_id, reference_class)`. No JSON column — AP asks for a PRO number by value, and duplicate detection already keys on broker reference, so both need an indexed lookup. GRANTs and RLS mirror `load_stops`.

References diff as a set per stop: added, removed and changed rows each surface as their own non-financial change with printed label and value. `pickReference` still chooses the primary gate reference the stop form displays. On the Blue Grace pair this surfaces exactly one new reference — `PRO BG969676425` — and no phantom pickup number.

### 5. Retention

- Original rate confirmation: already retained on load save, so a later backfill of verbatim text is possible. Not built now. Pre-change loads show "stored before verbatim capture — compare manually" on those fields instead of claiming the broker changed something.
- Revised document: currently uploaded only inside the apply path, so cancelling discards it. Fixed — it uploads on selection once the document-identity check passes, and a cancelled review leaves it attached with a note that it was reviewed and not applied.

### 6. Reimbursement pay class — specified, not built

Current treatment under "SUPERTRANSPORT Standard": linehaul 72, fuel surcharge 72, detention 100, layover 100, stop-off 72, TONU 72, lumper 100 (`lumper_reimbursement_pct`), **other 72** — and `other` is the default. Design on hold: every charge type carries a pay class, `revenue` (split at policy percentage) or `reimbursement` (passes through whole, excluded from the split), with lumper's 100% coming from the class rather than a bespoke column. Nothing in this section ships in this pass.

---

## Tests

- Golden text: verbatim fields equal the PDF-extracted fixture exactly, asterisks intact.
- Stability: re-parsing the unmodified fixture produces zero diff rows.
- Comparator: faithful transcription against the degraded Blue Grace layer passes; a paraphrase fails; a case-only alteration fails; the pilcrow and entity-chain lines report `text_layer_unreliable`, not `verbatim_unverified`; an image upload reports `no_text_layer`.
- Classes: `PU#` and `Pickup Number` resolve alike; `PRO` and `BOL` sharing a value both survive all three passes; an unmapped label lands in `unclassified` and is logged.
- Reference diff: the added PRO row appears as a change; a removed reference appears as a removal.
- Defaults: free-text unchecked, structured checked.
- Retention: cancelling the review leaves the revised document attached.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts` — verbatim fields in contract and prompt; `text_layer` comparator with entity/whitespace normalization, case-sensitive, 0.90 similarity, degradation scoring; class-keyed dedup across all three passes; `unclassified` logging.
- `src/lib/pdfToText.ts` (new) — text-layer extraction via the existing `pdfjs-dist`; null for image/scan input.
- `src/lib/verbatimVerify.ts` (new) — normalization, similarity, degradation scoring, shared by the function and the tests.
- `src/lib/rateConfirmation.ts` — extended types, reference class, `condenseInstructions`.
- `src/lib/revisedRateCon.ts` — `freeText` flag driving `defaultAccept`; reference-set diffing.
- `src/components/dispatch/loadDetail/RevisedRateConModal.tsx` — upload the revised document on selection.
- Migration: verbatim text columns on `loads` and `load_stops`; `load_stop_references` table with GRANTs, RLS and indexes.
