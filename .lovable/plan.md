# Verbatim origin visibility + a commodity signal that reads the parse

## 1. I cannot report MegaCorp / Nationwide origins from here

The origin values you want (`valueOrigin`, `originReason`, `layerLengthRatio`, `truncationSignals`) are produced in the browser from the PDF's own text layer, against the specific file you uploaded. I do not have the MegaCorp or Nationwide PDFs in the project, and the only fixture on disk is Blue Grace. Any table I wrote for those two documents would be a prediction dressed as a measurement — the exact failure mode from the earlier report you called out.

So the fix is to put the answer on the screen you already have, with no save required:

- Add an **Verbatim source** section inside the existing collapsed fingerprint block on the parse screen (`RateConfirmationParser.tsx`), listing one row per verbatim field: field name, `Stored from the page` / `Stored from the model`, `originReason`, `layerLengthRatio` (as a percentage, when a region resolved), and the truncation signals that fired.
- Same rows in the revision review (`RevisedRateConModal.tsx`), so the origin is legible on both paths.
- For the two cases you named specifically, each row gets an expandable **stored text** preview (first and last ~200 chars, plus a match-highlighted window around any `$` amount and any email address found in the stored value). That is what lets you confirm `Support@triumphpay.freshdesk.com` and `$1,600.00` are in Nationwide's stored special instructions, and read the MegaCorp terms tail to see whether it fell back and what the fallback holds.

Nothing is written to the database by this; it renders the values the current parse already computed.

## 2. `no_commodity` reads the parse instead of re-scanning the page

Today the document side of that signal is a single regex: a `commodity` label followed on the same line by any non-space character. That is why it is wrong in both directions:

- **MegaCorp** prints Commodity as a table column with the value on a following line, so the label matches but nothing follows it on that line — the scan concludes "no commodity" and fires the signal *from the document*, on a document where the model extracted `Plastics` correctly.
- **Rolling River** prints `Commodity: paper rolls` inline, so the scan sees a commodity and contradicts the model — which is the correct outcome there, but by luck of layout, not by evidence.

Change: the document side of `no_commodity` becomes a read of the parse's own extraction rather than an independent scan.

- If `load.commodity` holds a real value (non-empty, not a placeholder like `TBD`/`N/A`), the document side is `false` — a commodity is listed. The model's `no_commodity` then reads as contradicted and does not score, which is the behaviour you already ratified.
- If `load.commodity` is empty or discarded by the confidence gate, fall back to a widened text scan that accepts the value on the next line after the label, not just the same line.
- If there is no text layer and no extracted commodity, the document side stays `null` — unknown never silences the model.

The signal's reason text gains the provenance so the row reads honestly: "No commodity is listed (document — from the extracted commodity field)".

## Technical notes

- `src/lib/rateConfirmation.ts`: `assessLoadout` gains access to `p.load.commodity`; `DOC_COMMODITY` widened to allow a line break between label and value; the `no_commodity` def's `document` becomes a three-state helper (`extracted` → `scan` → `null`).
- `src/lib/verbatimCheck.ts` / `verbatimAdopt.ts`: unchanged. The origin fields are already on every `VerbatimCheck`; this only renders them.
- New UI: a small `VerbatimSourceRows` component shared by the parse screen and the revision modal, kept inside the fingerprint disclosure so the parse screen stays a form that filled itself.
- Tests: extend `loadoutAssessment.test.ts` with the MegaCorp layout (label with the value on the next line, `load.commodity = 'Plastics'`) asserting the signal does not fire from the document, and keep the existing Rolling River 3-of-10 assertion passing.
