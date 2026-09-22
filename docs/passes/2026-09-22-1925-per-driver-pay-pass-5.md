# Per-driver pay — Pass 5 of 5: screens complete

Date: 2026-09-22 19:25 UTC
Mode: BUILD MODE, design-only where requested. No real driver's rate and no real company rate was changed.

## What this pass authored

- `src/components/staff/LinehaulPayCard.tsx`
- `src/components/management/CompanyPayPolicySettings.tsx`
- `src/lib/payRatePresentation.ts`
- `src/lib/operatorLinehaulPct.ts`
- `src/lib/payPolicyVersion.ts`
- `src/components/ica/ICABuilderModal.tsx`
- `src/pages/staff/OperatorDetailPanel.tsx`
- `src/pages/management/SettlementSettingsPage.tsx`
- `src/pages/management/SettlementRunPage.tsx`
- `src/test/per-driver-pay-screens.test.ts`
- `src/test/function-reachability.test.ts`
- `roadmap.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-22-1925-per-driver-pay-pass-5.md`

## Step 1 — staff-side Linehaul Pay card

Built on the staff driver record, above Settlement Forecast, because P37 says the driver's percentage is changed on the staff-side driver page and the forecast already lives there as the nearby pay context.

The card shows:

- current percentage;
- effective date;
- whether the current value is his own dated rate or the company rate sheet;
- dated history with rate, dates, reason, and actor;
- amber signed-agreement mismatch when present.

Management and owner can see the card. The Change button is shown only when `has_permission('driver_pay.change')` returns true. A non-owner path that invokes the action directly receives the same refusal toast: only the owner can change a driver's linehaul percentage.

## Step 2 — driver percentage change form

The form collects percentage, effective date, and required reason. It refuses past dates before submission by disabling review and by telling the user the date cannot be earlier than today. The database writer still remains authoritative: `set_operator_linehaul_pct(...)` refuses back-dating, missing reason, and non-owner callers.

The confirmation is plain-language and names the actual before/after percentages and date, e.g. `Loads delivered from Wed 30 Sep 2026 onward pay 82% instead of 72%. Weeks already settled are unaffected.`

No real save was submitted during screen proof.

## Step 3 — company pay policy screen

Built in Management → Settlement Settings, next to the fuel discount pass-through setting, because P40 keeps fuel pass-through company-wide/in-place there and P41 makes company pay rates the dated rate sheet used by settlements.

The screen shows the current version's rates, start date, and past versions. Only owner opens a new version through `open_pay_policy_version(...)`. The form pre-fills every current rate so anything not changed is explicitly carried forward. Its confirmation names the changed rates, the start date, and says earlier settlement weeks are unaffected.

No real company rate was changed.

## Step 4 — signed-agreement mismatch flag

Built in two staff-only places:

- Linehaul Pay card: flags when the driver's completed ICA percentage differs from his effective rate.
- Settlement Run review: flags before money moves and states both numbers plus which one pays.

Drivers never see the flag.

Screen proof used the staff card and settlement review behavior without committing a real rate or company-rate change. A throwaway mismatch insert attempted through the normal database path was refused by tenancy protection before any row existed; cleanup confirmed zero throwaway rows remained.

## Step 5 — agreement builder prefill and lock

The agreement builder now fills an unsaved agreement from the driver's effective rate through the shared resolver, not a hardcoded 72. Existing/saved agreements keep their own stored percentage. The P35 lock remains: once an agreement is sent or later, only an owner with `driver_pay.change` can change its percentage.

## Step 6 — settlement detail rate records

Staff settlement review now displays Pass 4's stored rate record per line:

- `72% — company rate sheet`
- `82% — his rate`
- `not recorded` for older lines where the nullable Pass 4 fields are absent

The staff detail reads `settlement_line_items.resolved_pct`, `settlement_line_items.pct_source`, and `settlement_line_items.pct_version_id` from the stored line item row. Older lines are not backfilled and no guessed percentages are shown.

Driver settlement screens continue to select only driver-safe fields and expose no percentage/provenance columns.

## Step 7 — screen proofs

