# Pass — cron secret repair (2026-09-21 01:05 UTC)

Mode: BUILD. Read first: `docs/passes/2026-09-20-2352-unauthenticated-functions-fixed.md`
(contradiction 2) and `docs/passes/2026-09-21-0019-five-function-gates.md`.
The secret value is never printed here.

---

## STEP 1 — the full picture, before any change

Twelve active rows in `cron.job`, all owned by `postgres`. Gate column quotes the
function's own check. "Refused today" = state BEFORE this pass.

| jobid | job / schedule | function | gate (quoted) | recent outcome | broken since |
|---|---|---|---|---|---|
| 13 | `dispatch-scheduled-broadcasts` — `* * * * *` | dispatch-scheduled-broadcasts | `(cronSecret && headerSecret === cronSecret) \|\| bearer === serviceKey` | **403** `{"error":"Forbidden"}` × 360 in 6 h | ~2026-06-06 (gate added, commit 4d8164e25) |
| 6 | `check-cert-expiry` — `0 15 * * *` | check-cert-expiry | same expression | no 2xx in retention | ~2026-06-06 |
| 7 | `check-inspection-expiry` — `0 15 * * *` | check-inspection-expiry | same expression | no 2xx in retention | ~2026-06-06 |
| 8 | `notify-idle-operators` — `0 15 * * *` | notify-idle-operators | same expression | no 2xx in retention | ~2026-06-06 |
| 9 | `rollover-dispatch-status-cdt` — `5 5 * * *` | rollover-dispatch-status | same expression | no 2xx in retention | ~2026-06-06 (commit 57df03bc6) |
| 10 | `rollover-dispatch-status-cst` — `5 6 * * *` | rollover-dispatch-status | same expression | no 2xx in retention | ~2026-06-06 |
| 15 | `purge-deleted-operator-documents` — `15 3 * * *` | purge-deleted-operator-documents | same expression, refuses with `401 {"error":"unauthorized"}` | no 2xx in retention | ~2026-06-09 (commit c7429a847) |
| 5 | `send-birthday-anniversary` — `0 15 * * *` | send-birthday-anniversary | **no caller check at all** | ran | not broken |
| 12 | `notify-pwa-install` — `0 15 * * *` | notify-pwa-install | **no caller check at all** | ran | not broken |
| 16 | `cron-cert-reminders` — `0 15 * * *` | cron-cert-reminders | **no caller check at all** | ran (`cert_reminders` last row 2026-09-19 15:00:04) | not broken |
| 455 | `send-unread-message-reminders` — `0 15 * * *` | send-unread-message-reminders | **no caller check at all** | ran | not broken |
| 106 | `pei-auto-cadence` — `0 * * * *` | pei-auto-cadence | **no caller check at all** | **200** `{"checked":19,"sent":0,"gfe":0,"paused":0,"skipped":19,"errors":[]}` × 6 in 6 h | not broken |

Retention: `net._http_response` keeps roughly **six hours**. That is why the daily
15:00 jobs show no row at all — their evidence had already aged out; their state is
inferred from the identical gate and the absence of any accepted call.

`cron.job_run_details` reports **succeeded** for every run of every job, including
the 199,191 runs of job 13 — `pg_net` records that the request was queued, not that
it was accepted.

Functions reading a cron secret:
- `CRON_SECRET` — check-cert-expiry, check-inspection-expiry,
  dispatch-scheduled-broadcasts, notify-idle-operators, rollover-dispatch-status,
  purge-deleted-operator-documents (six).
- `ELD_CRON_SECRET` — `process-eld-escalations` only:
  `if (cronSecret && presented && presented === cronSecret) { … isService: true … }`.
- `app.cron_secret` — read by nothing in the function code; it was set nowhere.

Project secrets that actually existed before this pass (nine): `APP_URL`,
`ELD_CRON_SECRET`, `EMAIL_TRACK_SECRET`, `LOVABLE_API_KEY`, `MGMT_API_ACCESS_TOKEN`,
`RATE_CON_INGEST_ADDRESS`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
`SSN_ENCRYPTION_KEY`. `CRON_SECRET` was absent. `SUPABASE_SERVICE_ROLE_KEY` was also
unbound and is now bound.

Broken for roughly **104 days** (2026-06-06 → 2026-09-21) for the five June-6 jobs,
**102 days** for the purge.

---

## STEP 2 — the approach

a) `CRON_SECRET` created as a project secret (64 random hex characters). Value never
   printed, never placed in a job definition.
