## Goal

In the staff Application Review drawer (the panel shown in your screenshot), the **Med. Cert. Expiry** date picker currently forces month-by-month navigation with the arrows. Add a **year dropdown** in the calendar header so staff can jump straight to the right year.

## Where

`src/components/management/ApplicationReviewDrawer.tsx` — the shared `StageDatePicker` sub-component renders the calendar popover used by both **Med. Cert. Expiry** and **CDL Expiry** (right above it). The fix naturally applies to both — same component, same pain point, no risk of one drifting from the other.

## Change

Enable the built-in react-day-picker dropdown caption on the `<Calendar>` inside `StageDatePicker`:

- Pass `captionLayout="dropdown-buttons"` so the header shows a **Month** and **Year** dropdown alongside the prev/next arrows.
- Set `fromYear={currentYear - 5}` and `toYear={currentYear + 20}`. Med Cert / CDL expiries are always future-dated (typically 0–10 yrs out), and a small look-back covers edge cases like correcting a typo.
- Add a small `classNames` override on the popover usage so the new dropdowns inherit the existing input styling (compact height, border, text size) and don't look like raw browser selects.
- Keep the default month opening on the currently selected date (already works via `selected`).

No changes to data, validation, save logic, or any other field. The Calendar primitive (`src/components/ui/calendar.tsx`) already forwards props to `DayPicker`, so no changes are needed there.

## Out of scope

- The applicant-facing Driver Application form (this fix is for the staff review panel where Med. Cert. Expiry actually lives, per your screenshot).
- Other date pickers in the app (StageDatePicker on the Operator Detail panel, DOB pickers, etc.). Happy to extend in a follow-up if you want one consistent year dropdown everywhere.
