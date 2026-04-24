

## Allow clearing a date + block future-day edits on the dispatch calendar

### The problem

On Rudolph Ellis's calendar, the dispatcher set a status for **April 30** even though that date hasn't happened yet. Two issues are at play:

1. **No way to undo** — the per-day popover (`MiniDispatchCalendar.tsx`) only offers the four statuses (Dispatched / Home / Truck Down / Not Dispatched). There's no "Clear" option, so a mistake can only be replaced with another status, never removed.
2. **Future days are clickable** — single-day edits don't enforce the "no future" rule that the Mark-range tool already does. So a stray click on April 30 today silently writes a real `dispatch_daily_log` row.

### What this change adds

**1. "Clear status" option in the per-day popover**
When a day already has a logged status, append a small **Clear status** action at the bottom of the popover. Clicking it deletes that day's `dispatch_daily_log` row and refreshes the grid — the cell returns to plain/unlogged. If the cleared day is **today**, also reset `active_dispatch.dispatch_status` back to `not_dispatched` and append a `dispatch_status_history` row noting the clear, so the live Dispatch Hub tiles stay in lockstep (per the Calendar↔Live sync rule).

If a day has no log yet, the Clear option isn't shown (nothing to clear).

**2. Block writing to future days from single-cell clicks**
Mirror the existing Mark-range "future days are skipped" rule on per-day edits:
- Future-day cells render with reduced opacity + `cursor-not-allowed`.
- Clicking a future day shows a small toast: *"Can't set a status for a future date."* — the popover's status buttons are disabled. (The cell is still clickable so users get the explanation; it just won't write.)

**3. Minor UI polish**
- The per-day popover gets a thin separator above the new Clear button so it reads as a destructive/secondary action, styled in muted red text (not loud — it's a small inline action, not a delete-account button).
- Tooltip on the Clear button: *"Remove this day's status (returns the cell to blank)."*

### Walkthrough for Rudolph's April 30 situation

1. Open Rudolph Ellis → Dispatch tab → calendar.
2. Click the **April 30** cell.
3. In the popover, click **Clear status** at the bottom.
4. April 30 returns to a plain unlogged cell. Done.

### Out of scope

- A bulk "Clear range" tool (the Mark-range popover currently only writes — adding a clear mode is a follow-up if you want it).
- Audit-logging individual day clears (the existing `dispatch_status_history` row covers today-clears; past-day clears just delete the `dispatch_daily_log` row without history).
- Disabling future days inside the Mark-range tool — already handled (`effectiveEnd = min(rangeTo, today)`).

### Files touched

- `src/components/dispatch/MiniDispatchCalendar.tsx` — add `clearStatus(day)` + future-day guard in the per-day popover; small UI tweaks to the popover.

### Technical notes

- `clearStatus` deletes via `supabase.from('dispatch_daily_log').delete().eq('id', existing.id)`. RLS already allows staff DELETE on this table (policy: *"Staff can delete dispatch daily logs"*).
- Today-clear sync: `active_dispatch` upsert with `dispatch_status: 'not_dispatched'` + `dispatch_status_history` insert with `status_notes: 'Cleared from calendar today-cell'`. Skip both if `active_dispatch` is already `not_dispatched` (matches existing `syncTodayToLive` no-op guard).
- Future-day check: `dateStr > new Date().toISOString().slice(0,10)`. Cells matching this get `opacity-40 cursor-not-allowed`; status buttons in their popover get `disabled`.

