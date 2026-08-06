# Filter By Driver view to go-live operators only

## Change

Restrict the **Onboard Systems → By Driver** pairing view to operators whose onboarding record has a `go_live_date` set.

## What gets updated

- `src/components/equipment/EquipmentByDriver.tsx`
  - Add `go_live_date` to the existing `onboarding_status` embedded select.
  - After loading, filter rows to only those where `onboarding_status.go_live_date` is non-null (in addition to the existing `is_active = true` and demo-visibility filters).
  - Update the empty-state message so it reads something like "No go-live drivers match this view." instead of implying all drivers are missing.

## What stays the same

- The card/table toggle, search, and "Missing ELD or Dash Cam" filter keep their current behavior, but now operate only on the go-live subset.
- Unit number resolution, device-value mismatch logic, sorting, and styling are unchanged.
- No schema, table, or policy changes.

## Verification

- Open `/dashboard?view=equipment&tab=by_driver` and confirm active drivers without a `go_live_date` no longer appear.
- Confirm that a driver with a `go_live_date` set still appears correctly, with their ELD/Dash Camera/fuel card/BestPass values.
