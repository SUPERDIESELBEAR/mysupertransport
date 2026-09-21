## Where the record is stored

The per-day calendar table already has an unused free-text `notes` column (6,039 rows, all NULL) — the entry box writes there. Two columns are added alongside it so a reason is countable rather than guessed from prose:

- `absence_reason` — a new enum: `truck_down`, `home_time`, `vacation`, `medical`, `personal`, `waiting_on_load`, `no_driver`, `other`. Null when the day's status is `dispatched`.
- `notes_by` / `notes_at` — who entered the reason and when, so the log is attributable. (`created_by` already exists but is overwritten when a status is re-set.)

Nothing is ever deleted on edit: changing a day's reason writes a row to `dispatch_status_history` as the status changes already do, so a correction is visible rather than silent.

This is a schema change, so it is staged as an additive migration and applies **the moment you accept this draft** — not before. The Absence Log cannot be tried in the draft preview until then.

## What gets removed

- `MiniDispatchCalendar` day popover: gains a reason select + note textarea, and the Range popover gains the same pair.
- Cards view (`DispatchPortal.tsx` ~1842–1907): the Notes paragraph, the Notes textarea in edit mode, and the `History` disclosure are replaced by a single `AbsenceLogPanel` disclosure.
- Table view (~2157–2168, 2262–2273): the `History` toggle under the name opens the same panel; the `Notes` column and its header are dropped.
- `active_dispatch.status_notes` stays in the database — the truck-down toast, the status history timeline, and `DriverHistoryDownloadPopover` read it. It is no longer typed into by hand; when today's calendar day gets a reason, the existing today-sync writes `"<Reason> — <note>"` into it so those surfaces keep reading correctly.

## New pieces

- `src/lib/absenceLog.ts` — the reason list with labels, and a pure `groupAbsenceStretches(logs)` that collapses consecutive same-reason days into stretches. Unit-tested (gap handling, month boundaries, reason change mid-stretch, single-day stretches).
- `src/components/dispatch/AbsenceLogPanel.tsx` — range picker, totals line, grouped list. Fetches by `operator_id` + date range against the per-day table; no new endpoint.

## Not in scope

Driver-facing visibility, settlement effects, and the existing Parked control are untouched. The Absence Log is a dispatch and management record only.
