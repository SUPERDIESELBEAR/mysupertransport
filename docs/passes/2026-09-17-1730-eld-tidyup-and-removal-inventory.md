# Pass report — 2026-09-17 1730 UTC — ELD tidy-up and removal inventory

Immutable. Do not edit after commit.

## Scope

Finish the bookkeeping the stopped ELD turn left open, and inventory the
ELD/RODS feature so the owner can decide whether to keep, hide or remove it.
No ELD Playwright cases were run; the batch was not resumed. Nothing in the
database, app code or edge functions changed this pass.

## PART A — the stopped turn

**A1 — 0003 is live.** 658 policies in `public`, 98 RESTRICTIVE, 98 distinct
tables carrying `tenant_isolation` (was 88). All ten target tables carry the
exact policy. `drizzle.__drizzle_migrations` row `id=4`, hash
`2c9b7c9e2466d20a819baa1136e97963d6e74183d1be6f054a8496295b749ef1`,
`created_at = 2026-09-17 16:42:43 UTC`.

**A2 — the `ee993ec0` flag change is unexplained.** No `audit_log` row, no
profile row, no login record accounts for `is_demo` → false or `is_active` →
false on operator `ee993ec0-e0a2-4d0f-aa05-6d22eb931405`. The row reads
`updated_at = 2026-09-17 13:37:42`, `deactivated_at = 2026-07-31 22:59:50`,
`deactivated_by = NULL`. Every audit row naming the operator is a
`rods_day_purged` entry (actor `service_role`) or an onboarding/ICA/insurance
entry by Marcus Mueller between 2026-04-03 and 2026-07-30. The gap stands.

**A3 — the stopped turn's Playwright, reset and purge.** Before and after the
migration: online draft save, certification, offline queue and sync, roadside
render, against demo operator `1fd52882-08a2-48e0-b08a-c24eb9beab21`. The
documented certification defect A was not reproduced. `reset-demo-driver`
reported `rodsDaysPurged = 2`. Residue for that demo driver now: `rods_days` 2,
`rods_events` 4, `eld_malfunction_events` 1, and zero on the other seven target
tables. Left in place; it is `is_demo` data.

**A4 — ledger.** Guard failed first, naming all ten
("`rods_unlock_events`: declared pending but already carries a restrictive
policy" and nine siblings), 1 failed / 121 passed. After moving the ten from
`PENDING_RESTRICTIVE` to `RESTRICTIVE_DONE`: **122 passed**, with the known
`[vitest-worker]: Timeout calling "onTaskUpdate"` reporter error.

**A5 — expected counts, GREEN.** One session per identity; the five sessions
minted in the stopped turn were reused. Service-side totals: blank-log
acknowledgments 1, malfunction events 1, inspection cycles 0, roadside stops 0,
amendments 0, correction requests 3, RODS days 4, divergences 0, RODS events 4,
unlock events 0. Marcus, Leo, Mae each saw exactly those. Steve's and Donald's
admitted rows were computed independently on the service side (per-table
`count(*)` over operators owned by the user, `rods_events` via its `rods_days`
parent): 0 on all ten for both, and both saw 0 on all ten. No mismatch.

**A6 — refusal.** Marcus attempting to move
`eld_malfunction_events.cb14bf82-522d-4f16-ade6-ed96247c1a2a` to company
`11111111-2222-3333-4444-555555555555`:
`HTTP 403, 42501, "new row violates row-level security policy
\"tenant_isolation\" for table \"eld_malfunction_events\""`.
The row still reads `company_id = 6b54d0e6-8743-4284-b55b-8cd094b093dd`. No
residue, nothing to restore.

## PART B — removal inventory

The full inventory (B1 rows and usage, B2 real records, B3 every object by
name, B4 dependants with break severity, B5 the three options and their costs)
is in `docs/tms-build-status.md`, entry "2026-09-17 1730 UTC — the stopped ELD
turn tidied up, and the ELD/RODS removal inventory". Headline facts:

- 27 tables belong to the feature; 14 are empty. Populated: `eld_cron_runs`
  1120, `inspection_documents` 774, `truck_dot_inspections` 105,
  `binder_share_bundles` 8, `inspection_document_versions` 8,
  `eld_device_models` 6, `rods_days` 4, `rods_events` 4,
  `rods_correction_requests` 3, `inspection_binder_order` 2,
  `blank_log_acknowledgments` 1, `eld_malfunction_events` 1,
  `inspection_program_settings` 1.
- Distinct non-demo operators writing duty status in the last 30 days: **0**;
  in the last 90 days: **1**, and that one is `ee993ec0` — the harness operator
  whose `is_demo` flag was flipped without a record (A2).
- No driver who was ever a live SUPERTRANSPORT contractor has any RODS day,
  event, certification, amendment or roadside record.
- ~52 functions, ~69 triggers, 4 cron jobs, 13 edge functions, 3 storage
  buckets, 4 routes, and the whole of `src/lib/eld/`, `src/roadside/`,
  `src/components/eld|inspection|operator/rods|operator/eld|management/eld`.
- The inspection binder is the load-bearing part and is NOT duty-status data:
  `inspection_documents` feeds `v_compliance_items`, MO plate expiry sync and
  the `/inspect/:token` share links, and is fed by `truck_dot_inspections` and
  by onboarding. Any hide or remove must treat it separately.

No recommendation is made. B5 states what each of keep / hide / remove takes,
what it breaks, and what happens to the records found in B2.

## Verification

**Full suite** (last check before this report):

```
 Test Files  1 failed | 201 passed | 2 skipped (204)
      Tests  1 failed | 2015 passed | 15 skipped (2031)
     Errors  2 errors
   Duration  385.86s
```

Both errors are the known `[vitest-worker]: Timeout calling "onTaskUpdate"`.

**Isolated re-run of the one failure** — `src/test/grant-parity-live.test.ts`,
`"no public table admits a role its grants do not"`. It reproduces, and it is a
harness-permission failure, not a product finding:

```
Error: Command failed: psql -At -c select ... from public.grant_parity_report() order by 1
ERROR:  permission denied for function grant_parity_report
```

`psql` connects as `sandbox_exec`, but the function's ACL is
`{postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}` —
the grant names the ref-suffixed role `sandbox_exec_qgxpkcudwjmacrdcyvhj`, which
is not the role the sandbox now uses. The other two tests in that file pass.
Pre-existing and untouched by this pass; fixing it needs a `GRANT EXECUTE ...
TO sandbox_exec` migration, which is outside this pass's permitted changes. It
is now recorded as a verification gap.

`postgrestEmbeds.test.ts`, previously listed as failing (2), passed in this run.

**Typecheck:** clean.

## Files changed since `b6df60c` (this pass and the stopped turn it tidies)

```
 docs/eld-certification-playwright-run.md           |  13 +
 docs/eld-offline-certification.md                  |   8 +
 docs/tms-build-status.md                           | 319 +++++++++++++++++++++
 docs/tms-wish-list.md                              |   8 +-
 drizzle/migrations/0003_restrictive_tenant_policy_eld_batch.sql | 10 +
 drizzle/migrations/meta/0003_snapshot.json         |  18 ++
 drizzle/migrations/meta/_journal.json              |   7 +
 src/test/tenancy-resolver.test.ts                  |  28 +-
```

Plus this report. The first two docs and the migration/journal/snapshot are the
stopped turn's; the status and wish-list edits and the ledger move are this
pass's.

## Contradictions between the prompt and the live system

None. Every claim the prompt made about the stopped turn checked out: 0003 is
live, the ten tables carry the policy, the demo driver exists, and the offline
sync test was not run.
