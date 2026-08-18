# Pay Policy Engine — Database Foundation

Database-only change. No UI, no edits to existing tables.

## What gets created

**pay_policies** — reusable pay percentage templates (linehaul, FSC, detention, layover, TONU, stop-off, lumper, per-ton, loadout, other accessorials), with a company-default flag, active flag, effective date, and created/updated attribution.

**pay_policy_assignments** — links an operator to a pay policy for a date range. A null end date means the assignment is currently active.

One seed row: "SUPERTRANSPORT Standard", company default, with the specified defaults (72% linehaul/FSC/TONU/stop-off/per-ton/loadout/other, 100% detention/layover/lumper).

## Access rules

- Management and owner: full read/write on both tables.
- Dispatcher and onboarding staff: read only.
- Operators: can read only their own assignment rows, plus read the pay policies (needed to resolve their own rates).

## Technical details

Migration steps, in order per table: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → policies.

- Columns exactly as specified; `created_by` / `updated_by` reference `public.profiles(id)`; `operator_id` references `public.operators(id) ON DELETE CASCADE`; `pay_policy_id` references `public.pay_policies(id) ON DELETE RESTRICT`.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No `anon` grant.
- Policies use the existing `public.has_role(auth.uid(), 'role')` security-definer function. Operator self-read on assignments resolves via `operators.user_id = auth.uid()`.
- Unique partial index enforcing a single company default: `CREATE UNIQUE INDEX ... ON public.pay_policies (is_company_default) WHERE is_company_default;`
- Indexes on `pay_policy_assignments.operator_id` and `pay_policy_assignments.pay_policy_id`.
- `BEFORE UPDATE` triggers on both tables using the existing `public.update_updated_at_column()` function (`pay_policy_assignments` has `updated_at` and will be kept current by it too).
- Seed row inserted in the same migration with `ON CONFLICT DO NOTHING` semantics guarded by a name check, so re-running is safe.

Multi-tenant readiness: percentages stay data, never hardcoded; a `company_id` column can be added later without restructuring.
