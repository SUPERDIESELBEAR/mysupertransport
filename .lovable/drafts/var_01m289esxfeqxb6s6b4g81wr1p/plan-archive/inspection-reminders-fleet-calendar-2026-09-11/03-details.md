## Order of work

1. Accept this draft so the inspection record-keeping goes live.
2. Turn on the daily reminder job and confirm it sends nothing unexpected on the first run.
3. Add the calendar tab.

Steps 1 and 2 are tied together — the reminders have nothing to read until the records exist.

## Technical notes

**Reminders.** `supabase/functions/cron-inspection-reminders/index.ts` already exists. Work needed: verify its driver/email lookup against the live schema (it currently joins `applications(email)`), deploy it, and schedule it once daily at 13:00 UTC (08:00 Central) via `cron.schedule` + `net.http_post`. Idempotency is per truck + cycle + stage, recorded on the cycle row, so a re-run the same day sends nothing twice. One consolidated job covers all four stages rather than separate schedules.

**Calendar.** New `InspectionCalendar.tsx` under `src/pages/management/`, rendered as a tab inside `InspectionProgramPanel.tsx`. One query per year over `inspection_cycles` joined to operators and trucks; month buckets and state derive from the existing helpers in `src/lib/inspectionProgram.ts` — no new scheduling logic. Chip click routes to the Vehicle Hub drawer for that unit. Filters and year selection are client-side over the same result set.

**Untouched:** the group assignment rule, the assigned-month table, grace limits, bonus amounts and the fee cap stay exactly as built and configurable.
