## Technical details

**Source of truth.** Unit numbers live in two columns (`onboarding_status.unit_number`, `operators.unit_number`) with an existing onboarding-first resolver in `src/lib/fuel/operatorUnit.ts` and `public.operator_unit_number()`. The pool logic consumes that resolver — it does not add a third reading rule. `UnitNumberConflictAlert` behavior is unchanged.

**Staged migration** under `.lovable/drafts/var_01m2g3v9smfpqvernvp17yn8yh/migrations/` (applies on draft accept, not now):

- `public.unit_number_pool()` — `SECURITY DEFINER`, `SET search_path = public`, `STABLE`. Returns rows of `(unit int, kind text, freed_at timestamptz, note text)` where `kind` is `recycled | gap | next`. Classification:
  - taken = any operator whose resolved unit is numeric and who has a `go_live_date`, or who is active, or whose onboarding is still open (not deactivated, no Go-Live) — the reserved case.
  - recycled = resolved unit of an operator with `go_live_date IS NULL` and `deactivated_at IS NOT NULL` (or `is_active = false` with no Go-Live), where that number is held by no taken row. `freed_at = deactivated_at`, ordered oldest first.
  - sequence bounds exclude out-of-band values via a config-driven range rather than hardcoding: `unit_number_config` single row holding `sequence_min`, `sequence_max_offered`, `excluded_units text[]` seeded `190 / 999 / {000,1900,1901}`. Keeps the rule configurable per the SaaS constraint.
  - `next` = `max(taken ∪ recycled ∪ gap-consumed) + 1` within range.
- `public.unit_number_holders(_unit text)` — who holds a given number and their state, for the collision warning and the shared-number notice.
- Grants: `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`; both functions re-check the caller holds `onboarding_staff`, `management`, or `owner` via `has_role(auth.uid(), ...)` and refuse otherwise. `unit_number_config`: `GRANT SELECT TO authenticated`, `GRANT ALL TO service_role`, RLS on, select for onboarding_staff/management/owner, update for management/owner. No `anon` grant.
- Company scoping follows the current tenancy step: `company_id` non-null, no default, FK `ON DELETE RESTRICT`, stamped server-side by the sanctioned trigger shape; pool queries filter by `current_company_id()`.

**Automatic release.** No new release table. Release is derived, not recorded — a number is free because its holder has no Go-Live and is archived, which the existing deactivation path already writes. This means archiving in `DeactivationPage.tsx` needs no change, and un-archiving correctly re-reserves the number. `vacant_units` stays as-is; it models a departing truck, not a pre-Go-Live number.

**Frontend.**

- `src/lib/unitNumberPool.ts` — typed wrapper + pure helpers (`classifyUnit`, `formatPoolOption`) so the ordering rules are unit-testable without the database.
- `src/components/operator/UnitNumberPicker.tsx` — combobox modelled on `src/components/shared/DriverCombobox.tsx`: grouped options (Recycled / Never issued / Next available), free-text entry allowed, inline warning from `unit_number_holders` when the typed value is held, naming the holder and whether they are live or onboarding.
- Wire it in place of the plain inputs at `src/components/operator/TruckInfoCard.tsx` (Edit Truck popover, `unit_number` field), `src/pages/staff/OperatorDetailPanel.tsx` (~line 5957), and `src/components/fleet/QuickTruckEditModal.tsx`. Saves keep going through `saveTruckSpecs` in `src/lib/truckSync.ts` — unchanged, so the existing dual-write, VIN normalization and `truck_specs_updated` audit entry still apply.
- Audit: `saveTruckSpecs` already logs the diff. Add `pool_kind` (`recycled`/`gap`/`next`/`manual`) to that entry's metadata so a reuse is attributable later.

**Tests.** `src/lib/__tests__/unitNumberPool.test.ts` covering: recycled-before-gap-before-next ordering, a reserved in-onboarding number never offered, a post-Go-Live departure never recycled, excluded test numbers not raising `next`, and a duplicate-held number reported rather than offered. Plus a live check that `next` equals 272 and the gap list matches the 12 numbers above.

**Cannot be verified in the draft.** The functions and config table do not exist until the draft is accepted, so the picker's data path can only be exercised after that. Pure helper tests run now.
