# Alvys M2 pass 1 — billing functions check the company; dispatchers may issue (P22, P33)

2026-09-25 11:04 UTC. BUILD MODE. Migration `0067_billing_company_checks.sql`.

## Step 0 — owner answers
P65–P68 recorded verbatim in `docs/tms-build-status.md`. Roadmap Milestone 2 reordered; direct-bill posting moved to "after the pilot" (P68).

## Step 1 — company checks (style of `_load_tracking_assert_staff`)
| Function | Check | Refusal |
|---|---|---|
| create_invoice | load.company_id and broker.company_id = current_company_id() | `Load not found.` |
| record_invoice_payment | invoice company = caller's | `Invoice not found.` |
| close_short_paid_invoice | invoice company = caller's | `Invoice not found.` |
| post_invoice_payment_internal | when signed in, invoice company = caller's (second layer) | `Invoice not found.` |
| record_factoring_remittance | both invoice-number match queries filter `company_id = current_company_id()` | line stays unmatched |
| create_accessorial_adjustment | load company = caller's | `Load not found.` |

Role checks, other messages and behaviour kept. SECURITY DEFINER, `search_path = public, extensions` and grants unchanged (ACL before/after identical).

## Step 2 — dispatchers issue, and only issue
- `create_invoice` admits dispatcher, management, owner.
- `create_invoice` calls `update_load_status(...,'invoiced')`, which refuses billing statuses for non-management. Owner-chosen route: `create_invoice` sets the transaction-local flag `superdrive.invoice_issue = 'on'` around that one call and clears it; `update_load_status` admits a dispatcher only for `invoiced` while the flag is on. The status buttons still refuse dispatchers on every billing status.
- The three ALL policies on `invoices`, `invoice_line_items`, `invoice_batches` were NOT widened.
- Dispatch portal: "Billing Queue" nav item, `/dispatch/billing-queue`, the same `BillingQueuePage`. The page has only "Create invoice"; no payment, remittance or close controls exist on it.

## Step 3 — proof (one DO block that raises at the end; nothing committed)
Verbatim output:
```
setup: PROOF loads at ready_to_invoice,ready_to_invoice
1. B current_company_id = B: true
   B create_invoice: 42501 Load not found.
   B record_invoice_payment ST26-0001: 42501 Invoice not found.
   B close_short_paid_invoice ST26-0001: 42501 Invoice not found.
   B create_accessorial_adjustment: 42501 Load not found.
2. B remittance: posted=0 unmatched=ST26-0001:no_match, 260001:no_match
   ST26-0001 payments=0 status=open
3. Leo create_invoice: ST26-0002 direct 1000.00; load now invoiced; history source/by staff_screen/?; flag after = ""
   Leo reads invoice via invoice.view: 1
4. Leo update_load_status(invoiced) direct: Billing status changes require management access
   as authenticated: Leo sees invoices=2 lines=0
   Leo UPDATE invoices rows=0
   Leo DELETE invoices rows=0
   Leo UPDATE lines rows=0
   Leo DELETE lines rows=0
   after: invoice amount=1000.00 lines=1
   Leo record_invoice_payment: Only management or owner may record a payment.
   Leo close_short_paid_invoice: Only management or owner may close a short-paid invoice.
   Leo record_factoring_remittance: Only management or owner may record a remittance.
5. demo driver create_invoice: 42501 Only a dispatcher, management or owner may create an invoice.
   (stand-in: Erika set submitted_at on 2 PROOF invoices)
6. Erika create_invoice: ST26-0003; load invoiced
   Erika payment 400: invoice partial
   Erika close short pay: short_paid shortfall 600.00
   Erika remittance on ST26-0002: 23514 new row for relation "payments" violates check constraint "payments_source_check"
   Erika remittance unknown number: posted=0 unmatched=no_match
ST26-0001 updated_at unchanged: true; status open
```
Residue after rollback (exact): PROOF loads 0; invoices 1; payments 0; factoring_remittances 0; invoice_number_config next_sequence 2; PROOF carriers 0. ST26-0001 `updated_at` still `2026-09-17 21:37:10.352836+00`.

`submitted_at` was set on the PROOF invoices as a stand-in because `invoices_lifecycle_order_check` requires submission before payment; nothing stamps it yet.

## Found, NOT fixed (outside this pass)
1. **Management cannot post a remittance — pre-existing.** `post_invoice_payment_internal` writes `payments.source = 'factoring'`; `payments_source_check` allows `factor`, `broker`, `other`. Matching finds the invoice (line 6 reached the insert for ST26-0002) and then the whole remittance fails. The original function had the same literal, so this predates 0067. 0 real remittances exist. Proposed: one-word fix at the start of the payout-PDF pass (P67), owner yes first. Step 3.5 "management can match a remittance" is therefore proven for MATCHING only, not posting.
2. **Dispatchers read invoices (2) but invoice lines (0).** No permission-based SELECT policy on `invoice_line_items`. Issuing does not need it. Owner yes needed before adding one.
3. The history row for Leo's issue reads source `staff_screen`; `_audit_actor_name` returned null inside the raw DO block (no profile resolution in that context) — `changed_by` is set.

## Tests
- New `src/test/billing-company-checks.test.ts` (live catalog): definer/pin/grants for all seven, each company check, dispatcher admitted only to `create_invoice`, the flag path, ALL policies unwidened. Behaviour arm is gated: the harness role gets `permission denied for function create_invoice`, so behaviour is proven above, not in the suite.
- New `src/pages/management/__tests__/billingQueueDispatcher.test.tsx`: Issue-only UI; nav wiring.
- Updated `loadDetailOperatorAccess.test.tsx` (billing-gate regex now names the one flag exception) and `nav-target.test.ts` (dispatch parses `billing-queue`). These were the two real failures.
- Definer allowlists: no change needed (no new functions, grants unchanged); `definer-live-catalog.test.ts` 13/13.

Full suite `--maxWorkers=2`: `Tests 5 failed | 2269 passed | 19 skipped (2293)`, `Errors 2 errors`, `Test Files 5 failed | 225 passed | 2 skipped (232)`. Two real (above, fixed). Three plus the two errors were pooler timeouts, 7 lines of:
`psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" ... port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out`
Rerun of all five failing files plus the new UI test: `Tests 32 passed (32)` after fixes (dispatch-settlement-schema, load-charge-gate-order, staff-suspension-permission passed on rerun). Typecheck (`tsgo`): clean.

## Files changed
- drizzle/migrations/0067_billing_company_checks.sql (and drizzle journal/snapshot, tool-managed)
- src/integrations/supabase/types.ts (regenerated)
- src/pages/dispatch/DispatchPortal.tsx
- src/test/billing-company-checks.test.ts (new)
- src/pages/management/__tests__/billingQueueDispatcher.test.tsx (new)
- src/pages/dispatch/__tests__/loadDetailOperatorAccess.test.tsx
- src/test/nav-target.test.ts
- docs/tms-build-status.md, docs/tms-wish-list.md, roadmap.md
- docs/passes/2026-09-25-1104-billing-company-checks.md (this file)

No edge function changed. No drizzle push/generate, no git commands, no secrets.
