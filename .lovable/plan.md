# Fix Load Detail blank page on ST26035

## 1. Verbatim verification shape mismatch

The writer (`set_load_verbatim_verification`) stores an **envelope object**, not a bare array and not a map keyed by field:

```text
{
  "checked_at": "2026-08-23T...",
  "checked_by": "<profile id>",
  "fields": [ { field, verdict, similarity, source, repaired_by, repaired_at, ... } ]
}
```

`VerbatimVerificationCard` reads the column as if it were the array itself, so `records.map` throws and takes the page with it.

**Canonical shape: keep the stored envelope object.** It carries the load-level `checked_at` / `checked_by` audit stamp that a bare array cannot, and it is already what every existing row contains — changing it would mean a data migration for no gain. Per-field records stay as the `fields` array inside it, since a verdict is per capture and the card renders an ordered list.

The reader becomes a small normalizer:
- object with a `fields` array -> use `fields`, and use the envelope's `checked_at` as the fallback "Checked" timestamp when a record has no `verified_at`
- bare array (legacy/in-memory review results) -> use as-is
- null, `{}`, or anything else -> render nothing, never throw

**Other readers of the column:** the only consumer of `loads.verbatim_verification` is this card. Writes go through the RPC (`src/lib/verbatimPersist.ts`, called from `CreateLoadPage` and `RevisedRateConModal`), which takes an array and builds the envelope server-side; `RateConfirmationParser` and the revision modal hold arrays in memory only, never reading the column. Nothing else reads it with the other assumption — this will be re-confirmed by search before the fix lands.

## 2. Error boundary around the load detail cards

Add a reusable card-level boundary (a small `SectionErrorBoundary`, same class-component pattern as the existing `EditorErrorBoundary`) and wrap each section on `LoadDetailPage` individually: summary, rate, conditional blocks, stops, references, verification, documents, claims, status history, notes, change history.

A card that throws renders an inline fallback in place — "This section could not be displayed", the section name, the error message, and a Retry button that resets the boundary — while every other card and the page header keep working. The error is still logged to the console for diagnosis.

## 3. The ref warning

Re-audited the current source: `LoadDetailPage` renders `<DocumentsSection load canManage canSeeInternal />` with no `ref`, `DocumentsSection` is the only other reference to the component, and neither it nor `StopsTimeline` contains a `ref` prop or an `asChild` trigger wrapping a function component. The warnings in the log point at module versions with a stale HMR timestamp and line numbers past the current end of those files, so they look already resolved by intervening edits.

The step is therefore: re-verify against a freshly loaded Load Detail page in the browser after the fixes, and if any "function components cannot be given refs" warning still fires, fix it at the real source — either `forwardRef` the receiving component or drop the dead ref. No ref that does nothing will be left in place.

## 4. Why the suite missed it — and the test that closes the gap

There is no test file for any `loadDetail` component; `VerbatimVerificationCard` has never been rendered by a test. The 597 passing tests cover the writer path (the RPC's array input, actor stamping, wiring) and hand-built fixtures, but nothing ever fed a card the object the database actually returns. The verification work was checked at the boundary the writer owns and never at the boundary the reader owns.

Closing it:
- render `VerbatimVerificationCard` against the **writer's own output shape** — build the fixture by running the envelope construction the migration performs, rather than typing an object by hand — plus cases for bare array, null, and empty
- a shape-contract test asserting the envelope keys the card depends on (`fields`, `checked_at`) are the keys the checked-in migration SQL writes, so a future change to either side fails the suite
- a boundary test: a card that throws renders the fallback and leaves its siblings mounted

## Technical notes

Files touched: `src/components/dispatch/loadDetail/VerbatimVerificationCard.tsx` (normalizer), a new `src/components/shared/SectionErrorBoundary.tsx`, `src/pages/dispatch/LoadDetailPage.tsx` (wrap sections), and new tests under `src/components/dispatch/loadDetail/__tests__/`. No migration and no data change — the stored shape is unchanged.
