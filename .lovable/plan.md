Build a reusable three-field DOB picker (Month / Day / Year) and replace the native date input on the Passenger Authorization signing page.

Technical details

1. Create `src/components/ui/dob-picker.tsx`
   - Props: `value` (ISO string `YYYY-MM-DD`), `onChange(isoDate: string)`, `className`, `disabled`, `placeholder`, `yearFrom` (default 1900), `yearTo` (default current year).
   - Render three side-by-side `Select` dropdowns: Month (names, Jan–Dec), Day (1–31), Year.
   - Parse the incoming `value` into the three fields; show empty placeholders when no date is set.
   - Recompute a valid ISO date whenever any field changes, clamping days to the correct max for the selected month/year (leap years included).
   - Call `onChange('')` when any field is cleared, and `onChange(iso)` only when the combination is a valid date.
   - Use the existing `src/components/ui/select.tsx` primitives so the picker matches the app's theme and is touch-friendly on mobile.

2. Update `src/pages/PassengerAuthSign.tsx`
   - Replace the `<Input type="date" ...>` used for Passenger DOB with the new `<DobPicker>`.
   - Keep `passengerDob` as the ISO state string that is passed to the PDF builder and finalize edge function.
   - Leave the Effective Date field as-is; it is not a DOB and does not need the picker.

3. Verify
   - Type-check the project.
   - Confirm the Passenger Authorization page renders the new picker and produces the same ISO value on submit.