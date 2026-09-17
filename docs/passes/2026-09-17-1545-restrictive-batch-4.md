# 2026-09-17 15:45 UTC — restrictive tenant policy BATCH 4

Method followed batch 3 (`docs/passes/2026-09-17-1500-restrictive-batch-3.md`).

## Sessions

All five identities were **renewed**: the batch-3 session files under
`/root/sess` no longer existed in this sandbox. One sign-in each for Marcus
Mueller, Leo Wallace, Mae Lauron, Steve Figueroa, Donald Alleyne, reused for
before counts, after counts and the write probes. Steve and Donald required a
**second** sign-in for the browser pass, because the first sign-in had
persisted only their access tokens, not the full session objects the browser
needs. Disclosed, not concealed.

## Step 1 — candidates, live

Batch 3's query, unchanged:

```sql
WITH pol AS (
  SELECT tablename, policyname, coalesce(qual,'')||' '||coalesce(with_check,'') AS pred
  FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE'
), cls AS (
  SELECT tablename, policyname,
    CASE WHEN pred ILIKE '%service_role%' THEN 'SERVICE'
         WHEN pred ILIKE '%company_id%' THEN 'COMPANY'
         WHEN pred ILIKE '%has_role%' OR pred ILIKE '%is_staff%' THEN 'ROLE-ONLY'
         WHEN pred ILIKE '%auth.uid()%' OR pred ILIKE '%is_own_operator%'
           OR pred ILIKE '%is_own_rods_operator%'
           OR pred ILIKE '%is_truck_owner_for_operator%'
           OR pred ILIKE '%is_thread_participant%' THEN 'OWNERSHIP'
         ELSE 'OTHER' END AS class
  FROM pol
), t AS (
  SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='company_id'
)
SELECT cls.tablename,
  count(*) FILTER (WHERE class='OWNERSHIP') AS own,
  count(*) FILTER (WHERE class='OTHER')     AS other
FROM cls JOIN t ON t.table_name = cls.tablename
WHERE cls.tablename NOT IN (
  SELECT tablename FROM pg_policies
  WHERE schemaname='public' AND policyname='tenant_isolation')
GROUP BY cls.tablename
HAVING count(*) FILTER (WHERE class='OWNERSHIP') > 0
   AND count(*) FILTER (WHERE class='OTHER') = 0
ORDER BY 1;
```

51 rows. Two are standing exclusions (`company_members`, `user_roles`), so
**49** eligible candidates.

**Reconciliation with batch 3's "73 pending / 50 remaining".** Live before this
pass: 148 company-bearing tables, 74 carrying `tenant_isolation`, therefore 74
without it. One of those 74 is `company_members`, permanently exempt, which is
exactly the ledger's 73 pending. The "50 remaining" figure counted the same
population under a looser exclusion set; the honest live number of ownership
candidates was 49. Arithmetic explained; no contradiction with the live system.

**Additional exclusion, found in source, absent from pre-check section (h):**
`operators` and `passenger_authorizations` both have live subscriptions in app
code. Excluded from this batch and noted in the ledger comment.

Remainder by group after this batch (59 pending): ELD/RODS —
`blank_log_acknowledgments`, `eld_malfunction_events`, `inspection_cycles`,
`inspection_documents`, `roadside_stops`, `rods_amendments`,
`rods_correction_requests`, `rods_days`, `rods_divergences`, `rods_events`,
`rods_unlock_events`, `truck_dot_inspections`. Realtime — `messages`,
`message_reactions`, `notifications`, `onboarding_status`, `operators`,
`passenger_authorizations`, `operator_documents`, `loads`, `ica_contracts`,
`equipment_assignments`, `driver_uploads`, `dispatch_status_history`,
`onboard_assignment_sheets`, `rate_con_ingest_queue`,
`accessorial_adjustments`, `deductions`. Financial — `invoices`,
`invoice_batches`, `invoice_line_items`, `invoice_number_config`, `payments`,
`settlements`, `settlement_line_items`, `settlement_settings`,
`settlement_withheld_loads`, `dispatch_settlements`,
`dispatch_settlement_line_items`, `factoring_remittances`,
`deduction_installments`, `contractor_pay_setup`, `ar_aging_snapshots`,
`load_charges`, `forecast_loads`, `forecast_expenses`, `forecast_deductions`,
`inspection_program_payments`, `inspection_program_settings`. Token/share —
`share_tokens`, `binder_share_bundles`, `document_short_links`,
`officer_packet_links`, `ica_review_links`, `preview_sessions`. Other —
`carrier_signature_settings`, `message_notification_throttle`,
`unit_number_config`, `user_roles`, plus `company_members` exempt.

## Step 2/3 — the batch and its counts

14 tables. Visible-row tables first: `dispatch_daily_log` (5,962 rows),
`lease_terminations` (37); then the empty twelve
(`driver_staff_contact_suppressions`, `ica_amendment_units`, `ica_amendments`,
`message_threads`, `owner_transfers`, `pandadoc_documents`,
`service_resource_bookmarks`, `staff_help_messages`, `staff_help_threads`,
`staff_messaging_settings`, `thread_participants`, `truck_state_permits`).

Counts read through PostgREST with `select=company_id` (`staff_messaging_settings`
has no `id` column). Identical BEFORE and AFTER, all five identities:

| table | Marcus | Leo | Mae | Steve | Donald |
| --- | --- | --- | --- | --- | --- |
| dispatch_daily_log | 5962 | 5962 | 5962 | 121 | 25 |
| lease_terminations | 37 | 37 | 37 | 1 | 0 |
| other twelve | 0 | 0 | 0 | 0 | 0 |