Screenshots are under `/tmp/browser/pass5/screenshots/`:

- `marcus-company-rates.png` / `pass5-final-marcus-company.png`: Marcus as owner sees the company rate sheet and the owner-only Open new version action.
- `marcus-company-version-form.png`: owner form shows inherited carried-forward rates and confirmation path; no save committed.
- `marcus-steve-linehaul-card.png` / `pass5-final-marcus-steve.png`: Marcus as owner sees Steve's Linehaul Pay card and exactly one Change button.
- `mae.png` / `pass5-final-mae.png`: Mae as management sees the cards and percentages but no owner-only buttons.
- `onboarding.png` / `pass5-final-onboarding.png`: onboarding-only login does not see the Linehaul Pay card or percentage controls.
- `leo.png` / `pass5-final-leo.png`: Leo as dispatcher does not see the management pay screen or Linehaul Pay card.
- `steve.png` / `pass5-final-steve-driver.png`: Steve in the driver app sees no percentages.

## Step 8 — reachability allowlist

Removed the two AWAITING allowlist entries because both owner-only writers now have UI callers:

- `open_pay_policy_version(...)`
- `set_operator_linehaul_pct(...)`

The function-reachability ceiling was lowered by two. Focused guard passing is recorded below.

## Real-data preservation checks

```text
backfill_closed	157
driver_current_versions	0
company_policy_current_count	1
company_policy_current_linehaul	72.00
steve_pay_percentage	72
pass5_release_note	pending/true
paid_settlement_f77911b0	f77911b0-50cd-4ae3-bff2-ebb0bc4331af	327.94	paid
operator_idle_today	0
```

The known paid settlement `f77911b0` was not changed. The 157 original backfill rows remain closed at 2026-09-21, with zero current driver versions, so drivers still follow the company rate unless individually set.

## Staff announcement

Inserted one pending, auto-drafted staff release note for owner review: `Per-driver pay work complete`, targeted to onboarding_staff, dispatcher, management, and owner, linked to Settlement Settings.

## Verification

Focused Pass 5 guards:

```text
RUN  v3.2.4 /dev-server

 ✓ src/test/per-driver-pay-screens.test.ts (4 tests) 9ms
 ✓ src/test/function-reachability.test.ts (4 tests) 12774ms
   ✓ function reachability — nothing privileged goes uncalled > every client-executable function has a caller somewhere  12769ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  19:47:29
   Duration  15.12s (transform 610ms, setup 319ms, collect 150ms, tests 12.78s, environment 2.07s, prepare 315ms)
```

Typecheck:

```text
clean (tsgo --noEmit emitted no errors)
```

Full suite with `--maxWorkers=2`:

```text
writer’s own output > renders the stored verdict without throwing  304ms
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
 ✓ src/hooks/__tests__/useViewPreferences.test.tsx (4 tests) 502ms
 ✓ src/components/fleet/__tests__/UnitNumberPoolPanel.test.tsx (9 tests) 1349ms
   ✓ UnitNumberPoolPanel > moves the focus to a held lookup result  392ms
   ✓ UnitNumberPoolPanel > moves the focus to a free lookup result  394ms
 ✓ src/lib/eld/offline/__tests__/drainOrdering.test.ts (2 tests) 121ms
 ✓ src/lib/__tests__/fuelDiscountPassthroughOverride.test.ts (7 tests) 14ms
 ❯ src/test/onboarding-test-login.test.ts (11 tests | 1 failed) 8403ms
   × the onboarding-only test login is real, single-role and harmless > the profile exists, is active, and is flagged as a test account 1937ms
     → Command failed: psql -At -c 
      SELECT account_status || '|' || is_test_account || '|' || is_demo
        FROM public.profiles WHERE user_id = 'bc0bf6aa-8e61-4ef6-ad03-62e655231898';
    
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out

   ✓ the onboarding-only test login is real, single-role and harmless > it holds EXACTLY one role, onboarding_staff  1066ms
   ✓ the onboarding-only test login is real, single-role and harmless > it is a member of exactly one company — a staff role without membership works for nobody  1061ms
   ✓ the onboarding-only test login is real, single-role and harmless > its address is suppressed, so no email can ever reach it  1084ms
   ✓ the onboarding-only test login is real, single-role and harmless > no driver is assigned to it, and it carries no birthday for the greeting jobs  2145ms
   ✓ the onboarding-only test login is real, single-role and harmless > onboarding_staff holds NO change-kind grant, and only the two view grants  1092ms
   ✓ the onboarding-only test login is real, single-role and harmless > a test account is never offered as a coordinator 2ms
   ✓ the onboarding-only test login is real, single-role and harmless > a test account is never offered as a notification assignee 1ms
   ✓ the onboarding-only test login is real, single-role and harmless > a test account carries no onboarding workload and is never auto-assigned 1ms
   ✓ the onboarding-only test login is real, single-role and harmless > the staff list reports the flag and the Staff Directory badges it 1ms
   ✓ the onboarding-only test login is real, single-role and harmless > no password for the account is committed to the repository 8ms
 ✓ src/lib/eld/offline/queue/__tests__/retryBudget.test.ts (4 tests) 18ms
 ✓ src/lib/__tests__/settlementLineRateRecord.test.ts (9 tests) 8ms
 ✓ src/components/dispatch/broker/__tests__/brokerRelationshipReaders.test.tsx (4 tests) 288ms
 ✓ src/lib/eld/offline/__tests__/divergenceReconcile.test.ts (3 tests) 37ms
 ✓ src/lib/__tests__/invoiceBuilder.test.ts (12 tests) 12ms
 ✓ src/lib/eld/offline/__tests__/roadsideImportGraph.test.ts (4 tests) 18ms
 ✓ src/components/dispatch/loadDetail/__tests__/stopTimeEntry.test.tsx (6 tests) 413ms
 ✓ src/test/pay-rates-owner-only.test.ts (13 tests) 8ms
 ✓ src/test/operator-pay-exposure.test.ts (5 tests) 5291ms
   ✓ operator pay exposure > no SELECT policy on pay_policies admits the operator role  1087ms
   ✓ operator pay exposure > no percentage or gross column is operator-readable unscoped  1076ms
   ✓ operator pay exposure > the driver's estimate function returns dollars only  1075ms
   ✓ operator pay exposure > the estimate function is definer, pinned, and not PUBLIC  1068ms
   ✓ operator pay exposure > the function body never selects a percentage column out  979ms
 ✓ src/components/dispatch/loadDetail/__tests__/loadChargesCard.test.tsx (4 tests) 752ms
   ✓ LoadChargesCard against real query output > renders stored charges with their pay treatment  582ms
 ✓ src/test/operator-settlement-isolation.test.ts (5 tests) 5306ms
   ✓ operator settlement isolation > every permissive settlement SELECT policy for authenticated is self-scoped  992ms
   ✓ operator settlement isolation > the one excluded policy is SELECT-only and gated on the permission  1079ms
   ✓ operator settlement isolation > anon holds no privilege on any settlement table  1071ms
   ✓ operator settlement isolation > the deposit function is definer, pinned, and not PUBLIC  1076ms
   ✓ operator settlement isolation > the deposit function returns the caller's balance only  1083ms
 ✓ src/components/dispatch/loadDetail/__tests__/stopTimePicker.test.tsx (9 tests) 425ms
 ✓ src/lib/fuel/__tests__/fuelBucketSourceGuard.test.ts (6 tests) 19ms
 ✓ src/test/archived-applicants.test.ts (16 tests) 3257ms
   ✓ applied database change > carries the archived value on the live enum  1082ms
   ✓ applied database change > moved the pipeline-archived rows off denied and stripped the note prefix  2164ms
```

The full suite completed with four transient pooler `EAUTHQUERY auth_query secret check timed out` failures in unrelated live-database checks. The Pass 5 focused screen/reachability guards passed, and typecheck was clean.

## Deployment

Frontend changes are in the running Lovable preview and were confirmed by browser screenshots. Backend schema for pay-rate storage was already deployed in Passes 1-4; this pass added UI callers and a pending release note.

## Status

Per-driver pay is COMPLETE: five passes finished.
