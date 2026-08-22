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

`PU# IX00286060` in Stop 1's Comments and `Pickup Number IX00286060` in the References table both resolve to `pickup`. An unmapped label becomes `unclassified` — never its own class from the raw string — keeps its printed label, falls back to value-only dedup, and every occurrence is logged with label and value.

All three dedup passes re-key on **class + value**, and are now scope-aware:

- load-level pass: a stop reference collapses into a load-level reference only when class *and* value match, so Stop 1's `PU# IX00286060` and the table's `Pickup Number IX00286060` end as **one row at load scope with the citation from Stop 1 recorded** (below), while PRO no longer dies against BOL;
- cross-stop pass: a repeat under a mapped class is kept on every stop (a shipment number at both ends is what the guard asks for); only `unclassified` repeats are dropped, and logged;
- the `refCore` near-duplicate collapse — the pass that actually killed the PRO row — collapses only within one class, and only within one scope.

### 4. Reference storage, citations and diffing

The References block on page 2 is load-level — it belongs to no stop — while stop Comments carry stop-level references. Both scopes are real, so one table carries both: `load_references` with `id`, `load_id` FK (not null), `load_stop_id` FK (**nullable — null means load-level**), `reference_class`, `printed_label`, `value`, standard audit columns. Indexes on `value`, on `(load_id, reference_class)` and on `(load_stop_id, reference_class)`. One table rather than two so an AP lookup by value hits a single index regardless of scope. No JSON column. GRANTs and RLS mirror `load_stops`, scoped through `load_id`.

**Categorical labels never become references.** A reference row is an identifier — something AP or a tracing desk looks a shipment up by. `Mode: TL` is an attribute of the load; storing it as a reference puts a value shared by thousands of loads into an index built for lookup by value, and makes every truckload match every other truckload the moment reference-based duplicate detection exists.

Categorical labels stay in the class map so the parser recognises and consumes them, and are routed out of `load_references` at dedup time into a separate `attributes` bag. Answering the routing question directly: **`mode` goes to a field on the load**, not a log line — a new `mode` text column on `loads`, set from the parsed value (`TL` here). It is real load data and discarding it means re-reading the PDF to recover it. Every other categorical label — service level, equipment/trailer type as printed in a reference table, temperature requirement — is routed the same way: to its existing load column when one exists, and otherwise dropped with a logged entry naming the label and value, since inventing a column per broker label is worse than the log. The categorical set is data in the class map, not branches in code, so adding one is a one-line change.

**Duplicate detection excludes non-identifying classes by construction.** Broker-reference duplicate detection today reads `loads.broker_reference_number` only and never touches references, so nothing regresses in this pass. The dedup layer nonetheless exposes the identifying-only set, and reference-based duplicate detection — when it is built — draws its candidate values from that set, so a categorical value can never reach it.


**Citations.** When a stop's printed reference collapses into a load-level row, the association is recorded rather than discarded — printing `PU# IX00286060` in Stop 1's comments is how the broker distinguishes it from the other pickup number (`562117`) on the same load, and on a multi-pick load that is not recoverable by inference. This uses a small join table, `load_reference_citations` (`load_reference_id`, `load_stop_id`, `printed_label`, unique on the pair), not a nullable `referenced_by_stop_id` column. Reason: the same value legitimately appears in more than one stop's comment block — a shipment number cited at both ends is the exact case the cross-stop guard is being loosened for — and a single nullable column silently keeps only the first citation, reintroducing the class of bug this pass exists to remove. The join also carries the label as that stop printed it (`PU#` versus `Pickup Number`), which a column on the reference row cannot hold per stop. The access pattern is a small read alongside the stop, and stop-scoped lookup is indexed on `load_stop_id`.

**Fallback.** `pickReference` still chooses the primary gate reference a stop form displays. For a stop with no reference of its own it falls back to a load-level reference of the right class, and **prefers one this stop cited** over one it did not. A stop that cited nothing still falls back to any load-level reference of the right class, as designed.

