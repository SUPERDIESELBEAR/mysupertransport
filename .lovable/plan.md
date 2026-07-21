## Diagnosis

Only one row in the current screenshot has doc type CDL (Ishmael McGruder). Every other visible row is Medical Cert. Both doc-type badges live in the same fixed-width `w-[76px]` slot, so their columns are actually equal width, but they don't look like it:

- The `Medical Cert` label wraps to two lines, so the pill fills the whole 76 px slot (visible edges span the full column).
- The `CDL` label is 3 characters. The pill uses `justify-center`, so it sits as a small chip centered inside the same 76 px slot — its left edge lands ~20 px inside the column and its right edge lands ~20 px before column end.

Because the doc-badge is the anchor the eye uses for the Expires column, the CDL pill (and its neighboring `Aug 18, 2026`) reads as "shifted right" versus the Medical Cert rows above it, even though the underlying grid is aligned.

## Fix

File: `src/components/inspection/ComplianceAlertsPanel.tsx` (doc-badge cell only, ~line 639).

1. Make both pills visually occupy the same box within the 76 px slot:
   - Add `whitespace-nowrap` so nothing wraps.
   - Change alignment from `justify-center` to `justify-start` so both `CDL` and `Medical Cert` share the same left edge as the column.
2. Shorten the Medical Cert label to `Med Cert` so it fits on a single line inside the 76 px slot at the same height as the `CDL` pill (matches the "Med Cert" wording already used in the Fleet Compliance table header for consistency).
3. Keep the existing color styles (blue for CDL, purple for Med Cert), width, padding, border, and font size — no other changes.

Result: The doc-type badge, the Expires date, the Status pill and the trailing action buttons all line up in the same columns for every row regardless of doc type.

## Out of scope

- No changes to filtering, sorting, data, tooltips, or any other column.
- No changes to the header row — column widths already match after the previous pass.
