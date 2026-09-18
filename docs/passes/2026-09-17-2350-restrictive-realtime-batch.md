# PASS — 2026-09-17 2350 UTC — restrictive tenant policy: the LIVE-UPDATING (realtime) batch

Migration `0010_restrictive_tenant_policy_realtime_batch.sql` applied. 19 tables
now carry the restrictive `tenant_isolation` rule. Carrier count: 1.

## Step 0 — required reading

Read before touching anything: `docs/passes/2026-09-17-2330-share-links-and-settings.md`,
the pre-check's section (h) in `docs/passes/2026-09-16-1920-restrictive-policy-precheck.md`,
and batch 4's note that (h) missed `operators` and `passenger_authorizations`.

## Step 1 — the batch, derived two ways

**Way 1 — what the database publishes.**

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

17 tables published; **7** of them were pending: `ica_contracts`,
`message_reactions`, `messages`, `notifications`, `onboarding_status`,
`operator_documents`, `rate_con_ingest_queue`.

**Way 2 — what the app listens for.**

```
rg -n "\.channel\(|postgres_changes" src supabase/functions   # 120 lines
```

**15** pending tables are subscribed: the 7 above plus
`dispatch_status_history`, `driver_uploads`, `equipment_assignments`,
`inspection_documents`, `onboard_assignment_sheets`, `operators`,
`passenger_authorizations`, `truck_dot_inspections`.

**Reconciliation, and the gap that matters.** Those last 8 are subscribed in
source but are NOT in the publication, so those subscriptions cannot receive
events today. Pre-existing; measured before the migration as well as after.

**Two errors in the pre-check's (h):** it lists `loads` (source has no
subscription on `loads` anywhere — the Dispatch Board listens to
`active_dispatch` and `operators`) and `deductions` (nothing subscribes to it).

**The "expected 16" of the brief matched neither derivation**, so the pass
stopped and asked. The owner's answer: run all **19** eligible pending tables —
PENDING_RESTRICTIVE minus `user_roles` (goes last) and `contractor_pay_setup`
(its own money-shaped pass). `loads` and the three forecast tables are included
as the same dispatch surface even though nothing subscribes to them; afterwards
only `contractor_pay_setup` and `user_roles` remain, matching the brief's Step 8.

Row counts, all with `company_id NOT NULL`, zero nulls, and a stamp trigger
(three under different names: `dispatch_status_history` →
`stamp_company_from_operator`, `inspection_documents` →
`stamp_inspection_document_company_id`, `notifications` →
`stamp_company_from_recipient`):

| table | rows | subscribing screen (file) | driver/owner subscribes? |
|---|---|---|---|
| dispatch_status_history | 1510 | OperatorDetailPanel | no |
| driver_uploads | 6 | ComplianceAlertsPanel | no |
| equipment_assignments | 278 | OperatorDetailPanel | no |
| forecast_deductions | 1 | — none | — |
| forecast_expenses | 276 | — none | — |
| forecast_loads | 279 | — none | — |
| ica_contracts | 65 | OperatorPortal | YES (driver) |
| inspection_documents | 777 | InspectionComplianceSummary | no |
| loads | 18 | — none | — |
| message_reactions | 0 | useMessageThread | YES (driver) |
| messages | 10 | StaffPortal, MessagesView, useMessageThread | YES (driver) |
| notifications | 10938 | NotificationBell, StaffPortal, useAssignmentPopupEvents | YES (driver) |
| onboard_assignment_sheets | 13 | OperatorPortal | YES (driver) |
| onboarding_status | 156 | DriverRoster, PipelineDashboard, OperatorPortal | YES (driver) |
| operator_documents | 1184 | OperatorPortal | YES (driver) |
| operators | 156 | DispatchPortal | no |
| passenger_authorizations | 8 | PendingPassengerAuthCard | YES (driver) |
| rate_con_ingest_queue | 5 | RateConInboxPage, useRateConInboxCount | no |
| truck_dot_inspections | 105 | ComplianceAlertsPanel | no |

## Step 2 — before

Counts for all five identities (Marcus, Leo, Mae, Steve, Donald) on all 19
tables, taken through the REST API with one sign-in each, saved to
`/tmp/before-counts.txt`. Screen figures captured with real sessions:

- Dispatch Board (Leo): 35 Total Active, 20 Dispatched, 10 Home, 4 Truck Down,
  1 Not Dispatched; "1 of 35 drivers on the board have loads in SUPERDRIVE";
  "5 loads have a status past Available but no driver assigned"; Claim 1,
  Awaiting paperwork 1, No load 34, Late/due today 1.
- Loads (Leo): AVAILABLE 4, COVERED/DISPATCHED 2, IN TRANSIT 2, DELIVERED 6,
  READY TO INVOICE 0.
- Driver Hub (Leo): 46 drivers.
- Steve's operator home: "No load assigned right now".

## Step 3 — live-update test BEFORE the migration

A real Marcus session subscribed to all 15 subscribed tables with the screens'
own channel and filter shapes, copied from `src/pages/staff/StaffPortal.tsx`,
`src/components/messaging/useMessageThread.ts`,
`src/pages/dispatch/RateConInboxPage.tsx`, `src/components/drivers/DriverRoster.tsx`,
`src/pages/dispatch/DispatchPortal.tsx` and
`src/components/inspection/ComplianceAlertsPanel.tsx`.

**A finding worth keeping.** A SINGLE channel carrying all fifteen bindings
subscribes successfully and then delivers NOTHING — it would have reported a
false negative for every table. One channel per table, as the screens do,
delivers correctly. The measurement was redone that way before any conclusion
was drawn.

Writes were self-created rows only (probe rule): a message from Marcus to
Marcus, a reaction on it, a notification to Marcus, a rate-con queue row, and a
driver upload. Every one deleted afterwards.

BEFORE result:

```
{"dispatch_status_history":0,"driver_uploads":0,"equipment_assignments":0,
 "ica_contracts":0,"inspection_documents":0,"message_reactions":1,"messages":1,
 "notifications":1,"onboard_assignment_sheets":0,"onboarding_status":0,
 "operator_documents":0,"operators":0,"passenger_authorizations":0,
 "rate_con_ingest_queue":1,"truck_dot_inspections":0}
```

Event received: `messages` yes, `message_reactions` yes, `notifications` yes,
`rate_con_ingest_queue` yes. `driver_uploads` NO — a row was written and no
event arrived, which is the unpublished-table gap demonstrated rather than
assumed. The remaining 10 **could not be exercised** and are reported as such:
each needs either a real row (forbidden) or an insert with side effects —
`notify_staff_on_docs_uploaded` on `operator_documents`,
`sync_ica_completion_to_onboarding` on `ica_contracts` — and
`onboarding_status` already holds one row per operator, so a self-created row is
impossible without creating an operator.

## Step 4 — migration

`drizzle/migrations/0010_restrictive_tenant_policy_realtime_batch.sql`, the
pilot's exact shape per table and nothing else:

```sql
CREATE POLICY tenant_isolation ON public.<table> AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id()))
  WITH CHECK (company_id = (SELECT current_company_id()));
```

No function was created or replaced, so no EXECUTE grant was added and none
needed revoking; 0006's and 0008's revokes stand.

## Step 5 — after

Counts re-taken for all five identities:

```
diff /tmp/before-counts.txt /tmp/after-counts.txt
COUNTS IDENTICAL FOR ALL FIVE IDENTITIES
```

(The first after-run differed by exactly the five probe rows still present; they
were deleted and the counts then matched to the character.)

Screens re-captured: every figure in Step 2 identical — Dispatch Board 35/20/10/4/1
and the same two sentences, Loads 4/2/2/6/0, Driver Hub 46 drivers, Steve's home
"No load assigned right now". The only textual difference anywhere was a
relative timestamp ("21 minutes ago" → "34 minutes ago").

Live-update test repeated identically:

```
{"dispatch_status_history":0,"driver_uploads":0,"equipment_assignments":0,
 "ica_contracts":0,"inspection_documents":0,"message_reactions":1,"messages":1,
 "notifications":1,"onboard_assignment_sheets":0,"onboarding_status":0,
 "operator_documents":0,"operators":0,"passenger_authorizations":0,
 "rate_con_ingest_queue":1,"truck_dot_inspections":0}
```

Every subscription that delivered before delivered after.

## Step 6 — write probes, `messages` (Staff portal Messages screen)

