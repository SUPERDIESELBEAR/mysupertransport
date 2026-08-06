# Filter By Driver view to fully onboarded drivers only

## Change

Restrict the **Onboard Systems → By Driver** pairing view to operators who are fully onboarded: they must have both a `go_live_date` set **and** insurance confirmed (`insurance_added_date` is non-null). Drivers still in the onboarding phase must not appear.

## What gets updated

- `src/components/equipment/EquipmentByDriver.tsx`
  - Add `go_live_date` and `insurance_added_date` to the existing `onboarding_status` embedded select.
  - After loading, filter rows to only those where:
    - `onboarding_status.go_live_date` is non-null, **and**
    - `onboarding_status.insurance_added_date` is non-null.
  - Keep the existing `is_active = true` and demo-visibility filters.
  - Update the empty-state message to indicate that only fully onboarded (go-live + insured) drivers are shown.

## What stays the same

- The card/table toggle, search, and "Missing ELD or Dash Cam" filter keep their current behavior, but now operate only on the fully onboarded subset.
- Unit number resolution, device-value mismatch logic, sorting, and styling are unchanged.
- No schema, table, or policy changes.

## Verification

- Open `/dashboard?view=equipment&tab=by_driver` and confirm drivers without a `go_live_date` or without `insurance_added_date` no longer appear.
- Confirm that a driver with both fields set still appears correctly, with their ELD/Dash Camera/fuel card/BestPass values.

