

## Anchor unlogged-day detection to a smarter "start" date

### What changes

Replace the current single anchor (`operators.created_at`) with a two-tier rule that better reflects when each driver actually started dispatching:

1. **Drivers onboarded through the app** (have a `go_live_date` set on `onboarding_status`): use **`go_live_date`** as the lower bound. No "?" marks for any date before they went live.
2. **Pre-existing drivers** (no `go_live_date` — imported/legacy): use **April 1, 2026** as the lower bound. No "?" marks before April 1.

If a driver somehow has neither (edge case), fall back to `created_at` so we never show a wall of question marks.

### Walkthrough

- **New driver, app-onboarded, go-live April 18:** "?" marks appear only for unlogged days from April 18 onward. April 1–17 stay blank.
- **Pre-existing driver (legacy):** "?" marks appear only for unlogged days from April 1 onward. March and earlier stay blank.
- **Today and future days:** unchanged — no "?" ever.

### Files touched

- `src/components/dispatch/MiniDispatchCalendar.tsx` — update the operator metadata fetch to also pull `onboarding_status.go_live_date`, then change `operatorStartDate` resolution to: `go_live_date ?? '2026-04-01' (if no go_live_date) ?? created_at`.

### Technical notes

- Query change: extend the existing operator lookup with a join/select on `onboarding_status(go_live_date)` (one-to-one relation per `mem://arch/database-patterns/one-to-one-relations` — read as a single object, not an array).
- Anchor resolution (in order):
  1. `onboarding_status.go_live_date` if present → use it.
  2. Else use the constant `'2026-04-01'` (legacy cutoff).
  3. Else fall back to `operators.created_at` (safety net).
- The constant lives as a single `LEGACY_DISPATCH_START = '2026-04-01'` at the top of the file so it's easy to find/change later.
- The counter chip math automatically picks up the new anchor since it reuses the same `unloggedPastDates` memo — no separate change needed.
- Color/size tweak from the prior approved plan (amber `?` + amber chip) is **already pending** and will be applied in the same edit so we touch the file once.

### Out of scope

- Backfilling `go_live_date` for pre-existing drivers (intentionally left blank — that's why the April 1 fallback exists).
- A UI control to change the legacy cutoff date (hard-coded for now; trivial to expose later if needed).

