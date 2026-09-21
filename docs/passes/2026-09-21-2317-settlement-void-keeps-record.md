# Pass — a voided dispatch settlement is kept for the record (2026-09-21 23:17 UTC)

Owner decisions P27-P34. Slice 2 of the money permissions, part one: voiding.

## What the owner decided

- **P27** — a PAID settlement is never reopened. Corrections go on a later settlement as
  adjustment lines.
- **P28 (REVISED)** — *a paid settlement cannot be voided by anyone, including the owner. The
  live refusal in `enforce_dispatch_settlement_immutability` is the rule.* P28 was first
  written as "only the owner may void a paid settlement, with a written reason", on the
  21:00 inventory's **wrong premise** that management could void a paid settlement today.
  Nobody can, and nobody now may.
- **P29** — a void keeps every line item and load contribution, marked void. Records are
  never deleted.
- **P30** — a late accessorial (-A1) is a P24 approval, not a reopen. Dispatch keeps it.
- **P31** — a pay-policy change never reaches settlements already calculated; effective dates
  carry the change forward.
- **P32** — `contractor_pay_setup` stays an onboarding entry; later changes are owner only.
- **P33** — dispatch may ISSUE invoices only. A below-minimum release needs P20; closing a
  short-paid invoice needs P23.
- **P34** — a voided settlement is kept permanently as history; **a month holds one LIVE
  settlement**, and any number of voided ones beside it.

## The correction to the 21:00 inventory

Appended to that report rather than rewritten. Its **P21 row** and its **"worst gap"** claim
are wrong: management cannot void a paid dispatch settlement, and neither can the owner.

Live, in `enforce_dispatch_settlement_immutability`:

```sql
IF NEW.status = 'void' AND OLD.status <> 'void' THEN
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Dispatch settlement % is PAID and cannot be voided.', OLD.id
      USING ERRCODE = '42501';
```

The refusal names no role, so it binds the owner too. On screen, a paid settlement is not even
offered the control: *"A paid settlement is immutable. It cannot be recomputed, edited or
voided."* The deleting behaviour the inventory called the worst gap therefore only ever ran on
a **draft or approved** settlement — which is what this pass changed.

## The blocker found first, and the decision that cleared it

A month was held by `dispatch_settlements_company_payee_period_uniq` — unique on
`(company_id, payee_key, period_month)` with no exception for voided rows. Recompute worked
only because it deleted the old settlement and its children outright. Keeping a voided
settlement and recomputing the month were therefore **mutually exclusive**. The owner chose to
scope the uniqueness rule to live rows (option 1), which is the only route that keeps both.

## The change

Migration `drizzle/migrations/0026_dispatch_settlement_void_keeps_record.sql` (undo recorded in
its header comment):

1. `dispatch_settlements_company_payee_period_uniq` replaced by
   `dispatch_settlements_company_payee_period_live_uniq`, the same key `WHERE status <> 'void'`.
2. `apply_dispatch_settlement_void` stops deleting. It stamps `voided_at` on every line item
   and load contribution instead (only where `NULL`, so a second pass cannot re-date history).
   Both child tables gained a `voided_at` column.
3. `enforce_dispatch_settlement_immutability` no longer zeroes the header totals — a voided
   settlement keeps the figures it was voided with. It still requires a non-empty
   `void_reason`, and still refuses a paid void absolutely (P28 revised, comment recorded in
   the function).
4. `compute_dispatch_settlement` looks up the month's existing settlement with
   `status <> 'void'`. A **non-voided draft or approved settlement is still replaced on
   recompute exactly as today**; voided rows are never read, replaced or deleted.

Who may void a draft or approved settlement is **unchanged**: management and owner, through
the dispatch settlement screen and the write gate. `settlement.void` is registered in
`permission_actions` (category `money`, kind `change`) with **no role grant at all**, and is
deliberately absent from `seed_role_permissions` — it is reserved for the pass that gates the
action, and the owner reaches it through the short-circuit.

## Every reader, and how each names the live settlement

