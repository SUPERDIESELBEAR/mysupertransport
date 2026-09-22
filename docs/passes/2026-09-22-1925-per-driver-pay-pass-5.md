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
FAIL  src/test/accessorial-adjustment-schema.test.ts > accessorial_adjustments — the settlement seam > the settlement writer stamps BOTH pointers when it pays an adjustment
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (35.160.209.8), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out

FAIL  src/test/dispatch-settlement-schema.test.ts > dispatch settlement — the fixture carrier > carrier_profile holds exactly one row for USDOT 2309365
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (35.160.209.8), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out

FAIL  src/test/equipment-receipt-confirmation.test.ts > equipment receipt — live schema > at most one open confirmation per operator
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (54.70.143.232), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out

FAIL  src/test/onboarding-test-login.test.ts > the onboarding-only test login is real, single-role and harmless > the profile exists, is active, and is flagged as a test account
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out

Test Files  4 failed | 214 passed | 2 skipped (220)
Tests       4 failed | 2201 passed | 16 skipped (2221)
Errors      2 errors
Start at    19:39:25
Duration    587.86s (transform 7.42s, setup 26.69s, collect 42.89s, tests 829.14s, environment 174.87s, prepare 28.23s)
```

The full suite completed with four transient pooler `EAUTHQUERY auth_query secret check timed out` failures in unrelated live-database checks. The Pass 5 focused screen/reachability guards passed, and typecheck was clean.

## Deployment

Frontend changes are in the running Lovable preview and were confirmed by browser screenshots. Backend schema for pay-rate storage was already deployed in Passes 1-4; this pass added UI callers and a pending release note.

## Status

Per-driver pay is COMPLETE: five passes finished.
