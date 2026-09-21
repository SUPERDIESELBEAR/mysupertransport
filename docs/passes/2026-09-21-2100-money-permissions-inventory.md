# Pass report — money-action permissions: decisions recorded, protection inventoried

2026-09-21 2100 UTC. BUILD MODE, scope limited by the prompt to `docs/tms-build-status.md`,
`docs/tms-wish-list.md` and this report.

**DOCUMENTATION ONLY. No migration, no code, no data change, nothing deployed, nothing
built.** **The full suite was SKIPPED deliberately — this pass is documentation only**, so
there is nothing it could regress; typecheck likewise not run, as no TypeScript was touched.
The prompt's final line (`END OF PROMPT…`) arrived intact; the prompt was not truncated.

Read first, as instructed: `docs/passes/2026-09-21-0132-permissions-design.md` (P12-P15 and
the three-table design), `docs/passes/2026-09-21-1644-staff-suspension-permission.md`
(P16-P19 and the closing of the first slice), and P1-P19 in `docs/tms-build-status.md`.
Read live for the inventory: `pg_policies` on the fifteen money tables, `pg_trigger` on
`settlements` / `invoices` / `dispatch_settlements` / `accessorial_adjustments` /
`pay_policies` / `pay_policy_assignments` / `fuel_import_batches` / `payments`, and
`pg_get_functiondef` for every settlement, invoice, accessorial, fuel and pay function in
`public`.

## Contradiction check — no STOP, two corrections of emphasis

Nothing in P20-P26 contradicts the live system or the record. Two things are worth stating
plainly before the rows, because they change what the gaps are:

1. **The money layer is NOT UI-only.** Unlike the first slice, almost every money action
   already has a database gate: a permissive policy naming `management`/`owner`, a role check
   inside a SECURITY DEFINER writer, or an immutability trigger. The gaps below are mostly
   *the wrong set of roles* or *no separate rule for the destructive half*, not *nothing*.
2. **Two view permissions already exist and are live**: `settlements_view_permission` and
   `dispatch_settlements_view_permission` (`has_permission('settlement.view')`), and
   `invoices_view_permission` (`has_permission('invoice.view')`). P13's split is therefore
   already half-built on the money tables: the *view* side goes through `has_permission`,
   the *change* side still goes through `has_role`.

## Step 1 — the owner's decisions, recorded as P20-P26 (owner, 2026-09-21)

- **P20** — Approve or finalize a settlement: **owner, management**.
- **P21** — Void or reopen a settlement after it is paid: **OWNER ONLY**.
- **P22** — Issue an invoice: **owner, management, dispatcher**.
- **P23** — Void an invoice: **owner, management**.
- **P24** — Approve an accessorial (detention, lumper, TONU and the rest): **owner,
  management, dispatcher**.
- **P25** — Commit a fuel import: **owner, management**.
- **P26** — Change pay rates or pay policies: **OWNER ONLY**.

## Step 2 — the inventory, one row per action

Legend for "enforced by": **POLICY** = RLS permissive policy; **DEFINER** = role check inside
the SECURITY DEFINER writer; **TRIGGER** = immutability trigger; **UI ONLY** = nothing below
the screen.

### P20 — approve or finalize a settlement

| | |
| --- | --- |
| Where | Driver settlements: `src/lib/settlementRun.ts` → `public.store_settlement_run(...)`. Dispatch settlements: `src/pages/management/DispatchSettlementPage.tsx`, `setStatus({status:'approved'})` then `{status:'paid'}` — a **direct table UPDATE**, not an RPC. `public.compute_dispatch_settlement(p_month, p_result, p_mode)` computes. |
| Enforced by | POLICY `Management manages settlements` / `Management manages dispatch settlements` (ALL, `management OR owner`), plus TRIGGER `enforce_settlement_immutability` / `enforce_dispatch_settlement_immutability`. `compute_dispatch_settlement` checks `has_role(management)` OR `has_role(owner)` internally. `store_settlement_run` has **no role check of its own** — it asserts `settlement_writer_active()`, a session-flag gate, and relies on the caller's RLS. |
| Who can do it today | management, owner. |
| Gap vs P20 | **None on who.** Gap is *kind*: finalizing is not distinguishable from any other settlement write, so a future `settlement.approve` change-permission has nothing to hook to, and the approve/pay step on the dispatch screen is an unrestricted column update rather than a named action. |

### P21 — void or reopen a PAID settlement — **the worst gap**