b) The same value stored in **Vault** (`vault.create_secret`, name `cron_secret`,
   id `bb090b8b-5c47-4ac9-b39b-14562894c870`). Vault was chosen because
   `ALTER DATABASE … SET app.cron_secret` is refused on this project
   (`42501 permission denied`), while `pg_cron` jobs run as `postgres`, which can read
   `vault.decrypted_secrets`. Both copies verified identical by comparing a short
   fingerprint (`a82b5f5a`) of each — the value itself was never displayed.
c) `ELD_CRON_SECRET` left exactly as it was. It is a real project secret and
   `process-eld-escalations` reads it correctly — but **no `cron.job` row calls that
   function** (its schedule was removed; jobid 11 last ran 2026-05-14), so the ELD
   escalation sweep is dormant by earlier decision, not broken by this fault.

---

## STEP 3 — every job updated

All twelve commands were rewritten, including the four that were never refused, so
that no job depends on being ungated. Before (representative, job 13):

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/dispatch-scheduled-broadcasts',
  headers := jsonb_build_object('Content-Type','application/json'),
  body := '{}'::jsonb
);
```

After:

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/dispatch-scheduled-broadcasts',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey','<anon key>',
    'Authorization','Bearer <anon key>',
    'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
  ),
  body := '{}'::jsonb
);
```

The secret is read from Vault **at request time**; it is not stored in `cron.job`.
Targets and bodies were preserved exactly: 5 `{"time":now()}`, 6 `{"time":now()}`,
7 `{"time":now()}`, 8 `{"time":now()}`, 9 `{"source":"cron-cdt","at":now()}`,
10 `{"source":"cron-cst","at":now()}`, 12 `{"mode":"cron"}`, 13 `{}`,
15 `{"source":"pg_cron"}`, 16 `{}`, 106 `{}`, 455 `{"time":now()}`.

No function code was changed in this pass, so nothing needed deploying. The functions
pick up the new project secret at invocation — proven below.

---

## STEP 4 — the proofs

**Job 13, the minute job — the decisive live proof.** Last refusal and first
acceptance, from `net._http_response`:

```
403 {"error":"Forbidden"}              … 00:19:00 → 00:31:00   (13 rows)
200 {"processed":0,"results":[]}       … 00:32:00 → 00:58:00   (22 consecutive rows)
```

This proves all three unknowns at once: the secret exists in the function
environment, `pg_cron` can read it from Vault, and the gate accepts it.

**Job 106, `pei-auto-cadence` — still runs after the change** (it was the only job
working; it must not be left broken):

```
200 {"checked":19,"sent":0,"gfe":0,"paused":0,"skipped":19,"errors":[]}  at 01:00:00.32
```

**Unauthenticated and wrong-secret calls are still refused** — live, per function:

| function | no secret | wrong secret |
|---|---|---|
| check-cert-expiry | `403 {"error":"Forbidden"}` | `403 {"error":"Forbidden"}` |
| check-inspection-expiry | `403 {"error":"Forbidden"}` | `403 {"error":"Forbidden"}` |
| dispatch-scheduled-broadcasts | `403 {"error":"Forbidden"}` | `403 {"error":"Forbidden"}` |
| notify-idle-operators | `403 {"error":"Forbidden"}` | `403 {"error":"Forbidden"}` |
| purge-deleted-operator-documents | `401 {"error":"unauthorized"}` | `401 {"error":"unauthorized"}` |
| rollover-dispatch-status | `403 {"error":"Forbidden"}` | `403 {"error":"Forbidden"}` |

### Jobs deliberately NOT triggered, and what stays unproven

- **6 `check-cert-expiry`, 7 `check-inspection-expiry`, 8 `notify-idle-operators`** —
  a successful run mails real drivers and real staff. Not triggered. Their gate is
  the same expression proven on job 13, reading the same environment variable in the
  same project, but **acceptance is unproven per function** until their own 15:00 UTC
  run. The owner (or the next pass) can confirm with a single query soon after 15:00
  UTC the same day — `net._http_response` keeps only ~6 h, so look before ~21:00 UTC.
- **15 `purge-deleted-operator-documents`** — a successful run permanently deletes
  files. Not triggered; that would also be an unauthorised catch-up (see Step 5).
- **9 / 10 `rollover-dispatch-status`** — a successful run writes live dispatch
  statuses. Triggering it by hand IS the catch-up that Step 5 forbids without
  authorisation. Not triggered; its own 05:05 UTC run will confirm it.
- **5, 12, 16, 455** — these mail drivers and were never refused (no gate); their new
  header changes nothing for them.

**Unproven list, plainly:** jobs 6, 7, 8, 9, 10, 15 — accepted-call proof pending
their own next scheduled run.

---

