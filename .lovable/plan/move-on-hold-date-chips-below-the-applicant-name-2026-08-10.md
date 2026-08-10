# Move On Hold date chips below the applicant name

## What changes

In the Onboarding Pipeline, the **On Hold** section currently renders the `Submitted`, `Approved`, and `PE Results` chips on the same horizontal line as the applicant name:

```text
[Pause] [Name] [Submitted …] [Approved …] [PE Results …] [Since …] [Reason] [Stage track] [Actions]
```

The main pipeline table instead stacks those chips below the name. This plan makes the On Hold section match that pattern:

```text
[Pause] [Name]
      [Submitted …] [Approved …] [PE Results …] [Since …] [Reason]
      [Stage track] [Actions]
```

## Scope

- Only the **On Hold** section in `src/pages/staff/PipelineDashboard.tsx` (around the `HiringWindowDates` render inside the On Hold block).
- The `Active — Open Onboarding Items` section is **not** affected — it does not use `HiringWindowDates`.
- No component API changes, no data changes, no new state.

## Technical detail

1. Change the On Hold row from a single wrapping flex line to a vertical column layout.
2. Keep the pause icon and applicant name on the first line.
3. Place `HiringWindowDates`, the `Since` date, and the `on_hold_reason` on a second line below the name.
4. Keep the stage track and action buttons (Archive, Open) on their own line, still aligned to the right.
5. Preserve existing tooltips, truncation, click handlers, and the `max-w-full overflow-x-auto` scroll strip for the stage track.
6. Ensure the row still wraps gracefully on mobile and narrow viewports (e.g., 731px, 390px).

## File to edit

- `src/pages/staff/PipelineDashboard.tsx` — On Hold row layout only (lines around the On Hold `HiringWindowDates` render).

## Verification

- Type-check the project.
- Visually confirm in the preview that On Hold rows show the date chips below the applicant name, while the main pipeline rows remain unchanged.
