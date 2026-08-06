# Add a running day pill to the Application Approved chip

The Approved date chip in the Onboarding Pipeline ribbon currently shows only a date. It will get a running day counter pill, matching the Submitted chip: static gray, square-rounded, counting days since staff approved the application. No expiration state — only the PE Results pill keeps the 30-day FMCSA window coloring.

## Behavior
- Pill reads `Day N`, where day 0 is the approval date.
- Static gray styling (same tokens as the Submitted pill).
- Hidden when no approval date exists or when the driver is fully onboarded.
- Tooltip: "Day N since application was approved — {date}".

## Technical changes
- `src/components/staff/OnboardingDaysPill.tsx`: add `application_approved` to the mode union; treat it with the same gray styling and non-expiring logic as `application_submitted`; add its aria-label/tooltip wording.
- `src/components/staff/HiringWindowDates.tsx`: render `<OnboardingDaysPill date={approvedAt} mode="application_approved" ... />` inside the Approved chip, after the date text.

No database or pipeline data changes needed — `approved_at` is already passed into the ribbon.
