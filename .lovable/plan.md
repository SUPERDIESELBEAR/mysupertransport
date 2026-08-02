## Correction accepted — and it is a shipped bug, not a plan detail

`evaluateEvent` (`_shared/eld/escalationLadder.ts:164-189`) pushes `pause_lapsed` and then **falls straight through to the rung block in the same call**. There is no early return. So today, an event paused across day 6 and resuming on day 7 emits `pause_lapsed` and the day-7 rung in one invocation; a pause from day 3 to day 9 emits the lapse plus the `day >= 9` past-deadline rung together. The mechanism that exists to quiet things while a repair is in hand produces its loudest run at the moment it lifts.

**Fix:** when `pauseJustLapsed` is true, push the `pause_lapsed` action and `return { day, actions }` immediately — no rung, no extension prompt on that run. The `ack_overdue` check stays where it is, above the pause logic, because it can never be paused. The event resumes normally on the next hourly pass; one hour on an event deliberately paused for days is not a compliance risk, and it keeps the lapse legible as its own event.

Covered by a unit test in `escalationLadder.test.ts`: an event whose `escalations_suppressed_until` is yesterday and whose current day is a rung returns exactly one action, `pause_lapsed`; advancing `now` one hour past the same date boundary on the following run returns the rung.

**On the staleness watchdog:** agreed — passive read only. The console reads `eld_cron_runs` on load and the staff member is the detector. No job watching the job.

---

## §3 plan

### Prerequisite fixes (land with §3, not after)

1. **Pause-lapse early return** in `evaluateEvent`, as above.
2. **`notice_last_send_error` on the thrown path.** `deliverNotice` already writes the reason on all three explicit failure branches (`:216`, `:251`, `:280`), each in the same statement that increments `notice_send_attempts`. The gap is that `file.arrayBuffer()`, the base64 loop, and `sendResendDirect` can throw, and there is no `try/catch` — `withErrorEnvelope` returns 500 having written nothing, leaving the event indistinguishable from "not yet sent". Wrap the download-through-send region; on catch write `notice_send_attempts: attempts` and `notice_last_send_error: msg.slice(0, 500)`, then re-throw.

### The two clocks, as the job keys them

- **Rung ladder** — `repairDayInZone(discovered_at, now, tz)`; discovery date is day 1; matches Stage 1's `repair_deadline = discovered_at::date + 8`.
- **Extension window** — `extensionWindowOpen(created_at, now)`, 120 hours from the driver's notification, per 395.34(d)(2).
- The prompt's *trigger* gate (`day >= 3`) reads the discovery clock while its window and printed deadline read the notification clock. Correct under the regulation, and the exact row where one merged number misleads.

`created_at` defaults to `now()`, so the two agree on every event reported at discovery and diverge only on a backdated report (up to `MAX_BACKDATE_HOURS` = 48).

### A. Console shell
Two-pane triage console replacing the flat list in `ELDMalfunctionsPanel.tsx`: filterable list left, detail right. Filters: Open / Paused (active) / Paused (lapsed) / Awaiting acknowledgment / Delivery failing / Resolved. Sorted by repair day descending; stacks to one column under `md`.

### B. `ClocksStrip` — both clocks, always, labelled by what they are

```text
Repair deadline      Aug 9, 2026     Day 3 of 8      (from discovery, Jul 31)
Extension deadline   Aug 6, 2026     4 days left     (from driver report, Aug 1)
```

Never conditional, never merged. Anchor dates always shown so the reader sees *why* they differ. A backdated event adds a "reported 2 days after discovery" note between the rows.

### C. Escalation ledger timeline
Per-event read of `eld_malfunction_notifications` through `rungRows` / `firedRungs` — an `extension_prompt` row's `day_number` is the day it fired, not a rung, and is never drawn as one. Un-reached rungs pending; `skippedRungs` render "not sent — elapsed before report". **Default is evidence-only** (`evidenceRows`); `is_override` rows sit behind a "show verification runs" toggle, muted, excluded from the timeliness line: "Office notified on rungs 3, 5 — 2 verification runs not counted."