| | |
| --- | --- |
| Where | Dispatch settlements: the void panel in `DispatchSettlementPage.tsx` — direct UPDATE `status='void', void_reason`, with TRIGGER `apply_dispatch_settlement_void` then DELETING every `dispatch_settlement_line_items` and `dispatch_settlement_load_contributions` row. Driver settlements: **no void or reopen path exists at all** — no function, no screen. |
| Enforced by | POLICY (`management OR owner`) + TRIGGER. `apply_dispatch_settlement_void` itself has **NO ROLE CHECK** — it is the destructive half and it trusts whoever got past the policy. `enforce_settlement_immutability` refuses any change to a driver settlement's `status`, amounts, period or `hold_reason` once `status='paid'`, and refuses deletion, unless `settlement_writer_active()`. |
| Who can do it today | **management and owner** can void a paid dispatch settlement and destroy its lines. Nobody can void a driver settlement. |
| Gap vs P21 | **Management can do an OWNER-ONLY action, and it cascades DELETEs.** This is the largest gap in the money layer. |

### P22 — issue an invoice

| | |
| --- | --- |
| Where | `src/pages/management/BillingQueuePage.tsx` → `src/lib/billingRun.ts` `storeInvoice()` → `public.create_invoice(p_load_id, p_payload)`; number from `public.allocate_invoice_number()`. |
| Enforced by | DEFINER: `create_invoice` checks `has_role(management)` OR `has_role(owner)`, plus its own refusals (lines must sum, load must be `ready_to_invoice`, no second invoice, charge sets must match both ways, billing path must match the broker). POLICY `invoices management and owner only` (ALL). `allocate_invoice_number` has **no role check** and no client EXECUTE (service_role only) — it is reachable only from inside `create_invoice`. |
| Who can do it today | management, owner. |
| Gap vs P22 | **Dispatcher is MISSING.** P22 widens this action; the definer check and the `invoices`/`invoice_line_items`/`invoice_batches` policies must all widen together, or a dispatcher passes the function and fails the policy. |

### P23 — void an invoice

| | |
| --- | --- |
| Where | **No void action exists in the code** — no `void_invoice` function, no screen control. The nearest live paths are `public.close_short_paid_invoice(p_invoice_id, p_reason)` and any direct `invoices.status` UPDATE. |
| Enforced by | POLICY `invoices management and owner only`; TRIGGER `enforce_invoice_immutability` freezes load, broker, number, billing path, amount, batch and submission stamps once `submitted_at` is set, but **deliberately leaves `status` and payments movable** — so a status flip to a void-like value is permitted today. `close_short_paid_invoice` checks `has_role(management)` OR `has_role(owner)`. |
| Who can do it today | management, owner (by status update). |
| Gap vs P23 | **None on who.** Gap is that the action does not exist as an action: there is nothing named to permit, audit, or reverse, and no rule about the invoice's payments or its load's status when it is voided. |

### P24 — approve an accessorial

| | |
| --- | --- |
| Where | Late accessorials (-A1): `src/pages/management/LateAccessorialsPage.tsx` and `src/components/accessorials/AdjustmentActionDialog.tsx` → `public.approve_accessorial_adjustment(p_id, p_reason)`; created by `create_accessorial_adjustment`, submitted/rejected by the sibling functions. Detention: `detention_claims`, worked from the dispatch screens. In-load charges: `add_load_charge` / `update_load_charge` / `delete_load_charge` on `load_charges`. |
| Enforced by | DEFINER: `approve_accessorial_adjustment` requires authentication, then `dispatcher OR management OR owner`, a reason, `status='pending_approval'`, and attached proof; a senior-only amount limit sits above it. POLICY on `accessorial_adjustments`: read for `dispatcher/management/owner` within company; the write path is closed to clients and opens only inside a definer writer via the `accessorial_adjustment_writer_active()` session flag. TRIGGERs `enforce_accessorial_adjustment_immutability` and `..._transition`. `detention_claims` policies: INSERT/UPDATE/SELECT for `dispatcher OR management OR owner`. |
| Who can do it today | dispatcher, management, owner. |
| Gap vs P24 | **None on who — this row already matches P24.** Gap is only that the rule is spelled as three `has_role` calls in four places (the adjustment writer, the claim policies, the charge RPCs) instead of one named permission. |

### P25 — commit a fuel import

| | |
| --- | --- |
| Where | `src/lib/fuel/fuelImport.ts` → `public.commit_fuel_import(_file_name, _provider, _rows, _columns)`. Related: `assign_fuel_transaction_operator`, `accept_fuel_disagreement`, `src/pages/management/FuelExceptionsPage.tsx`. |
| Enforced by | DEFINER: `commit_fuel_import` checks `has_role(management)` OR `has_role(owner)`; the same check appears in `assign_fuel_transaction_operator` and `accept_fuel_disagreement`. POLICY: `fuel_batches_write_management` and `fuel_transactions_write_management` (ALL, `management OR owner`); staff read. TRIGGER `enforce_fuel_acceptance_append_only`. |
| Who can do it today | management, owner. |
| Gap vs P25 | **None on who.** Gap is naming only. |

### P26 — change pay rates or pay policies — **the second-worst gap**