Inside a transaction that ROLLED BACK, with a second carrier created and
destroyed inside it (`00000000-0000-4000-8000-000000000099`, "PROBE CARRIER"):

```
          stamped_from_blank
 6b54d0e6-8743-4284-b55b-8cd094b093dd
          stored_after_spoof
 6b54d0e6-8743-4284-b55b-8cd094b093dd
```

- blank insert: the stamp filled the real carrier.
- spoofed insert naming the probe carrier: the real carrier was stored anyway.
- **move-to-another-company: NOT DEMONSTRATED.** `stamp_tenant_company_id` runs
  BEFORE INSERT **OR UPDATE** and rewrites `company_id` unconditionally, so an
  UPDATE can never present a foreign company to the restrictive policy — there
  is nothing left for it to refuse. The psql role has no UPDATE grant on these
  tables and cannot borrow one: `ERROR: permission denied to set role
  "authenticated"`. Only one `carrier_profile` row exists, so no genuine
  cross-carrier row exists to attempt. Recorded as a gap, not a pass.

Residue after both realtime runs and the probes:
`residue msg=0 notif=0 react=0 up=0 queue=0`.

## Step 7 — guard

Failing first on the stale list (`src/test/tenancy-resolver.test.ts:2253`):

```
+   "loads: declared pending but already carries a restrictive policy",
...19 lines...
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 122 skipped (125)
```

Restored (the 19 moved into `RESTRICTIVE_DONE` with a comment block recording
the two-way derivation), green:

```
 Test Files  1 passed (1)
      Tests  3 passed | 122 skipped (125)
```

Live totals: **717 policies in `public`, 157 RESTRICTIVE, 157 named
`tenant_isolation`**; linter **170** issues (unchanged: 2 INFO, 168 WARN).

## Step 8 — record and list

`docs/tms-build-status.md`: new entry "2026-09-17 2350 UTC — restrictive tenant
policy: the LIVE-UPDATING (realtime) batch", with the owner's passed
live-update check, the two-way derivation, both sets of counts and screen
figures, before/after realtime results per table, the write probes and the
refusal gap. Name corrections applied throughout: **Driver Hub**, not Driver
Roster; **Truck Down is set from the Staff portal's Pipeline dashboard**, not the
Dispatch Board.

`docs/tms-wish-list.md`: rollout line rewritten (157 done, 2 pending, 717/157
totals, the 8 subscribed-but-unpublished tables, the two pre-check errors), and
the WAITING ON THE OWNER live-update item struck through as DONE and PASSED.

**What remains:** `contractor_pay_setup` (driver pay data on the driver's own
screens — money-shaped pass of its own) and `user_roles`.

## Step 9 — full suite and typecheck

```
 Test Files  202 passed | 2 skipped (204)
      Tests  2021 passed | 16 skipped (2037)
     Errors  2 errors
   Duration  420.27s
```

The 2 errors are the known reporter noise, `Error: [vitest-worker]: Timeout
calling "onTaskUpdate"`, not test failures; no test failed, so there was no
contention failure to re-run alone.

Typecheck `npx tsgo -p tsconfig.app.json --noEmit`: **TYPECHECK CLEAN**.

## Files changed

The platform commits each change as it is made; `git status --porcelain` is
empty and `git commit` is not available to this agent. Real git output against
the previous pass's commit:

```
$ git diff --stat 6617b8785
 docs/tms-build-status.md                           | 137 ++++++++++++++++++++-
 docs/tms-wish-list.md                              |   4 +-
 ...10_restrictive_tenant_policy_realtime_batch.sql |  61 +++++++++
 drizzle/migrations/meta/0010_snapshot.json         |  18 +++
 drizzle/migrations/meta/_journal.json              |   7 ++
 src/test/tenancy-resolver.test.ts                  |  32 ++---
 6 files changed, 239 insertions(+), 20 deletions(-)
```

Plus this report.

## Honest notes

1. The move-to-another-company refusal is NOT demonstrated for this batch, for
   the structural reason in Step 6. The rule is in place and its shape is
   asserted by the guard, but no live refusal was produced.
2. Ten of the fifteen subscriptions could not be exercised without breaking the
   probe rule or firing staff notifications. They are listed, not assumed.
3. Eight tables are subscribed in source but not published. Nothing in this
   batch caused or fixed that; it is now on the record as a defect to consider.
