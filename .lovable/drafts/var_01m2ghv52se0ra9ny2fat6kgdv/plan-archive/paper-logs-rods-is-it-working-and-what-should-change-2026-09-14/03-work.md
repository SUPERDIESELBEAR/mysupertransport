## What I would build

**1. Every driver, not just active ones.** The picker lists all drivers who ever recorded a log, plus all active drivers, with a "former" tag beside anyone deactivated. Sorted active first. This alone makes the existing records readable.

**2. Correction requests always visible.** Requests for a date with no log day appear in the day list as their own entry ("Aug 1 — correction request, no log on file"), openable to read the issue and the driver's response.

**3. A fleet summary strip above the picker.** Counts, each clickable: uncertified days in the last 8 days, open correction requests, drivers with no log at all this week. Answers the office's first question without picking a driver.

**4. Range presets.** Last 8 days · Last 30 days · Last 6 months · All, alongside the existing two date fields. Default stays 30 days.

**5. Print the selected log.** A print button on the log card using the same render the roadside packet uses, so what is printed matches what an officer would be handed.

**6. Small correctness fixes.** Clear the selected day when the date range changes so a log outside the range can't stay open; date defaults computed in Central time rather than UTC; empty-log days labelled "no duty status recorded" instead of drawing a blank grid.

## Technical notes

- All changes are in `src/components/management/eld/RodsAdminLogsPanel.tsx`; the roster query drops `.eq('is_active', true)` and unions in operator ids present in `rods_days`, keeping the existing `fetchProfileNames` / `fetchOperatorUnits` resolution and the shared `DriverCombobox`.
- The fleet strip is a separate read over `rods_days` and `rods_correction_requests` scoped by the current company, no new tables, no schema change, read-only as this screen is today. Raising a correction request stays the only write.
- Orphan requests are merged into the `grouped` memo as day-less entries; `orderVersionsByDate` and the version-chain display stay untouched.
- Printing reuses `RoadsideDayRender` in a print stylesheet; no PDF pipeline changes.

## Honest limits

With 2 draft days, 0 entries and 1 log-bearing driver in the live data, I can prove the picker now finds that driver and the requests now appear, but I cannot show a realistic certified log, an amendment chain or a useful fleet count until drivers actually record duty status. I will say so rather than imply the screen has been exercised.