### D. Pause and delivery state
- **`paused_active`** — reason, auto-resume date, "resumes in N days", Lift-pause action, 7-day cap stated in the dialog. **`paused_lapsed`** — distinct badge for an event whose pause has expired, showing the lapse date, so it reads as its own event rather than as part of the rung it no longer fires alongside.
- Pause invariants are already enforced by `enforce_eld_suppression_rules`: reason required (`P0062`), expiry required (`P0063`), 7-day cap (`P0064`), no past expiry (`P0065`). §3 surfaces them; it does not re-implement them.
- Delivery is four-way: not generated → generated → uploaded → sent, with `notice_send_attempts > 0 && !notice_sent_at` rendering a distinct red **"Failing to send"** carrying the attempt count and the verbatim `notice_last_send_error`. "Not yet sent" and "failing to send" never share a badge.

### E. Extension grant action
Nothing writes `extension_granted_at` today, so the ladder's `extensionGranted` branch is unreachable and the prompt can never be dismissed. Detail-pane action recording notes (required) + expiry, writing `extension_requested_at` / `extension_granted_at` / `extension_granted_by` / `extension_expires_on` / `extension_notes` through the existing staff UPDATE policy.

### F. Cron health card
`ELDEscalationJobHealth`: last run, trigger source, status, counts; staleness banner when the newest `eld_cron_runs` row is older than 90 minutes. Passive read on console load — no watchdog job. A quiet run reads "Ran 14:00 CT — 3 events evaluated, nothing due", so silence is distinguishable from a stopped job. Recent runs behind a disclosure, override runs marked.

### G. Read-only guarantee
No read or write of `rods_days` / `rods_events`, no policy added to either. Every action targets `eld_malfunction_events` through existing policies.

## Technical notes

- **Shared day math.** `elapsedRepairDay` in `constants.ts` divides UTC milliseconds and can name a different day than the job. Extract `repairDayInZone` / `zonedDateKey` / `calendarDaysBetween` into `src/lib/eld/repairClock.ts`, switch console and driver-side callers, deprecate `elapsedRepairDay` in place. Parity test over a backdated fixture and a DST boundary.
- **New definer function** `public.get_eld_escalation_ledger(p_event_id uuid)` joining ledger rows to recipient names (`profiles` keys on `user_id`, not `id` — the §2 embed bug class). §0.2 treatment: `SECURITY DEFINER`, `SET search_path = public, extensions`, internal `is_staff(auth.uid())` check, `REVOKE EXECUTE FROM anon, PUBLIC`, `GRANT EXECUTE TO authenticated`; picked up by the existing definer suites.
- **Policy fix:** `eld_cron_runs` SELECT is `management`/`owner` only, so the card is blank for `onboarding_staff`. Widen to `is_staff(auth.uid())`.
- No new tables or columns. Colors via existing tokens.

## Verification

1. Pause an event across a rung day, let it lapse, run the job: assert exactly one action (`pause_lapsed`), no rung email; assert the rung fires on the following run.
2. Seed a 48h-backdated event: assert the two deadlines differ and match the job's evaluation; assert a same-day event renders the identical two-row layout.
3. Force a throw inside `deliverNotice`: assert attempts incremented, error recorded, console shows "Failing to send" with that text.
4. Fire a rung under `nowOverride`, then a real run: default view shows only the evidence row; summary excludes the override.
5. Grant an extension: next run emits no `extension_prompt` for that event.
6. Attempt an 8-day pause: `P0064` surfaces in the dialog.
7. Health card renders the last real `eld_cron_runs` row and flips to the staleness banner against a synthetic old row.
8. Confirm no new query touches `rods_days` / `rods_events` and no migration adds a policy to either.
