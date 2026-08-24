# Answer first: there is no ratio ceiling

Confirmed from `src/lib/verbatimAdopt.ts`. The only ratio constant is `MIN_RATIO = 0.9`, and it is used in one direction only:

```text
if (l.length / m.length < MIN_RATIO) -> shorter_than_model
```

A region longer than the model's transcription can never trip that check, at 167% or at 335%. Nothing anywhere in the adoption path caps the ratio from above; `layerLengthRatio` is recorded for the record and never compared to a maximum.

So the two documents separated exactly the way you described:

- Nationwide special instructions, 167% — no signal fired. `shorter_than_model` cannot fire above 0.9, the model's last 30 characters were found inside the region, and the region's last line does not end on a comma or a dangling function word. Reason `layer_clean`, page adopted. This is the intended shape for a model that dropped ~40% of a block.
- MegaCorp broker terms, 335% — refused because `model_continues_past_region` and `ends_mid_sentence` both fired, not because of the ratio. The model read text the region's boundary excluded, and the region's last line breaks mid-sentence, so the region's own edges are not trustworthy as the stored value's edges.

`MIN_RATIO = 0.9` guards only the original truncation case (a region cut a line or two short), and 0.9 was picked as a whitespace-reflow tolerance — the "merely reflows whitespace" test in `verbatimAdopt.test.ts` pins that it must not fire on padding alone.

# Change to make: rename the verdict

`region_truncated` is wrong for MegaCorp's case. Rename to `region_boundary_uncertain`, which is what the three signals actually establish.

- `src/lib/verbatimAdopt.ts` — rename the value in the `VerbatimOriginReason` union, its doc comment, and the return in `adoptVerbatim`.
- `src/components/dispatch/loadForm/VerbatimSourceRows.tsx` — rename the label key; reword to "the region resolved, but its boundaries do not look like the whole printed block".
- `src/components/dispatch/loadDetail/VerbatimVerificationCard.tsx` — rename the reason key; keep the same sentence, adjusted to boundary wording. Accept the old string as an alias so already-stored records still render a sentence instead of a raw token.
- `src/lib/__tests__/verbatimAdopt.test.ts` — update the expectation.
- `docs/tms-build-status.md` — update the standing rule's wording and note that no upper ratio bound exists, so a model that drops 40% of a block still adopts the page.

The `TruncationSignal` names themselves stay: each one still describes its own condition accurately. Only the aggregate verdict is renamed.

No behaviour changes — same fields adopt, same fields fall back.
