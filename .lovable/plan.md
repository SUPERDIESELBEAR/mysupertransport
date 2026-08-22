# Verbatim verification: fix window drift, always report all three signals

## Findings first (measured this turn, both Blue Grace PDFs)

**1. Damage varies because the window is chosen by the transcription — confirmed defect.**
`bestWindow()` slides a window the *length of the transcription* across the whole layer and keeps the highest-similarity slice. `localDamage()` then scores whatever that slice happened to be. Measured on `orig.pdf`:

| Transcription | Window selected (start of it) | Local damage | Sim | Verdict | Missing tokens |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Faithful special instructions | `...ructions REQUIRED SWING DOOR REEFER TRAILER...` (the real block) | 5.57% | 0.9860 | layer_unreliable | none |
| Condensed paraphrase | `...signed receipt. OS&D must be reported prior to leaving the consignee. PLEASE NOTE:...` (the BGLF terms area, ~1 page away) | 0.98% | 0.5531 | unverified | `TLInvoices@bluegracegroup.com` |

The paraphrase is 4 lines against the block's 7, so its best-scoring slice lands on unrelated text. Its 0.98% is just the document average (`normLayer.degradation`), not the block's damage. So yes: the paraphrase's `unverified` verdict is accidental, earned against text it does not correspond to.

**3. One missing token instead of three — same root cause.** The token named is `TLInvoices@bluegracegroup.com`, an address that lives in the *terms* region the drifted window landed on. The phone `(800) 697-4477` and `CALAVO@BLUEGRACEGROUP.COM` — the two the paraphrase actually dropped — are no longer demanded, because they are not in the window that was scored. Extraction did not narrow; the window moved. This is the check weakening on exactly the case it was built for, and it is fixed by the same change as item 1.

**4. Browser renderer vs pdftotext — no re-tuning needed.** Ran the PDFs through `pdfjs-dist` (the library `pdfTextLayer.ts` uses) rather than `pdftotext`:

| Source | Special-instructions local damage | Sim | Verdict |
| :-- | :-- | :-- | :-- |
| pdftotext layer (tests) | 5.57% | 0.9860 | layer_unreliable |
| pdfjs original | 5.69% | 0.9860 | layer_unreliable |
| pdfjs revised | 6.01% | 0.9860 | layer_unreliable |

Same glyph pathology both ways: `53' 102"` renders as control chars + `¶`, `OS&D` as the `&amp;amp;...` chain. The 2% limit stands. Caveat to close in the build: this was pdfjs in Node, not the worker in a real browser tab — the UI end-to-end run is a build step below.

## What gets built

### A. Document-determined field regions (new `src/lib/verbatimRegions.ts`)
- `resolveFieldRegion(layer, field, { stopNumber })` locates the field's region from the *document*: match a printed anchor line, take the body from that line (or the lines below it) until a blank line after content, a known terminator heading (`References`, `Freight Terms`, `Items`, `Stop N`, `Page n / m`, `Equipment & Services`), or a 40-line cap.
- Damage is measured on that region, so it is one figure per field per document. Similarity is the best window *inside the region only*. Signal tokens are demanded from the whole region.
- **Stop slices are cut from the document, not counted.** `stopSlices(layer)` maps each printed `Stop N` heading to the line range it owns (heading through the line before the next stop heading). `stop_notes_verbatim` searches only inside the slice for its printed stop number, so a load-level `Comments:` cannot shift stop numbering — it is outside every slice. A stop number with no printed heading fails as `stop_not_found` rather than falling through to a neighbour, and a repeated stop number keeps its first slice instead of silently overwriting.
- **Anchor counts per field (as built):** special instructions 7 (`Special Instructions`, `Driver Instructions`, `Carrier Instructions`, `Load Instructions`, `Shipment Instructions`, `Notes to Carrier`, `Dispatch Notes`); broker terms 3 (the `<Name> Logistics (XXX) will …` paragraph opener, `Terms and Conditions`, `Broker-Carrier Agreement`/`Terms`); stop notes 2 (`Comments:` and `Stop Notes:`/`Stop Instructions:`, both colon-required so a bare `Comments` heading is not a note). Only the Blue Grace ones are sighted; the rest are common synonyms.
- **Heading appearing twice:** for a load-level field, occurrences that carry a body are counted within the searched range. Exactly one → used. More than one → `anchor_ambiguous`: no region, no numbers, logged. Stop fields are disambiguated by their slice, not by an occurrence index.

### A2. An unresolved region is its own verdict, not a tag
- No whole-layer fallback. Failure to resolve produces `verdict: 'region_unresolved'` with `similarity`, `missingTokens`, `similarityPass`, `tokenPass` and `layerDegradation` all `null` — nothing computed against an unanchored window is reported, because an approximate figure that looks precise is worse than none.
- Review screen wording: "Could not locate this text on the document" — the field is not verified.
- Every miss is logged via `recordAnchorMiss(field, failure)` with the field name, the failure reason, the occurrence count and the document's heading-shaped lines (`documentHeadings()`), mirroring how unclassified reference labels are logged. `anchorMisses()` exposes the list so the anchor set can grow from real documents.

### B. Report all three signals, not the first (`verbatimVerify.ts` + callers)
- Always compute similarity, token presence, and damage when a region resolves. `VerbatimVerification` gains `similarityPass`, `tokenPass`, `regionSource` (`'anchor' | 'none'`) and the resolved anchor id.
- Headline: `verified` when similarity and tokens both pass; otherwise `layer_unreliable` when region damage exceeds the 2% limit; otherwise `unverified`. Dispatcher-facing labels unchanged.
- A layer-unreliable field that is also missing tokens present in the damaged layer reads distinctly from a merely unreadable one.

### C. Tests and baselines
- Fixed-region regression: faithful and paraphrase transcriptions of the same field report the *same* damage figure.
- Paraphrase: assert `layer_unreliable` headline, `tokenPass: false`, `(800) 697-4477` and `CALAVO@BLUEGRACEGROUP.COM` both named missing. Its similarity against the correctly-resolved region is reported as a number in the write-up whether it passes, fails, or embarrasses the design — that figure is the first honest measurement of whether similarity does any work here, and it is stated either way rather than only asserted.
- Anchor resolution per field; duplicate-heading ambiguity; stop-slice selection (including a load-level `Comments:` that must not shift stop numbering); `region_unresolved` on an unanchored document, with the miss log asserted to contain the field and the document's headings.
- The broker-terms fixture is extended to the full printed paragraph (it currently holds only its last two lines), since the field is the whole block.
- Update `src/test/helpers/gate.ts` and `src/test/README.md` counts, and the measurement table in `docs/tms-build-status.md`.


### D. End-to-end browser run
Drive one revised rate confirmation through the real Create Load UI, capture the damage ratio the browser worker produces for the special-instructions block, and compare against 5.57% / 5.69%. If the browser worker differs materially, report it and re-tune the 2% limit against the production renderer rather than the test one.

Reimbursement pay class stays held.
