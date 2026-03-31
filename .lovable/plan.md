

## Add Editable Truck Info + Hidden Trailer Section to Truck & Equipment Card

### Problem
Truck details (year, make, model, VIN, plate, plate state) can only be entered via the ICA builder in Stage 3. Staff need to capture this info earlier in the pipeline. Additionally, a trailer section is needed but should be hidden by default since trailers are rare.

### Approach
Add truck fields directly to the `onboarding_status` table so they're available from the start of onboarding, independent of the ICA. Update the TruckInfoCard to support inline editing of truck fields (not just device numbers). Add a collapsible "Trailer" section that's hidden by default.

### Changes

**1. Database migration — Add truck columns to `onboarding_status`**
Add 6 new nullable text columns:
- `truck_year`, `truck_make`, `truck_model`, `truck_vin`, `truck_plate`, `truck_plate_state`

This lets staff enter truck info at any pipeline stage without needing an ICA contract row.

**2. `src/components/operator/TruckInfoCard.tsx` — Make truck fields editable + add hidden trailer section**
- Expand the edit popover (or convert to a fuller edit mode) to include truck fields: Year, Make, Model, VIN, License Plate, Plate State
- Add `onTruckEdit` callback prop for saving truck fields
- Add a "Trailer" collapsible section (collapsed/hidden by default) with a trailer number field and a toggle to reveal it (e.g. "+ Add Trailer" link)
- Keep device number editing as-is

**3. `src/pages/staff/OperatorDetailPanel.tsx` — Wire up truck editing**
- Fetch truck info from `onboarding_status` instead of (or merged with) `ica_contracts`
- Add `handleTruckInfoEdit` function that updates the new `onboarding_status` truck columns
- Pass the new callback to `TruckInfoCard`
- Include trailer_number in the editable fields

**4. Data flow**
- Truck info is stored on `onboarding_status` for early entry
- The existing `ica_contracts` fetch remains as a fallback/read-only source
- Priority: `onboarding_status` truck fields take precedence; if empty, fall back to `ica_contracts`

### Files Changed

| File | Change |
|------|--------|
| DB migration | Add 6 truck columns to `onboarding_status` |
| `src/components/operator/TruckInfoCard.tsx` | Add truck field editing, hidden trailer section |
| `src/pages/staff/OperatorDetailPanel.tsx` | Fetch/save truck info from `onboarding_status`, wire new edit handler |

