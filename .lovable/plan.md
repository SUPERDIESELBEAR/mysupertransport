

## Update send-insurance-request to Prefer onboarding_status Truck Data

### Problem
The edge function currently pulls `truck_vin`, `truck_year`, and `truck_make` only from `ica_contracts`. Edits made in the Vehicle Hub (which saves to `onboarding_status`) are not reflected in the insurance email.

### Change

**`supabase/functions/send-insurance-request/index.ts`**

1. Add `truck_vin, truck_year, truck_make` to the existing `onboarding_status` select query (line 175–178) — no extra DB call needed.

2. Update the `buildInsuranceEmail` call (lines 216–218) to prefer `onboarding_status` values, falling back to `ica_contracts`:
   ```
   vin:       os?.truck_vin   || ica?.truck_vin   || null,
   truckYear: os?.truck_year  || ica?.truck_year  || null,
   truckMake: os?.truck_make  || ica?.truck_make  || null,
   ```

3. Deploy the updated function.

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Add truck fields to OS query; prefer OS over ICA |

