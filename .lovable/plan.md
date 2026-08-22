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

### A. Document-determined field regions (`src/lib/verbatimVerify.ts`)
- Add `resolveFieldRegion(layer, field)`: locate the field's region from the *document*, using per-field printed anchors — special instructions start at the `Special Instructions` heading and end at the next known heading or page break; broker terms anchor on their paragraph opener; stop comments anchor on their `Comments:` line within the stop's slice.
- Verify against that fixed region: similarity is the best window *inside the region only* (bounded slop for heading/label edges), never across the document.
- Damage is computed from the region, so one figure per field per document regardless of transcription.
- When no anchor resolves, fall back to today's whole-layer search but tag `regionSource: 'transcription'` on the result so the number is visibly approximate rather than silently transcription-dependent.

### B. Report all three signals, not the first (`verbatimVerify.ts` + callers)
- Always compute similarity, token presence, and damage. Headline `verdict` stays as specified (`layer_unreliable` wins the label — dispatcher-facing wording unchanged).
- Extend `VerbatimVerification` with `similarityPass`, `tokenPass`, and `regionSource`, and keep `missingTokens` populated even when the headline is `layer_unreliable`.
- Review UI: a layer-unreliable field that is also missing tokens present in the damaged layer reads as "page text is damaged — and a phone number printed on the page is not in the capture", distinct from a merely unreadable one.

### C. Tests and baselines
- Fixed-region regression: faithful and paraphrase transcriptions of the same field must report the *same* damage figure.
- Paraphrase must again report the phone and email as missing, with `layer_unreliable` as headline and `tokenPass: false` as detail.
- Anchor-resolution test for each anchored field, plus the `regionSource: 'transcription'` fallback.
- Update `src/test/helpers/gate.ts` and `src/test/README.md` counts, and the measurement table in `docs/tms-build-status.md` with the corrected figures.

### D. End-to-end browser run
Drive one revised rate confirmation through the real Create Load UI, capture the damage ratio the browser worker produces for the special-instructions block, and compare against 5.57% / 5.69%. If the browser worker differs materially, report it and re-tune the 2% limit against the production renderer rather than the test one.

Reimbursement pay class stays held.
