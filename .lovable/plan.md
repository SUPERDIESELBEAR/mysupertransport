

## Add Equipment Fields to the Add Driver Modal

### Problem
When adding a pre-existing operator, the modal only captures Unit # but not ELD Serial Number, Dash Cam Number, BestPass Number, or Fuel Card Number. These fields exist on the `onboarding_status` table but aren't in the form.

### Fix — one file: `src/components/drivers/AddDriverModal.tsx`

**1. Add fields to `INITIAL_FORM`**
Add `eld_serial_number`, `dash_cam_number`, `bestpass_number`, `fuel_card_number` (all empty strings).

**2. Add an "Equipment" section to the form UI**
Below the Truck Information section, add a new section header "Equipment & Cards" with four fields in a 2×2 grid:
- ELD Serial #
- Dash Cam #
- BestPass #
- Fuel Card #

**3. Save equipment fields on submit**
In the post-invite `onboarding_status` update (line ~136), include all equipment fields alongside `unit_number` in a single `.update()` call. Only include non-empty values.

### No database or edge function changes needed.
The `onboarding_status` table already has all four columns.

