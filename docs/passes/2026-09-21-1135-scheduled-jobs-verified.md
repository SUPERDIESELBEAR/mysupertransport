# 2026-09-21 11:35 UTC — did the six pending scheduled jobs actually run and get accepted?

Read-only pass. No code, no migrations, no data changes. **Full suite deliberately
skipped — this pass is docs only.** Read first:
`docs/passes/2026-09-21-0105-cron-secret-repair.md` (job table, the six unproven jobs,
Step 5's expectations) and `docs/passes/2026-09-21-0118-pending-document-purge.md`
(the twelve documents).

## CONTRADICTION WITH THE LIVE SYSTEM — read this first

The prompt asks what the **15:00 UTC** jobs produced. **They have not run yet.** The
repair landed at 00:32 UTC today and the clock is 11:29 UTC, so jobs 6
(`check-cert-expiry`), 7 (`check-inspection-expiry`) and 8 (`notify-idle-operators`)
have had **no scheduled run since the repair** — `cron.job_run_details` has zero rows
for jobids 6, 7 and 8 after 00:30 UTC. Their first post-repair run is today at
15:00 UTC. Nothing about them can be proven in this pass, and nothing was triggered by
hand (each would mail real drivers and real staff).

Three of the six therefore remain unproven for a reason that is simply the clock, not
a fault. The other three (9, 10, 15) all ran, each exactly once.

## STEP 1 — the responses

`net._http_response` retention is narrower than the six hours assumed: the **oldest
row alive is 2026-09-21 05:30:00 UTC** (367 rows, newest 11:29:00). Everything before
05:30 has aged out.

| jobid | job | scheduled run since repair | response |
| --- | --- | --- | --- |
| 6 | `daily-cert-expiry-check` | **none yet** (next 15:00 UTC) | n/a — has not run |
| 7 | `daily-inspection-expiry-check` | **none yet** (next 15:00 UTC) | n/a — has not run |
| 8 | `notify-idle-operators-daily` | **none yet** (next 15:00 UTC) | n/a — has not run |
| 9 | `rollover-dispatch-status-cdt` | 03:15… no — **05:05:00 UTC**, once | **aged out** (before 05:30) |
| 10 | `rollover-dispatch-status-cst` | **06:05:00 UTC**, once | **200** `{"today":"2026-09-21","checked":34,"promoted":0,"skipped":34,"errors":[]}` |
| 15 | `purge-deleted-operator-documents-daily` | **03:15:00 UTC**, once | **aged out** (before 05:30) |

Runs that cannot be shown, plainly: **job 15 at 03:15 and job 9 at 05:05** — both fired
(`cron.job_run_details`, one row each, `succeeded`) but their HTTP responses had already
been pruned by the time of this pass. Job 10 is the same function as job 9 with the same
rewritten command, and it returned **200**, so the repair demonstrably took for
`rollover-dispatch-status`. No `403` or `401` appears anywhere in retention — the only
non-broadcast bodies alive are six hourly `pei-auto-cadence` 200s and the job 10 200.
Job 13 (`dispatch-scheduled-broadcasts`) is 200 `{"processed":0,"results":[]}` on every
one of its 360 minutes in the window.

## STEP 2 — the effects, which do not age out

### Job 15, the document purge (03:15 UTC) — PROVEN, and complete

`audit_log where action = 'document_purged'`: **exactly 12 rows**, all written
2026-09-21 **03:15:03.32 → 03:15:07.87 UTC**, `entity_type = 'operator'`. That table had
no `document_purged` row before today. The twelve file names match the twelve identified
in the 0118 pass one for one, including Robert Sargent's unreplaced `other` file
`1780497056730915741476265045688.jpg`.

Both counts asked for:

- **`operator_documents`** — rows still soft-deleted: **6**. Rows past the 30-day
  cutoff: **0** (`count(*) filter (where deleted_at < now() - interval '30 days')`).
  Before the run there were 18 and 12.
- **Storage** — of the 12 object paths taken from each purge row's `file_url`,
  **0 remain** in `storage.objects` for bucket `operator-documents`
  (`join storage.objects on name = path`; bucket total 1,438 objects). Row and file
  both gone, in the order the function intends.

The other six soft-deleted rows are still present, as they should be — deleted
2026-08-25 → 2026-09-01, all `truck_title` (4) and `form_2290` (2), none yet 30 days
old. They become eligible 2026-09-24 → 2026-10-01.

### Jobs 9 and 10, the dispatch rollover (05:05 / 06:05 UTC) — ACCEPTED, EFFECT NOT ACHIEVED

The call was accepted (200 above). The board was **not** corrected.

- `active_dispatch`: newest `updated_at` is **2026-09-20 01:16:17 UTC**;
  rows updated since 2026-09-21 00:00 UTC: **0** (81 rows total).
- `dispatch_status_history` for 2026-09-21: **no rows at all** — neither the function's
  explicit "Daily rollover from calendar" note nor a trigger row.
- Recomputing the function's own comparison in SQL (latest `dispatch_daily_log` per
  operator, excluding `excluded_from_dispatch` and `is_parked`, joined to
  `active_dispatch`): **45 eligible, 37 matching, 8 still drifted.**