## STEP 5 — what was missed while they were dead

- **`dispatch-scheduled-broadcasts` (199,191 refused runs): nothing was missed.**
  `operator_broadcasts` contains exactly one row in its entire history, status
  `sent`, 2026-05-06; zero rows are stuck in `scheduled`. The job had no work to do
  on any of those minutes. No catch-up needed. It matters from now on: a scheduled
  broadcast created today would have silently never sent.
- **`purge-deleted-operator-documents`: 12 documents overdue for permanent deletion**
  — 6 `registration`, 3 `form_2290`, 2 `other`, 1 `truck_title`; soft-deleted between
  2026-06-11 and 2026-07-23, all long past the 30-day window. They are still in
  storage. The next 03:15 UTC run will purge them automatically. **Owner
  authorisation is not required for it to happen on schedule, but the owner should
  know 12 files will disappear on the next run.**
- **`rollover-dispatch-status`: the board has drifted for 9 of 45 eligible drivers** —
  their `active_dispatch` status differs from their latest `dispatch_daily_log` entry
  (newest log 2026-09-20). The next 05:05 UTC run corrects all nine by itself. No
  manual catch-up run performed.
- **`check-cert-expiry` and `check-inspection-expiry`: ~104 days of daily 30/60-day
  expiry notices never sent, and which ones cannot be enumerated** — both use the
  unlogged `sendEmail` path, so there is no per-send record to count. Mitigating fact:
  the separate `cron-cert-reminders` job has **no** gate and kept running throughout
  (`cert_reminders` holds 54 rows, last 2026-09-19 15:00:04), so the driver-facing
  45/14/3/0/expired cadence did go out. What was lost is the staff-facing daily sweep.
- **`notify-idle-operators`: ~104 days of coordinator nudges never sent.** 72
  onboarding records are currently idle more than 14 days with an assigned staff
  member — that is the size of the backlog the first successful run will surface.

No catch-up was run.

---

## STEP 6 — the lesson, and the cheapest ongoing check (proposed, not built)

The failure was invisible because `cron.job_run_details` reports `succeeded` for a
request that was merely queued. Success of the *schedule* was mistaken for success of
the *work*.

Two cheap guards, in order of cost:

1. **A repo test, zero runtime cost.** Assert that every row of `cron.job` whose URL
   targets a function reading `CRON_SECRET` sends an `x-cron-secret` header. Catches
   the regression that caused this (a job added or edited without the header) at
   commit time, not 104 days later.
2. **One daily reconciler, ~30 minutes after the 15:00 cluster.** A single job that
   scans `net._http_response` for the previous hour and raises a staff notification
   for any non-2xx. It runs once a day, so it adds no meaningful load, and 15:30 UTC
   sits inside the 6 h retention window for the whole 15:00 group. To cover jobs
   outside that window, have each cron command record its `request_id` in a small
   `job_run_outcomes` table and let the same reconciler join it to
   `net._http_response` while the row still exists.

Neither is built in this pass.

---

## Suite and typecheck

Full suite, `--maxWorkers=4`, summary verbatim:

```
 Test Files  202 passed | 2 skipped (204)
      Tests  2021 passed | 16 skipped (2037)
     Errors  2 errors
   Start at  00:36:20
   Duration  405.49s (transform 5.66s, setup 49.42s, collect 38.82s, tests 787.70s, environment 200.10s, prepare 29.14s)
```

The two errors are the known reporter-side `Timeout calling "onTaskUpdate"` worker
RPC timeouts, not test failures. Typecheck: clean (exit 0).

Deploys: none required — no function source changed. The functions read the new
project secret at invocation, proven by job 13's 403 → 200 transition.

---

## New finding, for its own pass

Five cron-target functions have **no caller check at all**:
`send-birthday-anniversary`, `notify-pwa-install`, `cron-cert-reminders`,
`send-unread-message-reminders`, `pei-auto-cadence`. Anyone holding the publishable
key can make them mail drivers. All five now receive `x-cron-secret`, so gating them
is a function-only change. `notify-pwa-install` needs a dual staff-or-cron gate: it
has three real UI callers (`src/pages/management/ManagementPortal.tsx:889`,
`src/pages/staff/OperatorDetailPanel.tsx:1769`,
`src/components/drivers/DriverRoster.tsx:413`).

## Files this pass authored

- `docs/passes/2026-09-21-0105-cron-secret-repair.md` (this report)
- `docs/tms-build-status.md` (dated entry appended)
- `docs/tms-wish-list.md` (cron item closed; two follow-ups added)

Live changes not in the repo: twelve `cron.job` commands, one project secret, one
Vault secret.
