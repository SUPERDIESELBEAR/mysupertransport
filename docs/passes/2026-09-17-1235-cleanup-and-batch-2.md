# Pass report — 2026-09-17 12:35 UTC

Cleanup after the suite census, and restrictive tenant policy BATCH 2.

Read first: `docs/passes/2026-09-16-2338-full-suite-census.md`,
`docs/passes/2026-09-16-2300-restrictive-batch-1.md`,
`docs/passes/2026-09-16-1920-restrictive-policy-precheck.md`. Nothing in the
prompt contradicted the live system or the record.

## Step 1 — owner decisions recorded

Recorded in `docs/tms-build-status.md` section (a) of the 2026-09-17 entry:

1. Every pass that changes the database, app code, edge functions or tests runs
   the WHOLE suite once as its last check before the report and quotes the
   summary lines verbatim. Docs-only passes may skip and must say so.
   `EAUTHQUERY` failures are re-run. Failures not caused by the pass are
   reported, not hidden and not fixed unless asked. About 6.5 minutes. Possible
   later revision: DB-free subset per pass plus a weekly full run.
2. Batch 1 screens looked right. No action.
3. Wish list: test-detection item moved from OWNER DECISIONS OWED to RECENTLY
   CLOSED (answered: option 1). New `WAITING ON THE OWNER` section created with
   the live-update check, worded as the owner gave it, pointing at the pilot
   record and pre-check section h.

## Step 2 — cleanups

### (a) dispatch fixtures select SUPERTRANSPORT explicitly

`src/test/dispatch-settlement-schema.test.ts` selects the carrier by USDOT
`2309365` and asserts exactly one matching row, so an absent or duplicated
carrier fails loudly instead of binding to whichever row came first.

```
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

### (b) postgrestEmbeds scanner fixed, not app code

`src/lib/__tests__/postgrestEmbeds.test.ts` now resolves `.from()` calls returned
by helper functions (the two prior failures came from
`src/components/management/InterviewNotesPanel.tsx` via a helper) and tolerates
the single dynamic table expression at
`supabase/functions/_shared/tenancy.ts:42`. A deliberate fixture naming a
nonexistent column failed as intended; after removal the scanner passed 6/6.

### (c) quarterly-inspection draft: superseded, deleted

Live objects confirmed: tables `inspection_cycles`,
`inspection_program_settings`, `inspection_program_payments`; functions
`grant_inspection_grace`, `inspection_grace_used`,
`touch_inspection_program_row`, plus triggers. The draft's
`updated_by = auth.uid()` concern does not apply: no tested `*_by` column on
those tables is a `profiles` FK. `inspection_cycles` foreign keys are only
`company_id → carrier_profile`, `inspection_id → truck_dot_inspections`,
`operator_id → operators`, and `PROFILE_FK_COLUMNS` in the test excludes it.

`.lovable/drafts/` contained exactly ONE SQL file — the quarterly inspection
migration. Its directory was deleted. `actor-stamp-fk.test.ts` then passed 16/16.

## Step 3 — BATCH 2

Candidates were re-derived live from `pg_policies`: tables in
`PENDING_RESTRICTIVE` where EVERY permissive policy admitting `authenticated` is
ROLE-ONLY or SERVICE, excluding realtime tables (pre-check section h), financial
tables, `user_roles` / `company_members`, token/share tables, and the two tables
with no policies (`document_short_links`, `message_notification_throttle`).

The result was exactly batch 1's 20-table empty remainder, as expected:

`broker_notes`, `cash_advances`, `company_documents`, `detention_claims`,
`dispatch_deductions`, `dispatch_settlement_rates_history`, `document_send_log`,
`eld_devices`, `eld_extension_requests`, `eld_malfunction_notifications`,
`eld_sync_alerts`, `pay_policy_assignments`, `rm_deposit_transactions`,
`rm_deposits`, `roadside_stop_documents`, `roadside_stop_violations`,
`settlement_settings_history`, `staff_email_overrides`, `truck_plate_history`,
`vacant_units`.

All twenty are EMPTY.

### The policy

One per table, permissive policies untouched:

```sql
CREATE POLICY tenant_isolation ON public.<table>
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

Applied as `drizzle/migrations/0000_restrictive_tenant_policy_batch_2.sql`.

### Counts

Real sessions (Lovable `auth-session`, PostgREST, `Prefer: count=exact`) for
Marcus Mueller (owner), Leo Wallace (dispatcher), Mae Lauron
(onboarding_staff), Steve Figueroa (driver), Donald Alleyne (truck owner).
BEFORE and AFTER were identical: **zero on every table for every identity**.

THIS PROVES LITTLE. Every table is empty, so an unchanged zero shows only that
nothing broke; it cannot show that a visible row stayed visible. The write probe
is the evidence that the predicate works.

Donald Alleyne's id was corrected to `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`
after a first lookup returned `user_not_found`; two lookups used wrong column
names before `truck_owners.legal_first_name / legal_last_name / email`.

Direct service-role counts were not taken: `psql` refused with
`ERROR: permission denied to set role "service_role"` (same as batch 1).

### Write probe

Live path: `src/lib/brokerRelationship.ts` — broker detail notes, `broker_notes`.
As Leo Wallace:

- insert with NO `company_id` → server-stamped
  `6b54d0e6-8743-4284-b55b-8cd094b093dd`
- insert with a SPOOFED `company_id` → overwritten with the real company
- normal update → succeeded
- update naming a random company → HTTP 403
  `{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy \"tenant_isolation\" for table \"broker_notes\""}`
- cleanup → residue count `0`

Other live writers for batch tables: settlement paths (`rm_deposits`,
`rm_deposit_transactions`, `cash_advances`, `dispatch_deductions`,
`settlement_settings_history`, `dispatch_settlement_rates_history`), detention
claims, ELD device/extension/notification/sync-alert paths, roadside stop
documents and violations, per-carrier settings (`staff_email_overrides`,
`pay_policy_assignments`), fleet paths (`truck_plate_history`, `vacant_units`),
`company_documents`, `document_send_log`.

### Ledger and guard

`src/test/tenancy-resolver.test.ts`: all 20 moved from `PENDING_RESTRICTIVE` to
`RESTRICTIVE_DONE` — **49 done, 98 pending**.

Deliberate failure: `zz_stale_probe` added to `RESTRICTIVE_DONE`:

```
AssertionError: zz_stale_probe: no restrictive policy: expected [ Array(1) ] to deeply equal []
```

Restored byte-identically (MD5 `e219fb122e5a9c8a529188b166dff562`) and green.

### Counts after

Public policies 589 → **609**; restrictive 29 → **49**. Linter total unchanged
at **172** (4 RLS-no-policy, 3 extension-in-public, 31 anon definer, 133
authenticated definer, 1 leaked-password).

## Step 4 — whole suite, and the one failure this pass caused

First full run (`npx vitest run`), 370.86s:

```
 Test Files  1 failed | 201 passed | 2 skipped (204)
      Tests  1 failed | 2009 passed | 15 skipped (2025)
     Errors  2 errors
```

The failure was CAUSED BY THIS PASS:

```
FAIL  src/test/settlement-foundation.test.ts > settlement foundation — live schema > settlement data is closed to operators except their own settlement rows
AssertionError: expected [ …(3) ] to deeply equal []
+   "cash_advances.tenant_isolation",
+   "rm_deposit_transactions.tenant_isolation",
+   "rm_deposits.tenant_isolation",
```

The three scans in that test read `pg_policies` without filtering `permissive`,
so a RESTRICTIVE policy was counted as an OPEN DOOR. A restrictive policy is the
opposite of a door — it ANDs with the permissive set and can only REMOVE rows.
All three scans now carry `and permissive = 'PERMISSIVE'`, with a comment naming
this pass.

This is the SECOND occurrence of the same confusion: `grant_parity_report()`
needed the identical narrowing on 2026-09-16 during batch 1. Recorded as a rule:
any check that enumerates policies to prove data is CLOSED must filter to
permissive policies, or every future restrictive batch breaks it.

The narrowed scan was proven to STILL CATCH — adding `broker_notes` to its table
list produced:

```
+   "broker_notes.broker_notes_author_delete",
+   "broker_notes.broker_notes_author_update",
+   "broker_notes.broker_notes_staff_insert",
+   "broker_notes.broker_notes_staff_select",
```

then the file was restored byte-identically (MD5
`11a5eeca3d3014bd03133cc249369a75`) and passed 28/28.

### Final run (last check, after all edits)

`npx tsgo -p tsconfig.app.json --noEmit` → clean (`TYPECHECK_OK`).

`npx vitest run`, 385.19s:

```
 Test Files  1 failed | 201 passed | 2 skipped (204)
      Tests  1 failed | 2009 passed | 15 skipped (2025)
     Errors  2 errors
```

The one failure was an `EAUTHQUERY` pooler timeout, re-run per the owner's rule:

```
FAIL  src/test/billing-schema.test.ts > billing — exactly one writer > create_invoice is the only invoice writer, and the allocator serves only it
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
```

Re-run: `npx vitest run src/test/billing-schema.test.ts` →
`Test Files  1 passed (1)`, `Tests  36 passed (36)`.

Both unhandled errors were the pre-existing worker RPC timeout:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

The `postgrestEmbeds` (2) and `actor-stamp-fk` (1) failures recorded by the
previous pass are GONE — both were fixed in step 2.

## Step 5 — files changed

- `drizzle/migrations/0000_restrictive_tenant_policy_batch_2.sql` (new, applied)
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- `src/test/tenancy-resolver.test.ts` (ledger: 20 tables moved)
- `src/test/settlement-foundation.test.ts` (three scans narrowed to permissive)
- `src/test/dispatch-settlement-schema.test.ts` (explicit USDOT fixture)
- `src/lib/__tests__/postgrestEmbeds.test.ts` (scanner follows helper `.from()`)
- `.lovable/drafts/var_01m289esxfeqxb6s6b4g81wr1p/migrations/20260911140000_quarterly_inspection_program.sql` (deleted)
- `docs/tms-build-status.md`, `docs/tms-wish-list.md`, this report

## Limits of this pass

- One carrier exists. Cross-carrier invisibility remains undemonstrated.
- Twenty empty tables: the predicate is proven only by the `broker_notes` write
  probe, not by any read that lost a row.
- Service-role counts unavailable from the sandbox.

## Prompt completeness

The final prompt line was complete, not truncated.
