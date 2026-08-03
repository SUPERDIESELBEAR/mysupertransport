# Rename HARNESS-1 to "ELD Test Harness"

## The record being renamed

One operator row: `8c0ccadb…`, unit `HARNESS-1`, `is_demo = true`, `demo_label = "Harness"`, currently deactivated, no application attached.

Why it shows as "Marcus Mueller": the row has no application, so roster views fall back to the profile of the login it was created under — `5cca4f77…`, which is your owner/management login. That profile must not be touched; renaming it would rename you across the entire app.

## What to change

1. **Data (migration).** On that one operator row, set `demo_label = 'ELD Test Harness'` and `unit_number = 'ELD-TEST'`. Scoped by operator id so nothing else can be hit.
2. **Display (frontend).** For demo operators with no linked application, show `demo_label` as the driver name instead of falling back to the creating staff member's profile name. Applied in the shared name-resolution helper used by Driver Hub, Vehicle Hub, the pipeline and the demo accounts panel, so the row reads "ELD Test Harness" everywhere rather than in one screen only.
3. **Verify** by loading Driver Hub and Vehicle Hub with "Show demo accounts" on and confirming exactly one Marcus Mueller driver remains.

## Note

This is display-only cleanup — the harness row stays in place, deactivated and demo-flagged. Say the word if you'd rather delete it outright instead.