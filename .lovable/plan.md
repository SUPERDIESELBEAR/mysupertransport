

## Add Typed Date Input with Picker Across the App

### Problem
All date fields currently use native `type="date"` HTML inputs, which vary by browser and don't allow consistent MM/DD/YYYY keyboard entry with a calendar picker fallback.

### Solution
Create a reusable `DateInput` component that combines a **masked text input** (MM/DD/YYYY) with a **calendar popover picker**, then replace all `type="date"` usages across the app.

### New Component: `src/components/ui/date-input.tsx`

- Text input with auto-formatting mask: automatically inserts `/` separators as the user types (similar to the existing phone formatting pattern)
- Placeholder shows `MM/DD/YYYY`
- Calendar icon button on the right opens a Popover with the existing `Calendar` component
- Selecting a date from the picker populates the text field
- Typing a valid date updates the internal value
- **Value format**: continues to store `YYYY-MM-DD` strings (matching current database format) — the component handles display conversion
- Accepts same props pattern as current inputs: `value` (YYYY-MM-DD string), `onChange` (returns YYYY-MM-DD string), `className`, `disabled`

### Files to Update

| File | Change |
|------|--------|
| `src/components/ui/date-input.tsx` | **New** — reusable DateInput component |
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace ~5 `type="date"` inputs (birthday, start date, insurance date, MO approval date, etc.) |
| `src/components/drivers/AddDriverModal.tsx` | Replace ~3 `type="date"` inputs (start date, CDL exp, med cert exp) |
| `src/components/application/Step1Personal.tsx` | Replace DOB `type="date"` input |
| `src/components/application/Step2CDL.tsx` | Replace CDL expiration `type="date"` input |
| `src/components/mo-plates/MoPlateFormModal.tsx` | Replace registration expiration `type="date"` input |
| `src/components/inspection/OperatorBinderPanel.tsx` | Replace expiry `type="date"` input |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Replace expiry `type="date"` input |
| `src/components/ica/ICABuilderModal.tsx` | Replace lease date `type="date"` inputs |

### Technical Details

- The `DateInput` component will use `date-fns` `format` and `parse` for conversion between display (`MM/DD/YYYY`) and storage (`YYYY-MM-DD`) formats
- Auto-mask logic: strips non-digits, inserts `/` after positions 2 and 4, caps at 10 chars — same pattern as `formatPhoneInput`
- Calendar popover uses existing `Calendar` and `Popover` components from shadcn
- The `pointer-events-auto` class will be applied to the Calendar per project convention
- Two variant styles: one matching the shadcn `Input` styling (for staff/admin forms), one matching the `AppInput` styling (for the application form)