| # | Reader | How it excludes voided rows |
|---|---|---|
| 1 | `gatherDispatchMonth` (`src/lib/dispatchSettlementRun.ts`) — the recompute preview | `.eq('period_month', …).neq('status','void').maybeSingle()` |
| 2 | `readStoredDispatchMonth` — the settlement screen's figures | `.neq('status','void')` before `.maybeSingle()` |
| 3 | `listDispatchMonths` — the month picker | a voided row increments `voidedCount` only; `hasSettlement` and `status` come from the live row |
| 4 | `listVoidedDispatchSettlements` — the kept history strip | `.eq('status','void')`, read apart, never summed into any total |
| 5 | `compute_dispatch_settlement` (definer writer) | `status <> 'void'` on its existence lookup |
| 6 | `dispatch_settlements_company_payee_period_live_uniq` | `WHERE status <> 'void'` |
| 7 | `DispatchSettlementPage.tsx` | renders only reader 2's row for every figure; reader 4's rows sit in their own card, labelled history |

A reader that counted a voided month twice was the failure this change could cause; readers 1-3
and 5 are the four that would have done it.

There is **no driver-facing void or reopen path** — the operator portal reads driver
settlements, never the dispatch company settlement, whose RLS is management and owner only.

## Screen text

The void banner and dialog no longer say the breakdown was erased. They now say the settlement
and its full breakdown are kept on file for the record, marked voided with the reason, and the
month can be recomputed beside it. The dialog also states that a paid settlement cannot be
voided by anyone.

## Proof

On a throwaway approved settlement for 2099-06, in a transaction that ended in a raise —
nothing committed, and `dispatch_settlements` for 2099-06-01 counted 0 afterwards. No real
settlement was read for writing, changed or voided; exactly one real dispatch settlement
exists and it was untouched.

```
1. void with NO reason refused: Voiding a dispatch settlement requires a reason.
2. void WITH reason accepted; lines kept 2 marked 2; loads kept 1 marked 1;
   header status=void reason=throwaway proof, P34 base=1000 net=149
3. fresh draft inserted BESIDE the voided row: ok
4. READER (status<>void) sees: draft base=2000 net=198
5. void history read apart: void base=1000 reason=throwaway proof, P34
6. live line total (voided excluded) = 0
7. second LIVE settlement refused: duplicate key value violates unique constraint
   "dispatch_settlements_company_payee_period_live_uniq"
8. PAID void refused (write gate open, no role named):
   Dispatch settlement … is PAID and cannot be voided.
```

Line 6 is 0 because the throwaway recompute inserted a header only, with no lines of its own:
the point it proves is that the voided settlement's -51 of lines is **not** picked up by the
live month. Line 8 is the strongest form of the P28 refusal available: the write gate was held
open, the most privileged path there is, and the void was still refused.

Schema cover, read from the live catalog rather than the migration file
(`src/test/dispatch-settlement-schema.test.ts`): the void trigger no longer contains either
`DELETE FROM`, it stamps both child tables, the header totals are no longer zeroed, the
refusal names no role, uniqueness carries the `status <> 'void'` predicate, the writer looks up
the live row, and both child tables carry `voided_at`. The screen test asserts the reader sends
`status<>void` and that the erasure wording is gone.

## Files this pass authored

- `drizzle/migrations/0026_dispatch_settlement_void_keeps_record.sql`
- `src/lib/dispatchSettlementRun.ts` (readers 1-4, `voidedCount`, `listVoidedDispatchSettlements`)
- `src/pages/management/DispatchSettlementPage.tsx` (kept-history card, void wording, month labels)
- `src/test/dispatch-settlement-schema.test.ts` (void, uniqueness, writer and column cover)
- `src/test/dispatch-settlement-screen.test.tsx` (live-row filter, wording)
- `src/lib/__tests__/dispatchSettlementRun.test.ts` (`voidedCount` on the month option)
- `src/integrations/supabase/types.ts` (regenerated)
- `docs/passes/2026-09-21-2317-settlement-void-keeps-record.md` (this file)
- `docs/passes/2026-09-21-2100-money-permissions-inventory.md` (correction appended)
- `docs/tms-build-status.md`, `docs/tms-wish-list.md`
