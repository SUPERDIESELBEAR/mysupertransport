# Investigation: duplicate reference numbers after a revised rate con

Conclusion up front: **stale, and already closed once.** Every link in the described
chain is broken in the current code, there are zero duplicate rows live, and zero rows
carry a class the current classifier would not assign.

## 1. Is it live?

No. The stale-issues table in `docs/tms-build-status.md` already carries the row:

```text
| Reference reclassification creates duplicate rows | 2026-08-27 / closed 2026-08-27 |
  Fixed in the same 2026-08-27 pass that introduced the reclassification path. |
```

Link by link, against the current files:

**`classifyReferenceLabel`** (`src/lib/referenceClasses.ts:112`) — the description is
accurate and intended. An absent label returns `other`; an unrecognised one returns
`unclassified`. The comment above it says why the two must not be collapsed. Not a
defect.

**`buildRevisionDiff`** (`src/lib/revisedRateCon.ts`) — does **not** emit an add plus a
remove. It carries a third op:

```ts
op: 'added' | 'removed' | 'reclassified';
/** The class the row is filed under today; set only on `reclassified`. */
from_reference_class?: string;
```

and at line ~671 it looks up the same `value_key` filed under another class, adds it to
a `reclassified` set — "Stored keys accounted for by a reclassification; never reported
removed" — and pushes a single "Reference filed differently" entry.

**`saveLoadReferences`** (`src/lib/loadReferences.ts:59`) — takes a `reclassifications`
option and applies each one as an in-place UPDATE *before* the upsert:

```ts
* Class moves applied IN PLACE, before the upsert runs. The upsert key is
* (load_id, reference_class, value_key): writing the new class straight
* through would miss the stored row entirely and insert a second one, which
* is exactly the duplicate this path exists to prevent.
```

It locates the row, then updates by id so the id, citations and `created_at` survive.

**`LoadReferencesCard`** — displays whatever rows exist; with no duplicate written there
is nothing to double-render.

The chain is broken at links two and three. Stopping there, per the instruction.

## 2. Is there affected data?

**Zero.** Live query over `public.load_references` grouped by
`(load_id, coalesce(nullif(label,''), reference_class), value_key)` having `count(*) > 1`
returned **0 rows**.

The whole table is 13 rows: pickup 5, delivery 2, unclassified 2, bol 2, pro 1, po 1.
There are **no `other` rows at all**, so the specific stale-`other` shape the finding
describes has no instances to act on.

## 3. Mechanism

Not applicable — items 1 and 2 both come back negative. The mechanism the finding
describes is real as *history*: it is the defect the 2026-08-27 pass was written to
close, and the record documents it under "Reference classes go stale, and that is
normal."

## 4. The backfill question

A backfill exists, and it is deliberately not a migration:
`src/lib/referenceBackfill.ts` plans the repair and `scripts/reference-backfill.ts`
runs it. It imports `classifyReferenceLabel` rather than reimplementing the rule in SQL,
precisely so the prefix fallback and `labelKey` normalization cannot drift. It exists to
avoid the trap that a reference with no printed label is stored with
`label = <class name>` and is *correctly* `other`.

Current exposure, checked row by row against `LABEL_MAP` and the prefix fallback:

| stored class | label | classifier today | match |
|---|---|---|---|
| bol | Bill of Lading # / BOL | bol | yes |
| delivery x2 | Delivery Number | delivery | yes |
| pickup x5 | Pickup Number | pickup | yes |
| po | PO Number | po | yes |
| pro | PRO | pro | yes |
| unclassified | QUOTE | unclassified | yes |
| unclassified | Customer Ref # | unclassified | yes |

**0 of 13 rows carry a class the current classifier would not assign.** That matches the
record's note that "the live audit found 0 rows needing reclassification and 0 sentinel
rows, so the script has not had to run."

## Contradictions with the record

None found. The record's stale-issues table, the "Reference classes go stale" entry, the
current source and the live data all agree. Worth appending a second occurrence date
(2026-09-03) to the existing stale-table row — this is now the second report of the same
closed finding, and the seventh stale finding in this batch of nine.
