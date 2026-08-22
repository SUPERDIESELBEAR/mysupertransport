# Refuse stop-level verification when the comment precedes its heading

Decision applied as given: no reading-order normalization. When a stop's
`Comments:` line is emitted before its `Stop N` heading, the slice cannot be
trusted, so the field reports `region_unresolved` with a distinct reason and is
not verified. The verbatim text is still captured and stored — only the
verification is refused.

## 1. Detect the condition instead of producing a bad slice

New failure reason `comment_precedes_heading`, added to `RegionFailure`
alongside `anchor_not_found`, `anchor_ambiguous`, `stop_not_found`,
`empty_region`.

Detection runs before a stop slice is used, on the whole layer rather than on
the slice (a slice cannot see what fell outside it):

- Collect every printed `Stop N` heading line and every `Comments:`-shaped line
  in the layer.
- A stop is untrustworthy when a comment line sits between the previous stop's
  heading and this stop's heading in a position that makes it this stop's
  comment — concretely, when the number of comment lines before the first stop
  heading is non-zero, or when the comment count inside a slice does not match
  the one-comment-per-stop shape the document otherwise shows.
- The Blue Grace/pdf.js case is the first of these: stop 1's `Comments:` line is
  emitted above the `Stop 1 (pickup)` heading, leaving slice 1 holding stop 2's
  comment.

When detected, every stop-level field on that document refuses — not just the
first stop. A layer that misplaces one comment has an ordering the slices cannot
be trusted against at all, and refusing stop 1 while verifying stop 2 against a
shifted slice is the silent-wrong outcome the decision rejects.

`resolveFieldRegion` returns `{ region: null, failure: 'comment_precedes_heading' }`,
and `verifyVerbatim` maps it to `verdict: 'region_unresolved'` with similarity,
tokens, damage and both pass flags null — the existing unresolved path, no new
verdict.

## 2. Log every occurrence with the observed ordering

`recordAnchorMiss` gains an optional `ordering` field recording what was seen:
the line index of each `Stop N` heading and of each `Comments:` line, and the
stop number asked for. Together with the existing `headings` capture, that is
the data for deciding later whether a bounded look-back is safe. Nothing about
that decision is built now.

## 3. Load-level fields are unaffected

Load-level resolution never consults stop slices, so the refusal cannot reach
it. This was measured on Blue Grace under both extractors and will be asserted
in the suite rather than left as an observation:

| Field | pdftotext | pdf.js |
| --- | --- | --- |
| Special Instructions | 5.84% damage, 0.9929, verified | 5.71% damage, 0.9929, verified |
| Broker terms | 0.00% damage, 1.0000, verified | 0.00% damage, 1.0000, verified |

## 4. Terminator set — structures both extractors emit

Blank lines are no longer a boundary by themselves. Current terminators, all of
them printed text that both `pdftotext` and pdf.js produce:

```text
References            Comments            (bare heading)
Freight Terms         Comments:           (labelled line)
Items                 Contact Information:
Charge Details        Special Instructions
Equipment & Services  Bill To:
Stop N                MM/DD/YYYY hh:mmAM …   (appointment window line)
Page N / M
```

Two honest caveats, named now rather than on the next broker:

- **Blank lines are still a secondary boundary.** `bodyBelow` still stops at a
  blank line following content. It is no longer the only boundary, so pdf.js
  (which emits none) is not harmed, but it means `pdftotext` can end a region
  earlier than pdf.js does on a document with no terminator between two blocks.
  This is why the two extractors report 5.84% and 5.71% on the same field.
- **`Stop N` and the appointment-window line depend on ordering**, and ordering
  is exactly what differs between extractors — that is finding 3. For
  load-level fields the exposure is bounded: a misplaced `Stop N` line can only
  end a load-level region early or late, which shows up as a similarity or
  token failure, never as a confident verification against another field's
  text. For stop-level fields it is not bounded, which is why they refuse.

The 40-line region cap remains as the backstop when no terminator appears.

## 5. Tests

Added to `src/lib/__tests__/verbatimAndReferences.test.ts`:

- A layer where stop 1's `Comments:` precedes its `Stop 1` heading resolves to
  `comment_precedes_heading`, not to a region.
- `verifyVerbatim` on that layer returns `region_unresolved` with all signals
  null, and specifically does **not** return a similarity computed against stop
  2's comment.
- Stop 2 on the same layer also refuses, rather than verifying against a shifted
  slice.
- The miss log records `comment_precedes_heading` with the observed heading and
  comment line indices.
- Load-level fields on the same misordered layer still resolve and verify.
- The existing well-ordered stop tests continue to pass unchanged, so the
  refusal is triggered by the condition and not by stop-level fields generally.

## 6. Documentation

`docs/tms-build-status.md` gets the final state:

- Per-field damage table under both extractors (the table in section 3).
- Paraphrase similarity **0.0436** against its resolved region, with the note
  that casing is deliberately not collapsed.
- Finding 2: `layer_unreliable` is rarer than isolated measurement suggested,
  because damage only decides the headline when a check actually fails — a
  faithful transcription of a damaged block verifies.
- Stop-level verification limitation as a known open item, with the reasoning
  for refusing rather than normalizing reading order, and a pointer to the miss
  log as the data that would justify revisiting it.

Reimbursement pay class stays held.
