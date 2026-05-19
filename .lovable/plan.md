# Fix `[object Object]` in correction status card

## Problem

In the staff-side "View N change(s)" panel (`CorrectionRequestStatusCard`), the **Employment history** diff shows `[object Object], [object Object], ...` instead of readable employer names.

Root cause: `formatValue()` in `src/lib/applicationCorrections.ts` handles arrays with `v.join(', ')`. For the `employers` field (array of objects), that produces `[object Object]`. The applicant-facing approval page already renders employers correctly via `diffEmployers()` — only the staff status card is affected.

## Fix

### 1. `src/lib/applicationCorrections.ts`
Update `formatValue()` so that when `kind === 'employers'` (or the array contains objects), it returns a short, human-readable summary instead of joining objects:
- Each employer becomes a one-line string like `"Acme Trucking (Dallas, TX) — 2021-03 → 2023-08"`, falling back gracefully when fields are missing.
- Multiple employers are separated by `" • "` (or rendered on new lines — see step 2).
- Keep existing behavior for string arrays (multiselect) and scalars.

### 2. `src/components/management/CorrectionRequestStatusCard.tsx`
For the `employers` kind specifically, render the old/new lists as a small stacked list (one employer per line) under the field label, instead of a single inline `was → new` line, so 5 employers don't wrap awkwardly. Keep the inline `was → new` layout for all other field kinds.

### 3. Optional polish
Also show a per-row sub-diff badge ("+4 added") when the employer count changed, to match the richer applicant-side view at a glance. Skip if it adds complexity — the readable names alone solve the reported issue.

## Out of scope
- No database changes; stored `old_value` / `new_value` JSON is already correct.
- No changes to the applicant approval page or the PDF export (both already format employers correctly).
- No changes to email content.

## Verification
- Open an application with a pending correction that edits Employment history.
- Expand "View N change(s)" on the staff card and confirm each employer renders as `Name (City, ST) — start → end` instead of `[object Object]`.
- Confirm non-employer fields (e.g., "Has employment gaps") still render as before.
