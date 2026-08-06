# Pipeline Ribbon: Split Day Counter into Two Square-Rounded Pills

## Goal
Replace the single oval day counter in the onboarding pipeline ribbon with two separate square-rounded pills: one static gray pill tracking days since the application was submitted, and one dynamic-color pill tracking days since the pre-employment drug test results were received (the FMCSA window). Window Expired only applies to the PE results pill.

## Current State
- `OnboardingDaysPill.tsx` renders a single `rounded-full` pill that counts days from `pe_results_date` and applies the green/yellow/red/Window Expired thresholds.
- In `PipelineDashboard.tsx`, this pill sits in the top chip row next to the App Install button.
- `HiringWindowDates.tsx` renders "Approved" and "PE Results" date chips in a second row. The application submitted date is not displayed there.

## Changes

### 1. Generalize the day counter component
- Update `src/components/staff/OnboardingDaysPill.tsx` to support two modes:
  - `pe_results`: existing dynamic color logic (green 0-10, yellow 11-20, red 21-30, destructive Window Expired 31+).
  - `application_submitted`: static gray styling (no color thresholds, no expiration).
- Change the pill shape from `rounded-full` to `rounded` to match the other chips in the pipeline ribbon.
- Keep the tooltip behavior and hide the pill when the driver is fully onboarded or the source date is missing.

### 2. Add the application submitted date to the ribbon
- Update `src/components/staff/HiringWindowDates.tsx` to accept `applicationSubmittedAt`.
- Add a new chip: "Application Submitted [date]" with the static gray application-submitted day pill beside it.
- Keep the existing "Approved" chip (no day pill).
- Keep the "PE Results [date]" chip but render the dynamic PE-results day pill beside it instead of separately.
- Ensure all chips use the same `rounded` styling.

### 3. Update the pipeline table layout
- In `src/pages/staff/PipelineDashboard.tsx`:
  - Remove the single `OnboardingDaysPill` from the top chip row next to App Install.
  - Pass `applicationSubmittedAt={op.application_submitted_at}` to `HiringWindowDates` in both the main table and the on-hold section.
- The top row becomes: App Install button + (any other existing top-row chips).
- The second row becomes: Application Submitted [date] [gray day pill] · Approved [date] · PE Results [date] [dynamic day pill].

## Verification
- Confirm both the main pipeline rows and the on-hold rows render the two new pills.
- Confirm PE results pill still shows Window Expired for 31+ days.
- Confirm application submitted pill is always gray and never shows Window Expired.
- Confirm pills are square-rounded (not oval) and match the surrounding chip styling.
- Run a TypeScript check to ensure no prop type errors after the component changes.
