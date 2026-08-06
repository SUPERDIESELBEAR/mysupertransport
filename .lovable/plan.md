# Add a day pill to the "Approved" chip in the Onboarding Pipeline

No, this change hasn't been built yet — I've been in plan mode since you asked for it, so nothing was written to the code. Confirmed in the current code: the Approved chip renders only a date, while Submitted and PE Results each render a day pill.

## What changes

The applicant ribbon will show three day counters:

- **Submitted** — static gray day pill (already built)
- **Approved** — static gray day pill (new)
- **PE Results** — color-coded pill, green/yellow/red then "Window Expired" past 30 days (already built)

## Technical detail

- `src/components/staff/OnboardingDaysPill.tsx`: add an `application_approved` mode that reuses the existing static-gray styling and wording ("Day N", tooltip "Day N since application was approved — <date>").
- `src/components/staff/HiringWindowDates.tsx`: render `OnboardingDaysPill` inside the Approved chip with `date={approvedAt}` and the new mode.

No database or backend changes; `approved_at` is already stored and passed into the ribbon. After approval I'll implement it, run the typecheck, and you can republish.
