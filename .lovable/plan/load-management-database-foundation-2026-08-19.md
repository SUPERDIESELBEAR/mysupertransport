# Load Management — Database Foundation

Database-only change. No UI, no edits to existing tables.

## What gets created

Six enums: `load_status`, `load_type`, `equipment_type`, `load_handling_type`, `rate_type`, `stop_type` — values exactly as specified.

**loads** — the load record: identity and status, broker/operator/dispatcher links, equipment and handling, commodity and reference numbers, full rate structure (flat, per-mile, per-ton, FSC), reefer requirements and driver acknowledgment, team/hazmat/permit flags, the LOADOUT trailer block, driver accept/decline and dispatch/delivery timestamps, internal vs driver-facing notes, and created/updated attribution.

**load_stops** — ordered stops per load: sequence, stop type, facility and address, contact, appointment window, actual arrival/departure with lat/long capture, stop-off charge eligibility and amount, and notes.

## Access rules

- Management, owner, dispatcher: full read/write on both tables.
- Onboarding staff: read-only.
- Operators: see only loads assigned to them (matched through their operator record), and stops on those loads.
- Operators can update only their own driver actions — accept, decline (with reason), and reefer acknowledgment on a load; arrival, departure, and the four lat/long fields on a stop. Any attempt to change another column on their own row is rejected.
- No public/anonymous access.

## Automatic behavior

- `updated_at` stays current on both tables.
- A load cannot have two stops with the same sequence number.

## Technical details

Order per table: `CREATE TABLE` -> `GRANT` -> `ENABLE ROW LEVEL SECURITY` -> policies.

- Columns, types, defaults, and nullability exactly as specified. FKs: `broker_id` -> `brokers(id) ON DELETE RESTRICT`; `operator_id` -> `operators(id) ON DELETE SET NULL`; `dispatcher_id`, `created_by`, `updated_by` -> `profiles(id) ON DELETE SET NULL` for dispatcher; `load_id` -> `loads(id) ON DELETE CASCADE`.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No `anon` grant.
- Policies use `public.has_role(auth.uid(), 'role')`. Operator scoping resolves via `EXISTS (SELECT 1 FROM public.operators o WHERE o.id = loads.operator_id AND o.user_id = auth.uid())`, matching the existing pay_policy_assignments pattern; `load_stops` scopes through its parent load.
- Column-whitelist enforcement follows the existing `enforce_onboarding_status_operator_update` pattern: a `SECURITY DEFINER` `BEFORE UPDATE` trigger function per table (`enforce_loads_operator_update`, `enforce_load_stops_operator_update`) that, when the caller is an operator and not staff, raises unless every column other than the permitted set is unchanged. `EXECUTE` revoked from `public`, `anon`, `authenticated`; `search_path = public` pinned.
- Indexes: `loads(status)`, `loads(operator_id)`, `loads(dispatcher_id)`, `loads(broker_id)`, `loads(load_number)`, `loads(created_at)`, `load_stops(load_id)`, and composite `load_stops(load_id, stop_sequence)`.
- Unique constraint `load_stops(load_id, stop_sequence)`; `loads.load_number` unique.
- `BEFORE UPDATE` triggers on both tables calling `public.update_updated_at_column()`.
- No `CHECK` constraints on time-dependent values; `permit_recovery_method` stays plain text as specified.

Multi-tenant readiness: RLS predicates are role-based plus operator ownership only, so a `company_id` column and tenant filter can be ANDed in later without restructuring.
