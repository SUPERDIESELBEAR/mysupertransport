

## Auto-Fill ICA Builder from Onboarding Truck Info

### Problem
Staff enter truck details (year, make, model, VIN, plate, plate state) in the Truck & Equipment card on `onboarding_status`, but when they open the ICA builder, those fields are blank. The ICA only loads truck data from existing `ica_contracts` drafts.

### Fix
In `src/components/ica/ICABuilderModal.tsx`, after checking for an existing ICA draft, also fetch `onboarding_status` truck fields as a fallback for the initial state.

### Changes

**`src/components/ica/ICABuilderModal.tsx`**

1. In the `loadDraft` effect (~line 150), after checking for an existing `ica_contracts` row, also query `onboarding_status` for the operator's truck fields
2. When no ICA draft exists (the `!existing` early return), use `onboarding_status` truck data to pre-fill the initial state instead of returning with blank fields
3. When a draft does exist, keep the draft values as primary but fall back to `onboarding_status` for any truck fields that are null/empty in the draft
4. Include `trailer_number` in the fallback chain

The priority order becomes:
- ICA draft values (highest — staff may have edited them in the builder)
- `onboarding_status` truck fields (pre-entered by staff in the pipeline)
- Default empty values (lowest)

### Files Changed

| File | Change |
|------|--------|
| `src/components/ica/ICABuilderModal.tsx` | Fetch `onboarding_status` truck fields in `loadDraft` and use as fallback for initial ICA data |