| | |
| --- | --- |
| Where | **No pay-policy screen exists.** `src/lib/payTreatment.ts` only READS `pay_policies` and `pay_policy_assignments`. Rates are edited today through `contractor_pay_setup` (onboarding Stage 8) and through the per-load rate fields on `loads`, and policy rows would be written by direct PostgREST writes. |
| Enforced by | POLICY `pay_policies_insert/update/delete_management` and the same three on `pay_policy_assignments` (`management OR owner`); read for management, owner, dispatcher, onboarding_staff (and the operator's own assignment). `contractor_pay_setup`: `Staff can update pay setup records` = **`is_staff(auth.uid())`** — every staff role, dispatcher and onboarding staff included — plus the earlier contract-pay tamper trigger. `pay_policies` carries **no immutability trigger**: only stamps and `updated_at`. |
| Who can do it today | management and owner for policy rows; **any staff role** for a driver's contracted pay via `contractor_pay_setup`. |
| Gap vs P26 | **Two levels off owner-only**: management may change policy rates, and any staff member may change a driver's pay setup. Nothing records a rate's history, so a change cannot be dated against the settlements it affected. |

### Every OTHER path that can produce the same money effect

- **Settlements** — `store_settlement_run` (writer flag, no role check of its own),
  `compute_dispatch_settlement` (role-checked), the direct `settlements` /
  `dispatch_settlements` UPDATE the screens use, `apply_dispatch_settlement_void` (cascading
  DELETE, no role check), `authorize_below_threshold_payment` (role-checked; releases a
  below-minimum net), `settlement_line_items` / `dispatch_settlement_line_items` /
  `settlement_withheld_loads` writes (all `management OR owner`), and the money that flows in
  through `deductions`, `deduction_installments`, `rm_deposits` and `cash_advances` — each an
  ALL policy for `management OR owner`. Net pay can therefore be changed without touching the
  settlement row.
- **Invoices** — `create_invoice`, `allocate_invoice_number` (server-side only),
  `close_short_paid_invoice`, direct `invoices.status` / `payments` writes, `invoice_batches`,
  and `payments` with TRIGGER `enforce_payment_immutability`.
- **Accessorials** — `create/submit/approve/reject_accessorial_adjustment`,
  `attach_accessorial_adjustment_proof`, `detention_claims` UPDATE, and the three
  `load_charges` RPCs (a charge added before invoicing needs no approval at all).
- **Fuel** — `commit_fuel_import`, `assign_fuel_transaction_operator`,
  `accept_fuel_disagreement`, direct `fuel_transactions` writes.
- **Pay** — `pay_policies`, `pay_policy_assignments`, `contractor_pay_setup`, the `loads` rate
  columns, and `settlement_settings` / `dispatch_settlement_rates`.
- **Scheduled jobs** — none of the twelve cron jobs writes a settlement, an invoice, an
  accessorial approval, a fuel import or a pay rate. Checked against the repaired cron list;
  the money layer has no automated writer.

### Marked: protected by the UI alone

**None.** Every money action above has at least one database gate. The one action whose
*destructive effect* has no gate of its own is P21's cascading void
(`apply_dispatch_settlement_void`, NO ROLE CHECK), and it is reached only after the
`management OR owner` policy — so it is mis-scoped, not unguarded. This is a genuine
difference from the first slice and should not be read as "the money layer is fine".

## Step 3 — the hard cases, as questions for the owner (not answered here)

Only what the code actually raises:

1. **What does "reopen" mean for a paid settlement?** `enforce_settlement_immutability`
   forbids moving a paid settlement's status, amounts or period at all, and the standing rule
   says corrections go on a LATER settlement. If money has already left through Everee, is
   "reopen" (a) forbidden outright, (b) a void plus a fresh settlement, or (c) an adjustment
   line on the next one? P21 grants the owner an action the database currently refuses to
   anybody.
2. **Voiding a paid dispatch settlement destroys its lines.** `apply_dispatch_settlement_void`
   DELETEs every line item and load contribution. Should a void keep the lines for the record
   and merely mark them void?
3. **Is an -A1 adjustment a P24 approval or a P21 reopen?** `approve_accessorial_adjustment`
   is reachable by a dispatcher and, once approved, the adjustment is picked up by the NEXT
   settlement — it never edits the settled one. If that is right, it stays P24; if the owner
   reads "money added to a load that already settled" as reopening, it becomes owner-only and
   the dispatcher loses the -A1 path.
4. **Does a pay-policy change reach settlements already calculated?** `pay_policies` has no
   effective-date history and no immutability trigger, and `payTreatment.ts` resolves the
   policy at calculation time. Changing a percentage today silently changes what a
   recalculation of last week would produce. Should policy rows become append-only with an
   effective date?
5. **`contractor_pay_setup` is a pay rate too.** Does P26's "owner only" cover a driver's
   contracted percentage, which onboarding staff set during Stage 8? If yes, Stage 8 stops
   working for the staff who run it; if no, the owner-only rule has a staff-sized door in it.
6. **Does P22's dispatcher get the whole invoice or only the issuing?** Issuing writes
   `invoices`, `invoice_line_items` and `invoice_batches`, and those policies are ALL, not
   INSERT — widening them to dispatcher also grants updating and deleting unless the write is
   split by command.
7. **Below-minimum releases and short-paid closes.** `authorize_below_threshold_payment` and
   `close_short_paid_invoice` are both management-or-owner today and neither is named in
   P20-P26. Are they part of P20 and P23, or separate permissions?

## Step 4 — proposed build order, worst gap first (NOTHING BUILT)

1. **P21 — settlement void and reopen, owner only.** Worst gap: management can destroy a paid
   dispatch settlement's lines. Needs the owner's answer to hard cases 1 and 2 first.
   *Proof its pass will need:* a live refusal (`42501`) when Mae (management) attempts the void
   on a throwaway settlement, the owner's acceptance on the same throwaway, the line items
   still present or explicitly marked void, and a driver settlement left untouched — with the
   money-probe rule observed: no real settlement voided, even briefly.
2. **P26 — pay rates and policies, owner only.** Second worst: management edits policy rates
   and any staff role edits a driver's pay setup. Needs answers to 4 and 5.
   *Proof:* Mae refused on `pay_policies` UPDATE and on `contractor_pay_setup`, the owner
   accepted, Stage 8's own path either still working or deliberately re-scoped, and a recorded
   decision on effective dating.
3. **P20 — settlement approve and finalize, as a named change permission.** Roles already
   match; the value is a named action and one gate the dispatch screen's status update goes
   through instead of a bare column write.
   *Proof:* the approve and pay buttons refused for a dispatcher at the database, accepted for
   management, and `store_settlement_run` still refusing a caller without the permission.
4. **P22 — issue an invoice, widened to dispatcher.** Requires the definer check and three
   table policies to move together (hard case 6).
   *Proof:* Leo (dispatcher) issues an invoice end to end on a throwaway load, and is still
   refused an invoice UPDATE and DELETE.
5. **P23 — void an invoice, as a real action.** Build the action, then permit it.
   *Proof:* a voided invoice on a throwaway load, its payments and its load's status behaving
   as decided, a dispatcher refused, and the immutability trigger still refusing edits to the
   frozen columns.
6. **P24 — accessorial approval, renamed to one permission.** Lowest risk: roles already
   match. *Proof:* the four `has_role` sites replaced by one `has_permission`, dispatcher
   still accepted, onboarding staff still refused, on a throwaway adjustment.
7. **P25 — fuel-import commit, renamed to one permission.** Same shape as 6.
   *Proof:* Mae accepted, Leo refused, on a throwaway import batch that is then removed.

Every step above also needs the standing money-probe rule (2026-09-17 2230) and the
throwaway rule as tightened on 2026-09-21 1550: no real settlement, invoice, adjustment,
import or pay rate is touched to prove a permission.

## Files this pass authored

- `docs/passes/2026-09-21-2100-money-permissions-inventory.md` (this file)
- `docs/tms-build-status.md` (appended: P20-P26 and the inventory, one dated heading)
- `docs/tms-wish-list.md` (permissions slice 2 recorded)

---

## CORRECTION appended 2026-09-21 23:17 UTC — the P21 row and the "worst gap" claim are wrong

Nothing above is rewritten. This correction stands on top of it.

This report's **P21 row** says management can void a PAID dispatch settlement, and its
**"worst gap"** claim rests on that. Read live, nobody can — the owner included. In
`enforce_dispatch_settlement_immutability`:

```sql
IF NEW.status = 'void' AND OLD.status <> 'void' THEN
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Dispatch settlement % is PAID and cannot be voided.', OLD.id
      USING ERRCODE = '42501';
```

The refusal names no role, so it binds every caller. The screen agrees and does not even offer
the control on a paid settlement: *"A paid settlement is immutable. It cannot be recomputed,
edited or voided."*

The deleting behaviour this report called the worst gap therefore only ever ran on a **draft or
approved** settlement. That deletion is real and was the thing worth fixing; the paid-void
exposure was not.

Consequences recorded in the 23:17 pass (`docs/passes/2026-09-21-2317-settlement-void-keeps-record.md`):

- **P28 is REVISED** — a paid settlement cannot be voided by anyone, including the owner. The
  live refusal is the rule. The original P28 ("owner only, with a written reason") was written
  on this report's wrong premise.
- Voiding a draft or approved settlement now KEEPS every line item and load contribution,
  marked void (P29, P34), and a month holds one LIVE settlement.
- `settlement.void` is registered with no role grant.