| Driver | Latest log | Log says | Board says | Board last touched |
| --- | --- | --- | --- | --- |
| Hafeezullah Awal Khan | 2026-08-18 | truck_down | not_dispatched | 2026-08-19 |
| David Wambolt | 2026-06-17 | dispatched | not_dispatched | 2026-06-17 |
| Jocquan Scott | 2026-06-13 | home | not_dispatched | 2026-06-11 |
| Gehazi Irwin | 2026-06-11 | home | not_dispatched | 2026-06-11 |
| Edward Williams | 2026-06-11 | home | not_dispatched | 2026-06-11 |
| Tyler Walls | 2026-06-11 | home | not_dispatched | 2026-06-11 |
| Johnathan McMillan | 2026-06-10 | home | not_dispatched | 2026-06-11 |
| Christopher Hickman | 2026-06-05 | truck_down | not_dispatched | 2026-06-11 |

Why, and it is in the response body itself: the function reads the log with
`.lte('log_date', today)` and **no explicit limit**, so PostgREST caps it at its default
**1,000 rows**. `dispatch_daily_log` holds **6,021 rows** (newest `log_date`
2026-09-21). The newest 1,000 rows cover only **34 distinct operators** — exactly the
`"checked":34` in the body — and every one of those 34 already matched, hence
`"promoted":0`. The eight drifted drivers all have their latest log in **June or August**,
far outside the newest 1,000 rows, so the job never sees them and never will. This is a
pre-existing defect in the function, not damage from the repair: the gate is now open and
the function runs, it simply cannot reach stale drivers.

The 0105 pass counted **nine** drifted; the live count is **eight**. No `active_dispatch`
row changed today, so the difference came from the log side — one driver gained a newer
`dispatch_daily_log` entry that happens to match his live status. Nothing was written by
a job to close that one.

### Jobs 6, 7, 8 (15:00 UTC) — no run yet, nothing produced

- **`notify-idle-operators`**: `notifications` contains **no `operator_idle` row at
  all**, today or ever. The backlog is unchanged at **72** idle onboarding records with
  an assigned staff member (`onboarding_status` joined to `operators`,
  `fully_onboarded = false`, `updated_at` older than 14 days,
  `assigned_onboarding_staff` not null). Nothing to report about skipping duplicates
  until the job runs.
- **`check-cert-expiry` / `check-inspection-expiry`**: both mail through the unlogged
  `sendEmail` path and write no row, so even after 15:00 UTC their only evidence is the
  `net._http_response` status — which must be read before it ages out (retention today
  proved to be ~6 h, so before roughly 21:00 UTC). The separate ungated
  `cron-cert-reminders` job is unaffected: `cert_reminders` still holds **54** rows,
  newest `sent_at` 2026-09-19 15:00:04.

### The other jobs, for completeness

`cron.job` holds twelve active rows, all `active = true`, unchanged schedules. Job 13
(minute broadcasts) is accepted every minute and has no work (`processed: 0` × 360);
job 106 (`pei-auto-cadence`) is accepted hourly, `sent: 0` every hour.

