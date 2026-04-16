

## Dispatch Hub Overhaul — 6 Features + Recommendations

### What's Changing

**1. Filter/Group by Dispatcher**
Add a "My Drivers" / "All" / specific dispatcher filter dropdown at the top of the Dispatch Board. The `active_dispatch` table already has `assigned_dispatcher` (UUID). The filter narrows cards/table rows to operators assigned to the selected dispatcher. Default to "My Drivers" when the logged-in user is a dispatcher.

**2. Maximize Drivers Visible on Screen**
- Increase the card grid from `xl:grid-cols-3` to `xl:grid-cols-4` (and add `2xl:grid-cols-5`)
- Make cards more compact: reduce internal padding, tighten avatar size, and consolidate info into fewer lines
- Collapse the Load/Lane and ETA fields (removing the dedicated 2-column grid — see item 4)

**3. Bold Unit Number Near Driver Name**
Move the unit number badge from the card header strip to directly beside the driver's name in the card body. Display it as a bold, larger `font-mono` tag next to the name (e.g. "John Smith **#1042**").

**4. Remove Load/Lane Field**
Remove the `current_load_lane` display and edit field from both cards and table views. The column stays in the database (no migration needed) but is no longer shown in the UI. ETA Redispatch field is also removed from the card grid (replaced by the mini calendar).

**5. Inspection Binder Quick Access**
Add a "Binder" icon button to each card/row footer (next to Call, Message, Edit). Clicking opens the existing `OperatorInspectionBinder` component in a Sheet/Drawer overlay, passing the operator's `user_id` and `operator_id`. No new component needed — reuses the existing one.

**6. Mini Monthly Calendar with Status Counters**
This is the centerpiece feature. Each driver card gets a collapsible mini calendar (current month) and status counters.

- **New database table**: `dispatch_daily_log` — stores one row per operator per date with the status for that day
  - Columns: `id`, `operator_id`, `log_date`, `status` (dispatched/home/truck_down/not_dispatched), `notes`, `created_by`, `created_at`
  - Unique constraint on `(operator_id, log_date)`
  - RLS: staff/dispatcher/management can read and write
- **Mini calendar UI**: A compact month grid (Su–Sa headers, day cells) rendered inside each card. Days are color-coded dots matching the status color scheme. Clicking a day opens a small popover to set/change that day's status.
- **Status counters**: Below the calendar, display 4 compact counters — "Dispatched: 18 · Home: 4 · Down: 1 · Not Dispatched: 7" for the displayed month. Counters are computed from `dispatch_daily_log` data.
- The calendar defaults to the current month with left/right arrows to navigate.

### Additional Recommendations

1. **Auto-populate daily log from realtime status**: Add a database trigger or scheduled job that snapshots each operator's `active_dispatch.dispatch_status` at end-of-day (e.g. 23:59 Central) into `dispatch_daily_log`. This gives dispatchers historical data without manual entry.

2. **Dispatcher assignment UI**: Currently `assigned_dispatcher` exists in the DB but there's no UI to assign it from the Dispatch Portal. Adding a dispatcher dropdown in the edit mode would make the "filter by dispatcher" feature immediately useful.

3. **Weekly/monthly summary export**: Once daily logs exist, a "Download CSV" button could export a driver's dispatch history for payroll or reporting.

I recommend we implement items 1–5 and the mini calendar (item 6) in this round, and defer the auto-populate trigger and CSV export as follow-up enhancements. Shall I also add the dispatcher assignment UI, or should that come later?

### Technical Details

| File | Change |
|------|--------|
| **Migration** | Create `dispatch_daily_log` table with RLS policies, enable realtime |
| `src/pages/dispatch/DispatchPortal.tsx` | Dispatcher filter dropdown, compact card layout, unit # next to name, remove load/lane UI, add Binder button, embed mini calendar component, increase grid density |
| `src/components/dispatch/MiniDispatchCalendar.tsx` | **New** — compact month calendar with day-click popover, status dot rendering, month navigation, counter row |
| `src/components/inspection/OperatorInspectionBinder.tsx` | No changes — reused as-is inside a Sheet |

### Behavior Summary

| Feature | UX |
|---------|-----|
| Dispatcher filter | Dropdown at top: "My Drivers" (default for dispatchers) / "All" / specific dispatcher name |
| Card density | 4 cards per row on large screens, 5 on 2xl, reduced padding |
| Unit # placement | Bold monospace badge beside driver name inside card body |
| Load/Lane | Removed from cards and table; DB column untouched |
| Binder access | Shield icon button in card footer opens full binder in a side drawer |
| Mini calendar | Collapsible section in each card; color-coded day dots; click-to-set status; month nav arrows; counter summary row |

