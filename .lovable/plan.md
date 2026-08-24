# Ground the Blue Grace end-to-end fixture in the real document, and correct the coverage claim

Two corrections accepted. Both are true.

## 1. The fixture invents the document it is named after

Confirmed against the stored load (ST26035, the real parse of this tender):

| Field | Fixture asserts | The real document |
| :-- | :-- | :-- |
| Commodity | Avocados | MIXED PRODUCTS |
| Linehaul / FSC / total | 3200 / 400 / 3600 | 1224 / 176 / 1400 |
| Stop 1 | CALAVO GROWERS, Santa Paula CA 93060 | Calavo Librado Pina, Laredo TX 78045 |
| Stop 2 | KROGER DISTRIBUTION CENTER, Cincinnati OH 45214 | Calavo Texas, Garland TX 75041 |
| Reefer setpoint | 34F | 38F |
| Weight | 42,000 | 43,500 |
| Stop 2 comment | `Comments: DEL# 001000562117` | `Comments: PO# 001000562117` |

Only the reference numbers, the `¶` / `OS&D` layer artefacts and the two verbatim blocks came from the page. Everything else was invented.

Taking the second option: derive the fixture from the real document rather than renaming the file.

### Where the real values come from
The tender's own parse is stored — load ST26035 with its stops, references and `verbatim_verification` record. That row is the source for the rebuilt fixture, so the fixture is a transcript of a real parse rather than an authored one.

- `blueGraceParseResult.ts` is rebuilt field by field from that stored row: broker, load, reefer, rate and line items, both stops with their real facilities, cities, zips, appointment windows and comment lines, and the reference list in printed order.
- `blueGracePage.ts` is rebuilt to print those same values, keeping the existing real layer blocks (`BG_SPECIAL_INSTRUCTIONS_LAYER`, `BG_BROKER_TERMS_LAYER`) unchanged and in their printed positions, so anchor resolution still runs against the page structure it runs against in production.
- The revised variant keeps its three-change shape (financial change, appointment move, `Pickup Number 562117` removed and `PRO` added), now expressed as deltas on the real numbers: linehaul 1224 to a revised figure, stop 2 a day later.
- A header comment states plainly: these values are the stored parse of the real tender; do not hand-edit them to make a test pass.
- Everything downstream stays real — the assertions in `blueGraceLoadPath.test.tsx` move to the real numbers, nothing about the path changes.

Stop 2's `PO#` label matters: the fixture's invented `DEL#` was exercising a label the document never prints.

## 2. The coverage table overstates one row

The `verbatim_verification` envelope bug is corrected to **no**. The end-to-end test asserts the shape the *writer* stores; that bug was the *reader* assuming a bare array against a correct writer, and no component renders in this test. It could not have caught it.

What does catch it: `verbatimVerificationCard.test.tsx`, which renders the card against the writer's own output. That covers this one card.

The general gap is recorded as a known limit, not as coverage: **no end-to-end test renders a component against stored data.** The e2e test stops at the database row; component correctness against that row is covered only where a reader-boundary test exists for that specific component.

Both corrections go into `docs/tms-build-status.md` alongside the table, so the next reader sees the limit and not a checkmark.

## 3. Record why Blue Grace's special instructions read `verified`

Worth pinning as stated: the layer renders `53' 102"` as `¶`, and the model resolved it back. The damage is in the layer, not in the transcription — so `layerDegradation` is non-zero while `transcriptionDamage` is null, and `verified` at similarity 0.9929 is the correct verdict. Both halves get an assertion and a comment naming the reason, so a later change that starts flagging the transcription fails here.

## Files

- `src/test/fixtures/blueGraceParseResult.ts` — rebuilt from the stored parse
- `src/test/fixtures/blueGracePage.ts` — page text rebuilt around the real values, real layer blocks unchanged
- `src/test/e2e/blueGraceLoadPath.test.tsx` — assertions moved to the real values; verdict assertion documented
- `docs/tms-build-status.md` — corrected coverage row, the rendering-gap limit, the verdict rationale

No production code changes. Nothing is applied or filed on any live load.
