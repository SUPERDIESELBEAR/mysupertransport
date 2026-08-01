# Stage 4 — Phase 1a: the §2 escalation ladder (revised)

Build §2, verify it against the §9 list, report before §3 starts.

## Verified current state

- `eld_malfunction_notifications` exists (`event_id`, `notification_type`, `day_number`, `recipient_user_id`, `channel`, `sent_on`), **0 rows**, no writer.
- No malfunction job in `cron.job` — the 8-day clock currently expires in silence.
- `carrier_profile` has `home_terminal_timezone` and `fmcsa_division_state`.
- `eld_malfunction_events` already carries `escalations_suppressed_reason` / `_until`, so §2.3 reads existing state.
- `elapsedRepairDay(discovered_at)` in `src/lib/eld/constants.ts` is a raw UTC-millisecond floor with `MAX_BACKDATE_HOURS = 48` — it is a display helper and is **not** what the job will use.

## Correction 1 — what the ladder counts from

**Two clocks, kept separate.**

- **Repair clock (the ladder rungs, day N of 8):** counted from `discovered_at` converted to a calendar date in the driver's home terminal timezone; the discovery date is day 1. This matches `repair_deadline = discovered_at::date + 8`, so day 8 and the deadline always name the same date and the console can't disagree with the job.
- **Extension window (395.34(d)(2), 5 days):** keys on **`created_at`** — the moment the driver notified the carrier — not `discovered_at`. The regulation runs the window from notification, and on a backdated report those differ by up to 48 hours. The day-3 prompt states both dates explicitly so whoever files sees the discovery date and the notification date side by side.

**Backdated first evaluation:** the job fires **only the current rung**, plus the extension prompt if the extension window is still open and no prompt has been sent for the event. Missed lower rungs are recorded as skipped in the day-3/current-rung email body ("reported on day 3 of 8; days 1–2 elapsed before the report") rather than sent. A report backdated 48 hours produces one email, not five.

The elapsed-day function used by the job is a new timezone-aware helper; `elapsedRepairDay` stays as-is for the existing badge, and a test asserts the two agree for a non-backdated event in the terminal timezone.

## Correction 2 — `ack_overdue` cadence and stops

- Fires **at 24 hours** after `created_at`, again **at 72 hours**, then stops. After that the daily digest carries it.
- Never suppressible by a pause (unchanged).
- Stops immediately on **acknowledgment**, **resolve**, or a **granted extension** — each checked in the event query, not after the insert.
- `day_number` is `NULL` for `ack_overdue`, so re-fire prevention inside a day rests entirely on `UNIQUE NULLS NOT DISTINCT (event_id, recipient_user_id, notification_type, day_number, channel, sent_on)`. This is the case the constraint exists for, and it gets its own verification item: two `ack_overdue` inserts for the same recipient on the same `sent_on` with `day_number IS NULL`, second one rejected, error reported verbatim. Run with `NULLS NOT DISTINCT` removed to confirm the duplicate lands — proving the clause is what's doing the work.

## Unchanged and approved

Dedupe constraint plus separate partial digest index; confirm the existing `notification_type` CHECK enumerates all values before relying on it; `ON CONFLICT DO NOTHING` so a re-run is a no-op; demo operators filtered out of the event query entirely (no email, no `notifications` row); a taxonomy entry in `src/lib/notifications/taxonomy.ts` per new type; driver-facing sends restricted to 07:00–21:00 local, management unrestricted; pause auto-lapse fires a "pause lapsed" notification; day 9+ one send per literal elapsed day.

Delivery reuses `raiseSyncAlert` → `eld_sync_alerts` → `notifications` for in-app and the `_shared/email-layout.ts` queue path for email, with the demo check already in `send-eld-malfunction-notice`.

## Verification (observation, not attestation)

1. A seeded event walked through days 3/5/6/7/8/9/10 — which sends fired, to whom, in which local timezone.
2. An event backdated 48 hours, created past day 3 — assert exactly one rung email plus one extension prompt, and that the prompt's window is measured from `created_at`.
3. Duplicate digest, and the `ack_overdue` NULL-`day_number` duplicate, both rejected; the second run with the clause removed shows the duplicate landing.
4. `ack_overdue` at 24h and 72h, silent at 96h; and it stopping on each of acknowledgment, resolve, granted extension.
5. A pause lapsing after 7 days; `ack_overdue` firing through a pause.
6. A demo operator producing zero notification rows and zero emails.
7. Each new alert type asserted **on the bell's rendered Action tab** via Playwright — the Pass B sweep found a rejection alert that inserted fine and rendered nowhere, so an insert-level assertion is not accepted here.

## Technical notes

New SQL objects: `SET search_path = public, extensions`, coalesce-positive refuse authorization, a distinct SQLSTATE per condition registered in `REJECTION_SQLSTATES`, picked up by all three definer guards (confirmed by running them). Every new test run with the fix reverted. No writes to `rods_days` / `rods_events` in this phase.
