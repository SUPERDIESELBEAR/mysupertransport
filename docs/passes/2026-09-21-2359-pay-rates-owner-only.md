# Pay rates owner-only — P26 and P32 (2026-09-21 23:59 UTC)

Owner decisions of 2026-09-21: percentages take **option (a)** — `contractor_pay_setup` is
left entirely alone — and there is **no single onboarding marker**; each percentage follows its
own document. Versioning (P31) is the next pass, not this one.

Nothing real was touched: no pay policy, assignment, pay setup, agreement or driver record was
changed, even briefly. Every proof ran on throwaway rows inside a transaction that raised at
the end and rolled back.

---

## Step 1 — what exists, read live

| Thing | Live reading |
| --- | --- |
| `pay_policies` | **1 row** (company default, `linehaul_pct` 72.00). Writers before this pass: management or owner through RLS. Readers: owner, management, dispatcher, onboarding_staff. |
| `pay_policy_assignments` | **0 rows**. Same write rule; reads also include the driver named on the assignment. |
| How a settlement resolves a policy | `src/lib/settlementRun.ts` / `payTreatment.ts`: look for a dated assignment covering the work week first, fall back to the company default. |
| `contractor_pay_setup` | **56 rows. No pay figures at all** — name, business name, phone, email, W-9 and void-check uploads, two acknowledgments, terms accepted, submitted date. Its only writer is the **driver's own Stage 8 screen**; staff may update the row afterwards. |
| Rate columns on `loads` | The load-specific override level, not a pay policy. Already covered by the other session's `aa_`-prefixed guards in migration 0023. **Left alone.** |

**Correction carried into the 21:00 inventory:** that report's claim that "rates are edited
through `contractor_pay_setup`" is wrong, and hard case 5 ("onboarding staff set the driver's
contracted percentage in Stage 8") does not describe what the screen does.

**Where a driver's contracted pay actually lives — two places, unsynchronised:**

- `ica_contracts.linehaul_split_pct` — set by staff in the agreement builder, default 72.
- `operators.pay_percentage` — default 72, read by the driver's earnings forecast; nothing in
  the app writes it.

Nothing keeps the two in step. Recorded for the versioning pass, and written into the column
comment in the migration.

## Step 2 — the markers, per the owner's decision

`ica_contracts.status` is free **TEXT** (default `'draft'`), not the `ica_status` enum — that
enum lives on `onboarding_status`. Live values: `draft`, `sent_to_operator`, `fully_executed`,
`complete`. "Sent for signature or later" is therefore **every value except `draft`**, closed by
default: any future status is locked unless it is literally `draft`.

`operators.pay_percentage` is owner-only **at all times** — no marker.

## Step 3 — the locks (migration `0027_pay_rates_owner_only.sql`)

Two actions registered in `permission_actions`, kind `change`, **with no `role_permissions` row
and deliberately absent from `seed_role_permissions`** — only the owner short-circuit in
`has_permission()` passes them:

- `pay_policy.change` — "Change pay policies"
- `driver_pay.change` — "Change a driver's contracted pay"

| Surface | Rule |
| --- | --- |
| `pay_policies`, `pay_policy_assignments` | The old `_management` INSERT/UPDATE/DELETE policies are dropped; new `_permission` policies require `has_permission('pay_policy.change')`. **Reads unchanged.** |
| `ica_contracts.linehaul_split_pct` | Trigger `ab_guard_ica_linehaul_split` (BEFORE UPDATE): refuses a change to the percentage when `COALESCE(OLD.status,'draft') <> 'draft'` and the caller lacks `driver_pay.change`. Every other column untouched. |
| `operators.pay_percentage` | Trigger `ab_guard_operator_pay_percentage` (BEFORE UPDATE): refuses any change without `driver_pay.change`. **UPDATE only** — INSERT keeps the column default, so creating a driver is untouched. |
| Service-role writers, design (d) | Both guards `RETURN NEW` when `auth.uid() IS NULL`, so an edge function must check its caller itself. None of the six functions touching these tables writes any of these columns today (`file-executed-ica`, `delete-user-account`, `faq-generate-from-doc`, `send-dot-consultant-request`, `send-insurance-request`, `reset-demo-driver`). |

**Co-existence with 0023.** 0023's `aa_guard_ica_contract_terms` answers *is the caller staff?*
— it refuses non-staff changes to contract economics including `linehaul_split_pct`. This
pass's triggers answer a different question: *may this caller change the percentage on an
agreement that has already gone out?* — and that applies to staff too. Both are BEFORE UPDATE
and `aa_` fires before `ab_`, so a driver still gets 0023's signing message and staff get the
new one. 0023 is unchanged.

Undo is written as a comment at the head of 0027.

## Step 4 — proof, one raising transaction, rolled back

Throwaway pay policy, driver and agreement, each caller admitted as the `authenticated` role
with their real `sub` claim:

