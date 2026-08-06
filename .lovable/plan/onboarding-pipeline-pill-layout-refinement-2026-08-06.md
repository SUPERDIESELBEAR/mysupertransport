# Onboarding Pipeline Pill Layout Refinement

## Goal
Keep the day-tracker pill consistently to the right of the **App Installed** / **Send App Install** pill, and move the **Approved** and **PE Results** date chips below that pair so the name line stays clean and the layout is predictable.

## Current state
In `src/pages/staff/PipelineDashboard.tsx` the main applicant table row currently renders all chips in a single flex-wrap row:

```text
[App Installed] [Day pill] [Approved Jul 29, 2026] [PE Results —]
```

Because the **Approved** chip sits on the same line, the **Day** pill can end up separated from the **App Installed** pill when the row wraps or on narrower viewports.

## Changes

1. **Main table name cell** — split the chip area into two stacked flex rows:
   - Row 1: App Installed / Send App Install button + `OnboardingDaysPill` (kept together, no wrap between them)
   - Row 2: `HiringWindowDates` (Approved + PE Results chips)

2. **Preserve existing behavior** — tooltips, click handlers, responsive classes, and the on-hold section remain unchanged. Only the chip stacking order inside the main table name cell changes.

## Files to edit
- `src/pages/staff/PipelineDashboard.tsx` (main table row, lines around the `App Installed` / `OnboardingDaysPill` / `HiringWindowDates` rendering block)

## Outcome
```text
Robert Carpenter
[App Installed] [Day 12]
[Approved Jul 29, 2026] [PE Results —]
```

The day tracker is always immediately to the right of the App Install pill, and the approval / PE results dates move to their own line below.
