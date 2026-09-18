# Pass report — 2026-09-18 1358 UTC — restrictive tenant policy: `contractor_pay_setup`

BUILD MODE. Money-shaped pass on the last driver-pay table before `user_roles`.

## Step 1 — THE TABLE

Live policies before this pass (all PERMISSIVE, roles `{public}`), classified:

| policy | cmd | class | predicate |
|---|---|---|---|
| Operators can insert their own pay setup | INSERT | OWNERSHIP | `EXISTS (SELECT 1 FROM operators WHERE operators.id = contractor_pay_setup.operator_id AND operators.user_id = auth.uid())` |
| Operators can update their own pay setup | UPDATE | OWNERSHIP | same |
| Operators can view their own pay setup | SELECT | OWNERSHIP | same |
| Staff can update all pay setups | UPDATE | ROLE-ONLY | `is_staff(auth.uid())` |
| Staff can view all pay setups | SELECT | ROLE-ONLY | `is_staff(auth.uid())` |
| Truck owner can view linked pay setup | SELECT | OWNERSHIP | `is_truck_owner_for_operator(auth.uid(), operator_id)` |

No COMPANY policy. No SERVICE policy.

`company_id`: NOT NULL, **zero nulls**, 56 rows. Stamp trigger
`aa_stamp_tenant_company_id` → `stamp_tenant_company_id()`:

```
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.contractor_pay_setup
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_company_id()
```

**BEFORE INSERT only** — unlike the other batches this stamp does not fire on
UPDATE. That matters in Step 5.

Other triggers: `enforce_contractor_pay_setup_self_update`,
`notify_owner_on_pay_setup_submitted`, `update_updated_at_column`.

Readers and writers:

- DRIVER-FACING — `src/components/operator/ContractorPaySetup.tsx` (249-253 read,
  312-344 submit), lazy-loaded by `src/pages/operator/OperatorPortal.tsx:53`,
  displayed at 157, 837-838, 967-976, 1823, 2134.
- STAFF-FACING — `src/pages/staff/OperatorDetailPanel.tsx:912-916`,
  `src/pages/staff/PipelineDashboard.tsx:1051,1154`.
- EDGE — `reset-demo-driver/index.ts:27`, `delete-user-account/index.ts:144`,
  `notify-pay-setup-submitted/index.ts:26-49`.
- SUBSCRIPTIONS — none. The table is absent from `supabase_realtime` and from
  every `.channel(` binding in source.

Recorded because the brief expected it: the pay PERCENTAGE and the deduction
settings are **not** on this table and never were. They live in `pay_policies`.
This screen carries contractor identity, acknowledgments and submission state.

## Step 2 — BEFORE

Counts, REST API, one sign-in per identity:

```
--- contractor_pay_setup counts [before] ---
marcus: 56   leo: 56   mae: 56   steve: 1   donald: 1
```

Grouping in place of a pay type (no `pay_type` column exists; `contractor_type`
is the grouping): `business 18`, `individual 38`.

Steve's own screen (`ContractorPaySetup.tsx:249-253`, as Steve) and the staff
detail panel for the same driver (`OperatorDetailPanel.tsx:912-916`, as Mae),
both returning the identical row:

```json
{ "business_name": null,
  "company_id": "6b54d0e6-8743-4284-b55b-8cd094b093dd",
  "contractor_type": "individual",
  "deposit_overview_acknowledged": true,
  "email": "stevefigueroa2026@gmail.com",
  "legal_first_name": "Steve", "legal_last_name": "Figueroa",
  "payroll_calendar_acknowledged": true,
  "phone": "(619) 936-1762",
  "submitted_at": "2026-04-24T02:57:17.081+00:00",
  "terms_accepted": true,
  "terms_accepted_at": "2026-04-24T02:57:17.081+00:00",
  "updated_at": "2026-04-24T02:57:17.081+00:00",
  "void_check_file_name": null, "w9_file_name": null }
```

## Step 3 — MIGRATION

`drizzle/migrations/0011_restrictive_tenant_policy_contractor_pay_setup.sql`, the
pilot's exact policy and nothing else:

```sql
CREATE POLICY tenant_isolation ON public.contractor_pay_setup
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

No function created or replaced, so no EXECUTE grant changed. Moved to
`RESTRICTIVE_DONE` in `src/test/tenancy-resolver.test.ts`.

## Step 4 — AFTER

```
--- contractor_pay_setup counts [after] ---
marcus: 56   leo: 56   mae: 56   steve: 1   donald: 1
===DIFF===
screens identical
counts identical
```

Grouping after: `business 18`, `individual 38`. Nothing changed.

## Step 5 — PROBES, in a transaction that raises, on rows the probe created

Operators that had no pay setup row were used, so no real row was touched.

```
BLANK INSERT stamped   -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
SPOOFED INSERT stored  -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
ERROR:  PROBE TRANSACTION DELIBERATELY ABORTED
residue: 0
```

The spoofed insert presented `00000000-0000-4000-8000-000000000099`; the real
carrier was stored, because the BEFORE INSERT stamp rewrites the value before the
policy is evaluated.

REFUSAL — **not demonstrable, stated up front as the brief asked, and confirmed by
attempting it.** On INSERT the stamp makes a foreign company impossible to
present. On UPDATE the stamp does *not* fire, so in principle WITH CHECK would
refuse — but it could not be shown: the psql role is denied UPDATE on the table
outright,

```
ERROR:  permission denied for table contractor_pay_setup
residue: 0
```

and no signed-in identity can create a row of its own to move (the INSERT policy
admits only the operator himself), while the widened probe rule forbids updating a
real row. Recorded as a gap, together with the same gap from the realtime batch
and the single-carrier limitation (one `carrier_profile` row exists).

## Step 6 — SUITES touching this table or driver pay

One run of thirteen files — `operator-settlement-isolation`,
`settlement-foundation`, `operator-pay-exposure`, `sharedPayPct`,
`sharedPayPctCallers`, `shared-pay-percentage-source-guard`, `settlementEngine`,
`settlementRun`, `dispatchSettlement`, `dispatchSettlementRun`,
`dispatch-settlement-schema`, `dispatch-settlement-screen`, `grant-parity-live`:

```
 Test Files  13 passed (13)
      Tests  235 passed (235)
   Duration  45.12s
```

`grant-parity-live` ran ungated and passed 3/3, as the 2230 pass left it.

## Step 7 — GUARD

Failing first on the stale list:

```
 FAIL  src/test/tenancy-resolver.test.ts > restrictive tenant policy — exact shape, or declared pending > every company_id table either carries tenant_isolation or is pending
AssertionError: stale PENDING_RESTRICTIVE entries: expected [ Array(1) ] to deeply equal []
+   "contractor_pay_setup: declared pending but already carries a restrictive policy",
      Tests  1 failed | 2 passed | 122 skipped (125)
```

Restored green after the move:

```
 Test Files  1 passed (1)
      Tests  125 passed (125)
     Errors  1 error      (Error: [vitest-worker]: Timeout calling "onTaskUpdate")
```

Live totals: **718 policies in `public`, 158 RESTRICTIVE**. Linter **170** issues,
unchanged.

`user_roles` is now the ONLY company-bearing table left pending. It goes last
because every other policy in the database resolves through `has_role()` /
`is_staff()`, which read it — a restrictive predicate there changes the meaning of
every other table's rules at once, so it needs its own pass with its own
before/after evidence.

## Step 8 — RECORD AND LIST

`docs/tms-build-status.md`: new entry "2026-09-18 1358 UTC — restrictive tenant
policy: `contractor_pay_setup` (money-shaped)", with the policy classification,
both sets of counts, both screens' figures, the probes, the guard, and the owner's
check. `docs/tms-wish-list.md` line 41 rollout line rewritten: 158 done,
`user_roles` the only one pending, 718/158 totals, linter 170.

OWNER CHECK, 2026-09-18, recorded: the owner repeated the live-update test AFTER
the realtime batch — Driver Hub in one window, a driver's dispatch status changed
in another — and the hub updated without a refresh. PASSED.

## Step 9 — FULL SUITE and TYPECHECK

```
 Test Files  3 failed | 199 passed | 2 skipped (204)
      Tests  3 failed | 2018 passed | 16 skipped (2037)
     Errors  2 errors
   Duration  412.35s
```

All three failures were pooler connection contention, not assertions — identical
cause in each:

```
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (35.160.209.8), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
```

in `accessorial-adjustment-schema.test.ts:52`, `billing-schema.test.ts:33` and
`definer-live-catalog.test.ts:47`. Re-run alone:

```
 Test Files  3 passed (3)
      Tests  107 passed (107)
     Errors  1 error      (Error: [vitest-worker]: Timeout calling "onTaskUpdate")
   Duration  65.16s
```

The two "Errors" in the full run and the one here are the known reporter
`onTaskUpdate` timeouts, not test failures.

Typecheck: `npx tsgo -p tsconfig.app.json --noEmit` → `TYPECHECK CLEAN`.

## FINAL — files and commit

`git status --porcelain` is empty and `git commit` is not available to the agent:
the platform commits each change as it is made. Files authored by THIS pass:

- `drizzle/migrations/0011_restrictive_tenant_policy_contractor_pay_setup.sql`
  (+ `drizzle/migrations/meta/0011_snapshot.json`, `meta/_journal.json`)
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- `src/test/tenancy-resolver.test.ts` (`contractor_pay_setup` moved into
  `RESTRICTIVE_DONE` with its comment block; `PENDING_RESTRICTIVE` now
  `['user_roles']` with the reason it is last)
- `docs/tms-build-status.md` (entry "2026-09-18 1358 UTC")
- `docs/tms-wish-list.md` (rollout line 41)
- `docs/passes/2026-09-18-1358-contractor-pay-setup.md` (this report)

## Gaps carried forward

1. Cross-carrier refusal is not demonstrated anywhere, including here — one
   `carrier_profile` row exists and the stamps rewrite INSERTs.
2. `enforce_remittance_immutability` and `enforce_accessorial_adjustment_immutability`
   still never observed refusing anything (no remittance rows; no UPDATE path).
3. Eight screens subscribe to tables the database does not publish (pre-existing,
   recorded in the realtime batch).