## STEP 3 — the table

| Job | Schedule | Last response | Effect observed | Proven |
| --- | --- | --- | --- | --- |
| 6 `check-cert-expiry` | 0 15 * * * | has not run since repair | none possible yet | **cannot tell** |
| 7 `check-inspection-expiry` | 0 15 * * * | has not run since repair | none possible yet | **cannot tell** |
| 8 `notify-idle-operators` | 0 15 * * * | has not run since repair | zero `operator_idle` notifications; 72 idle records waiting | **cannot tell** |
| 9 `rollover-dispatch-status-cdt` | 5 5 * * * | fired 05:05, body aged out | no `active_dispatch` or history write; 8 of 45 still drifted | **no** (accepted per job 10; work not done) |
| 10 `rollover-dispatch-status-cst` | 5 6 * * * | **200** `checked 34, promoted 0, skipped 34` | same — only 34 of 45 operators reachable | **accepted yes, effect no** |
| 15 `purge-deleted-operator-documents` | 15 3 * * * | fired 03:15, body aged out | 12 rows and 12 storage objects gone; 12 `document_purged` audit rows; 6 ineligible rows intact | **yes** |

What would settle each "cannot tell", and when:

- **6, 7** — read `net._http_response` between 15:00 and about 20:00 UTC **today**; a 200
  settles acceptance. Their work leaves no row, so acceptance is the only available
  proof unless the functions are changed to log their sends.
- **8** — after 15:00 UTC today, count `notifications where type = 'operator_idle'`. A
  first run should surface up to 72 coordinator nudges; the 24-hour dedup then keeps the
  second day quiet.
- **9 / 10** — the drift for those eight drivers will not clear on any future run while
  the 1,000-row cap stands. Settling it needs a paged or per-operator read in
  `rollover-dispatch-status` — a function change, for its own pass.

## STEP 4 — anything unexpected

Four things, none of them acted on:

1. **The rollover job is accepted but cannot do its job.** The 1,000-row PostgREST cap
   means the sweep silently covers only the 34 most recently logged operators. The 0105
   pass's promise that "the next 05:05 UTC run corrects all nine by itself" was wrong,
   and is corrected here. Eight drivers are still shown on the board as `not_dispatched`
   while their log says `home`, `dispatched` or `truck_down` — three of them since June.
2. **Response retention is shorter than recorded.** The oldest surviving row is 05:30
   for an 11:29 reading: about **6 hours**, which means a 03:15 job can never be proven
   from `net._http_response` during business hours. The proposed reconciler in the 0105
   pass must record `request_id` per run, or nightly jobs stay unprovable.
3. **No mail went anywhere today.** `email_send_log` has no row since 2026-09-19
   14:09 UTC. Nothing was sent to a wrong recipient, and no job mailed a real person in
   this window. `notifications` since 2026-09-19: 9 `pwa_install` (job 12, 14:00 UTC on
   2026-09-20, ungated and unaffected by the repair) and 1 `birthday_anniversary`
   (2026-09-19 15:00) — both to their intended audiences, neither from the six.
4. **No job ran twice.** `cron.job_run_details` after 00:30 UTC has exactly one row each
   for 9, 10 and 15. The purge wrote exactly 12 audit rows and touched exactly the 12
   files named in the 0118 pass — nothing outside that set, and the six ineligible rows
   are untouched.

## Sources

`cron.job`, `cron.job_run_details`, `net._http_response`, `audit_log`
(`action = 'document_purged'`), `operator_documents`, `storage.objects`,
`active_dispatch`, `dispatch_status_history`, `dispatch_daily_log`, `operators`,
`applications`, `onboarding_status`, `notifications`, `cert_reminders`,
`email_send_log`, and `supabase/functions/rollover-dispatch-status/index.ts` for the
unbounded read.

## Files this pass authored

- `docs/passes/2026-09-21-1135-scheduled-jobs-verified.md` (this report)
- `docs/tms-build-status.md` (dated entry appended)
- `docs/tms-wish-list.md` (verification item left open with exactly what remains; new
  rollover-cap item added)