References diff as a **scope-aware set**: each row is keyed on `(scope, class, value)`, and every added, removed or changed row surfaces as its own non-financial change carrying its scope, printed label and value. A reference that moves between load-level and stop-level reports as a single **scope change**, not a removal plus an addition. Citations diff too: a reference that stops being cited by a stop, while remaining at load scope, surfaces as a **citation change** naming the stop — never silence.

On the Blue Grace pair this surfaces exactly one change — `PRO BG969676425` added at load scope — with no phantom pickup number, no duplicate of the pickup reference that exists at both scopes, and Stop 1's citation of `IX00286060` preserved and unchanged.



### 5. Retention

- Original rate confirmation: already retained on load save, so a later backfill of verbatim text is possible. Not built now. Pre-change loads show "stored before verbatim capture — compare manually" on those fields instead of claiming the broker changed something.
- Revised document: currently uploaded only inside the apply path, so cancelling discards it. Fixed — it uploads on selection once the document-identity check passes, and a cancelled review leaves it attached with a note that it was reviewed and not applied.

### 6. Reimbursement pay class — specified, not built

Current treatment under "SUPERTRANSPORT Standard": linehaul 72, fuel surcharge 72, detention 100, layover 100, stop-off 72, TONU 72, lumper 100 (`lumper_reimbursement_pct`), **other 72** — and `other` is the default. Design on hold: every charge type carries a pay class, `revenue` (split at policy percentage) or `reimbursement` (passes through whole, excluded from the split), with lumper's 100% coming from the class rather than a bespoke column. Nothing in this section ships in this pass.

---

## Tests

- Golden text: verbatim fields equal the PDF-extracted fixture exactly, asterisks intact.
- Stability: re-parsing the unmodified fixture produces zero diff rows.
- Token check: faithful transcription passes; the same transcription with `(800) 697-4477` removed **fails the token check while passing similarity at 0.987**; removing the email too fails and names both; a layer token lost to degradation (`53' 102"`) never demands digits the transcription must supply.
- Comparator: faithful transcription passes; a paraphrase fails; a reordered transcription fails; a case-only alteration fails; the pilcrow and entity-chain fields report `text_layer_unreliable`, not `verbatim_unverified`; a short field with one damaged glyph reports `text_layer_unreliable` rather than passing on 0.929 similarity; an image upload reports `no_text_layer`. Evaluation order degrade → token → similarity is asserted.
- Classes: `PU#` and `Pickup Number` resolve alike; `PRO` and `BOL` sharing a value both survive all three passes; an unmapped label lands in `unclassified` and is logged; `Mode: TL` never produces a reference row, lands on the load's `mode` field, and is absent from the identifying-value set duplicate detection draws from.
- References: the stop-level `PU# IX00286060` collapses into the load-level pickup row, stored once at load scope **with a Stop 1 citation recorded**; the added `PRO` surfaces as one load-scope addition; a reference moved between scopes reports as one scope change, not a remove plus an add; a dropped citation on a still-present load-level reference surfaces as a citation change; `pickReference` prefers a cited load-level reference over an uncited one of the same class, and still falls back for a stop that cited nothing.
- Defaults: free-text unchecked, structured checked.
- Retention: cancelling the review leaves the revised document attached.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts` — verbatim fields in contract and prompt; `text_layer` verification (entity/whitespace normalization, case-sensitive, degradation scoring, token-presence, 0.90 similarity, in that order); class- and scope-keyed dedup across all three passes; `unclassified` logging.
- `src/lib/pdfToText.ts` (new) — text-layer extraction via the existing `pdfjs-dist`; null for image/scan input.
- `src/lib/verbatimVerify.ts` (new) — normalization, degradation scoring, token extraction and presence check, similarity; shared by the function and the tests.
- `src/lib/rateConfirmation.ts` — extended types, reference class, scope and citations, `condenseInstructions`; citation-preferring `pickReference`.
- `src/lib/revisedRateCon.ts` — `freeText` flag driving `defaultAccept`; scope- and citation-aware reference-set diffing.
- `src/components/dispatch/loadDetail/RevisedRateConModal.tsx` — upload the revised document on selection.
- Migration: verbatim text columns on `loads` and `load_stops`; `load_references` table (`load_id` not null, `load_stop_id` nullable) and `load_reference_citations` join table, with GRANTs, RLS and indexes.

