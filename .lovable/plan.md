# Absence-reason entry from the dispatch board table view

## What you get
Dispatchers and management can enter or change a driver's absence reason from the table view, exactly as they already can in cards view — without switching views.

## The change
- In the table view, expanding a driver's "Absence Log" row shows the same day-by-day mini calendar used in cards view, placed above the existing read-only history panel.
- Clicking a day (or dragging across several) opens the same reason picker: Truck Down, Home Time, Vacation, Medical, Personal, Waiting on Load, No Driver, Other — plus the optional note. Saving writes the daily log and immediately refreshes the history panel below it.
- The existing history panel, the Edit button, and every other table-view behavior stay exactly as they are.
- Same rules apply as in cards view: who may write the log, which drivers show it, and how reasons display.

## Technical details
- File touched: `src/pages/dispatch/DispatchPortal.tsx` (table-view expansion row, ~line 2344). Reuses the existing `MiniDispatchCalendar` component and `absenceRefresh` refresh-key wiring already used by cards view (line 1799–1808 and the panel below it) — no new components, no database changes, no permission changes.
- The calendar's own drivers-without-a-cutoff rule continues to govern which rows show it.
- Verification: run the existing dispatch day-log and absence-log test files, typecheck, then confirm in the browser that a reason saved from table view appears in the history panel and in cards view.
