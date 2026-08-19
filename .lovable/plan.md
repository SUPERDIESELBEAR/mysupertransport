# Broker Directory — Database Foundation

Database-only change. No UI, no edits to existing tables.

## What gets created

**broker_factoring_status** enum — `approved`, `not_approved`, `unknown`, `pending`.

**brokers** — the directory itself: company name, MC/DOT numbers, primary contact and billing details, mailing address, factoring status (with reason and timestamp), payment terms, average days to pay, notes, active flag, and created/updated attribution.

**broker_documents** — files tied to a broker (contract, bond certificate, authority certificate, rate template, insurance, correspondence, other), with expiration date, notes, and version tracking.

**broker_factoring_history** — an audit trail of every factoring status change, recording the previous status, the new status, reason, supporting documentation link, and who changed it.

## Access rules

- Management and owner: full read/write on all three tables.
- Dispatcher and onboarding staff: read, insert, and update on brokers and broker documents (so they can add a broker while building a load); read-only on factoring history.
- Operators: no access to any of these tables.

## Automatic behavior

- `updated_at` stays current on brokers and broker documents.
- Any change to a broker's factoring status automatically writes a history row capturing the old and new status, the reason, and the acting user — no manual logging needed.

## Technical details

Order per table: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → policies.

- Columns exactly as specified. `created_by` / `updated_by` reference `public.profiles(id)`; `broker_id` references `public.brokers(id) ON DELETE CASCADE`.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No `anon` grant.
- Policies use the existing `public.has_role(auth.uid(), 'role')` security-definer function (confirmed present, along with `public.update_updated_at_column()`).
- Indexes: `broker_documents(broker_id)`, `broker_factoring_history(broker_id)`, `brokers(company_name)`, `brokers(factoring_status)`.
- `BEFORE UPDATE` triggers on `brokers` and `broker_documents` calling `public.update_updated_at_column()`.
- New `SECURITY DEFINER` function `public.log_broker_factoring_change()` fired `AFTER UPDATE OF factoring_status ON public.brokers WHEN (old.factoring_status IS DISTINCT FROM new.factoring_status)`; it inserts into `broker_factoring_history` with `changed_by = auth.uid()` and `reason = new.factoring_status_reason`, and stamps `factoring_status_updated_at` via a companion `BEFORE UPDATE` step.
- No `CHECK` constraints on time-dependent values.

Multi-tenant readiness: no cross-table assumptions that block adding a `company_id` column later; RLS predicates are role-based only, so a tenant filter can be ANDed in without restructuring.