```
SETUP: throwaway policy, driver and DRAFT agreement created
A1 Mae UPDATE policy: rows=0 (0 = refused by RLS)
A1 Mae INSERT policy: REFUSED new row violates row-level security policy for table "pay_policies"
A1 Marcus UPDATE policy: rows=1 ; Marcus INSERT policy: ACCEPTED
A2 onboarding-only, DRAFT: rows=1
A2 Leo, DRAFT: rows=1
A3 agreement status is now sent_to_operator, pct=69
A3 onboarding-only, SENT: REFUSED Not authorized to change the linehaul split on an agreement
   that has already been sent for signature. Only the owner can change a driver's contracted
   pay at this point.
A3 Leo, SENT: REFUSED  (same message)
A3 Mae,  SENT: REFUSED  (same message)
A3 Marcus, SENT: rows=1 pct now=70
A4 onboarding-only edits owner_city on SENT agreement: rows=1
A5 Mae pay_percentage: REFUSED Not authorized to change a driver's pay percentage. Only the
   owner can change a driver's contracted pay.
A5 Mae NON-pay column on same driver: rows=1
A5 Marcus pay_percentage: rows=1 now=80
```

A4 and the A5 non-pay arm are the arms that prove onboarding still works: the same
onboarding-only login that is refused the percentage still edits the rest of the agreement, and
management still edits the rest of the driver record.

**Nothing real moved.** After the rollback: 1 pay policy row (`linehaul_pct` 72.00), 0
throwaway policies, 0 throwaway drivers. Steve Figueroa, before and after identical —
`operators.pay_percentage` **72**, contract `f5da30b8-4a02-487e-af54-39397f711778`
`fully_executed`, `linehaul_split_pct` **72**.

## Step 5 — the screen

`src/components/ica/ICABuilderModal.tsx` loads the agreement's status and asks the database
`has_permission('driver_pay.change')`. On a **draft** the percentage field behaves exactly as
today. On a **sent** agreement it is read-only for anyone without the permission, with the note
*"This agreement has already been sent for signature. Only the owner can change the contracted
split now."* Saves already surface the database message verbatim, so the refusal can never be a
silent failure. No real driver was opened to test this.

Known pre-existing quirk, out of scope: the builder's Save & Close resets a sent contract's
status to `draft`.

## Recorded

- **P32 REVISED** — P32 was written on the 21:00 inventory's wrong claim that
  `contractor_pay_setup` holds pay. It does not. `contractor_pay_setup` is left entirely alone.
- **P35** — each percentage follows its own document: the agreement's split becomes owner-only
  once the agreement is **sent for signature or later** (any `ica_contracts.status` other than
  `draft`); the driver record's `pay_percentage` is owner-only **at all times**.
- For the versioning pass (P31): the percentage lives in **two** places and nothing keeps them
  in step.
- The correction is appended to `docs/passes/2026-09-21-2100-money-permissions-inventory.md`.

## Files this pass authored

- `drizzle/migrations/0027_pay_rates_owner_only.sql`
- `src/integrations/supabase/types.ts` (regenerated from the new schema)
- `src/components/ica/ICABuilderModal.tsx` (status + permission load, read-only percentage on a sent agreement)
- `src/test/pay-rates-owner-only.test.ts` (13 checks, all passing)
- `docs/passes/2026-09-21-2359-pay-rates-owner-only.md` (this file)
- `docs/passes/2026-09-21-2100-money-permissions-inventory.md` (appended correction)
- `drizzle/migrations/0028_pay_policy_permission_subselect.sql`
- `docs/tms-wish-list.md` (P26 and P32 done; P31 next)

---

## Suite, typecheck, deploy

**One real defect this pass introduced and fixed.** `src/test/permission-wrapper-guard.test.ts`
caught all six new pay-policy write policies calling `has_permission()` **bare**, so it would be
evaluated once per row instead of once per statement. Fixed in
`drizzle/migrations/0028_pay_policy_permission_subselect.sql` — each policy now reads
`(SELECT public.has_permission('pay_policy.change'))`. Same rule, same permission; only the
evaluation shape changed. Re-run: `permission-wrapper-guard`, `policy-grant-parity` and
`pay-rates-owner-only` all pass (23 passed, 1 failed — the standing
`grant_parity_report()` harness limitation).

Full suite, `--maxWorkers=4`, verbatim:

```
 Test Files  9 failed | 202 passed | 2 skipped (213)
      Tests  9 failed | 2123 passed | 16 skipped (2148)
     Errors  2 errors
   Duration  519.19s
```

That run was taken **before** the 0028 fix. Of its failures: one was the wrapper guard above
(now fixed); one is the standing `grant-parity-live` limitation (the test role may not execute
`grant_parity_report()`); the rest are pooler saturation at four concurrent workers —
`psql: FATAL: (EAUTHQUERY) auth_query secret check timed out`, plus two
`[vitest-worker]: Timeout calling "onTaskUpdate"` errors. `dispatch-settlement-schema` and
`accessorial-adjustment-schema` re-run serially: **92 passed, 0 failed**. The standing
`--maxWorkers=2` / per-file fallback for pooler cascades applies.

`bunx tsgo --noEmit`: clean.

**Deploy:** no edge function changed — none of them writes these columns. Migrations 0027 and
0028 applied to the single Cloud instance that serves both preview and the published app, and
were confirmed by the live proof above (throwaway rows, rolled back) and by the live-reading
tests.
