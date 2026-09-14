# Technical details

## Edit

**`src/components/management/ScreeningChips.tsx`** (only file changed):

- `MARK` map: `not_started` and `requested` become empty strings; `received` keeps `✓`. The mark `<span>` renders only when non-empty, so no stray gap remains.
- No other files touched — colors (`CHIP` map), `WORDS`, tooltips, "Verified" collapse, and all consumers (Applications list, mobile rows) are unchanged.

## Verification (build mode)

1. Sign into the preview as staff, open Management → Applications.
2. Screenshot the Screening column at desktop width (1280px) and a mobile width — confirm chips sit cleanly with no overlapping text, wrapping instead if the column is tight.
3. Confirm: received chips show `MVR ✓`; requested chips show `PSP` (no dot); not-started chips show `CH` (no circle); tooltip wording and dates unchanged.
4. Report back whether overlap exists anywhere; if a real overlap is found (not expected — the group wraps), it gets a one-line spacing fix in the same pass and a fresh screenshot.

## Out of scope

- No changes to the Interview column, the review drawer, statuses, or any database item.
