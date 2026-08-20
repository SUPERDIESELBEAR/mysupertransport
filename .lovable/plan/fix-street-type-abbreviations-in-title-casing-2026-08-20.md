# Fix street-type abbreviations in title casing

## Problem
`toTitleCase` preserves any all-caps token of three characters or fewer so real acronyms (US, JFK, NE) survive. Street type abbreviations get caught by that rule, so `2103 S MAIN ST` becomes `2103 S Main ST` and `2820 DANIELDALE RD` becomes `2820 Danieldale RD`.

## Fix
Add an explicit street-type list in `src/lib/textNormalize.ts` that is always title-cased, checked before the acronym-preservation rule:

ST, RD, AVE, AV, BLVD, DR, LN, CT, CIR, PL, PKWY, PKY, HWY, TER, TRL, WAY, PIKE, EXPY, FWY, SQ, PLZ, ALY, BND, CRK, XING, LOOP, RUN, PATH, RTE, TPKE, MTWY.

Details:
- Matching ignores trailing punctuation, so `ST.` and `RD.` are handled and the period is preserved (`St.`).
- Position-independent, so mid-address types work: `1400 INDUSTRIAL DR SUITE 200` becomes `1400 Industrial Dr Suite 200`.
- Directionals stay uppercase exactly as today (N, S, E, W, NE, NW, SE, SW). Directional check runs first, so no overlap.
- Nothing else changes: whitespace collapse, hyphen handling, lowercase joiner words, ZIP/phone helpers, and `normalizeImportedName` are untouched.

## Tests
Extend `src/lib/__tests__/textNormalize.test.ts` with a street-type block that sits next to the existing acronym cases so the two rules pin each other:
- `2103 S MAIN ST` to `2103 S Main St`
- `2820 DANIELDALE RD` to `2820 Danieldale Rd`
- `1400 INDUSTRIAL DR SUITE 200` to `1400 Industrial Dr Suite 200`
- `500 W 7TH ST.` keeps the period as `St.`
- existing acronym cases still hold: `JFK terminal`, `1400 industrial dr ne` ending in `NE`, and a `US` token staying uppercase.

## Note
`CT` and `PL` are also state/other abbreviations in other contexts, but `toTitleCase` is not used to format state fields (state values are uppercased separately in the parse path), so treating them as street types here is safe.