Migration: `drizzle/migrations/0002_restrictive_tenant_policy_batch_4.sql`, the
pilot's exact policy, one per table, nothing else.

Live after: **648 policies, 88 restrictive, 88 tables with `tenant_isolation`**.
Linter total unchanged: **172**.

## Step 4 — writes

No batch table allows a driver or truck owner both INSERT and UPDATE through
the app: `service_resource_bookmarks` gives the driver INSERT and DELETE only,
and `message_threads` / `thread_participants` are written by the
`manage-group-thread` edge function under service role. The refusal therefore
ran as the staff role that can, as batch 3 did.

Driver (Steve) — `service_resource_bookmarks`, Resource Center → Service
Library bookmark (`src/components/service-library/ResourceViewer.tsx:84`):

- insert without `company_id` → `HTTP 201`, stored `6b54d0e6-8743-4284-b55b-8cd094b093dd`
- insert with `company_id` spoofed to `000000ff-0000-0000-0000-0000000000ff` →
  `HTTP 201`, stored `6b54d0e6-…` (spoof overwritten by the stamp)
- update attempt → `HTTP 200 []`, no row changed (no UPDATE policy)
- deletes → both scratch rows removed

Staff (Leo) — `staff_messaging_settings`, Staff Availability card
(`src/components/staff/StaffAvailabilityCard.tsx:150`):

- insert self without `company_id` → `HTTP 201`, stamped `6b54d0e6-…`
- insert with spoofed `company_id` → `HTTP 201`, stored `6b54d0e6-…`
- normal note update → `HTTP 200`
- update `company_id` to a random company → `HTTP 403`

```json
{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy \"tenant_isolation\" for table \"staff_messaging_settings\""}
```

Leo has no DELETE policy on that table, so the scratch row was removed
privileged. Residue check: `staff_messaging_settings` 0 rows,
`service_resource_bookmarks` 0 rows.

Two probe attempts failed on my own bad inputs first and were re-run: a
duplicate-key `23505` (bookmark already existed) and an invalid enum value
(`available`; the enum is `all_drivers | specific_drivers | none`).

## Step 5 — screens

Steve: `/operator/messages` — "No messages yet" (matches `message_threads` 0).
`/operator/resources` — Service Library renders, My Bookmarks empty (matches
0). `/operator/ica` — "ICA Fully Executed", signed May 5 2026, no amendments
(matches `ica_amendments` 0). Donald: `/owner/messages` — same empty state;
`/owner/home` — his day, no load assigned, settlements/fuel/binder tiles. No
console errors, no blank screens.

Staff screens for the owner to glance at: Management → Lease Terminations
(`/management`, `LeaseTerminationsPage`); Staff → Dispatch Daily Log
(`/staff`, `DispatchDailyLogView`); Staff → Help threads (`StaffHelpPanel`);
Management → ICA amendments (`ICAAmendmentsPage`); Management → Owner transfers
(`OwnerTransfersPage`).

## Step 6 — guard

Before the ledger move, `src/test/tenancy-resolver.test.ts` failed with 14
stale entries, e.g. `"truck_state_permits: declared pending but already
carries a restrictive policy"`. After the move: 122 tests passed, plus the
known `[vitest-worker]: Timeout calling "onTaskUpdate"` reporter error.
Ledger sizes now: `RESTRICTIVE_DONE` 88, `PENDING_RESTRICTIVE` 59 (148 − 88 −
1 exempt).

## Step 8 — full suite and typecheck

```
 Test Files  202 passed | 2 skipped (204)
      Tests  2016 passed | 15 skipped (2031)
     Errors  2 errors
   Duration  381.59s
```

Both errors are the same reporter timeout, not assertions:
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"`. No failed test files,
so no `EAUTHQUERY` re-run was needed.

`npx tsgo -p tsconfig.app.json --noEmit` → exit 0.

## Platform-file honesty

The migration tool reported it regenerated `src/integrations/supabase/types.ts`.
Git shows the migration commit `4d3c3cb41` touching only
`drizzle/migrations/0002_restrictive_tenant_policy_batch_4.sql`,
`drizzle/migrations/meta/0002_snapshot.json` and
`drizzle/migrations/meta/_journal.json` — types.ts was **not** changed. Since a
policy-only migration changes no types, nothing is wrong with the schema; the
claim is again inaccurate. Counting the earlier occurrences, this is the
**third** time a platform tool has claimed a regenerated file git does not
show.

Separate noise: a scratch Playwright script was written to the project root by
mistake and picked up by two automatic commits, `7d704b4cc` (added) and
`c9278d00e` (removed). The file was never part of the app and is gone.

## Files changed

`git diff --stat` for the pass (see the closing message for the pasted output
of the final commit).

`git diff --stat 9c7619279^ HEAD` (batch-4 migration commit through this
report), verbatim:

```
 docs/passes/2026-09-17-1545-restrictive-batch-4.md | 206 +++++++++++++++++++++
 docs/tms-build-status.md                           | 104 +++++++++++
 docs/tms-wish-list.md                              |   2 +-
 .../0002_restrictive_tenant_policy_batch_4.sql     |  69 +++++++
 drizzle/migrations/meta/0002_snapshot.json         |  18 ++
 drizzle/migrations/meta/_journal.json              |   7 +
 public/version.json                                |   4 +-
 src/test/tenancy-resolver.test.ts                  |  49 +++--
 8 files changed, 437 insertions(+), 22 deletions(-)
```

`public/version.json` is written by the platform on each deploy, not by this
pass. Everything else is the pass: the migration and its Drizzle metadata, the
ledger move, the two records, and this report.
