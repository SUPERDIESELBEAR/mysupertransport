# Load Status History & Claim Flags — Database Foundation

Adds an automatic audit trail for load status changes and a claim/hold flag system that the future settlement engine can read. Database only, no UI. No existing tables are rebuilt.

## New enum types

- `claim_flag_level` — watch, hold, cleared
- `claim_type` — damaged_goods, late_delivery, shortage, service_failure, rate_dispute, documentation_issue, other

## New tables

**`load_status_history`** — one row per load status transition: previous status, new status, when, who changed it, the change source (dispatcher, driver app, system, billing), and notes. Written only by the trigger below.

**`claim_flags`** — one row per claim or hold raised against a load: flag level, claim type, who reported it, estimated and actual claim amounts, description, documentation link, active flag, and the resolution trail (resolution, notes, resolver, timestamps).

Both use the exact column list, types, and defaults given in the request. Load references cascade on delete; profile references set null.

## Automatic status history trigger

An AFTER UPDATE trigger on `loads`, firing only when the status value actually changes, inserts the transition row with `changed_by = auth.uid()`. It follows the same pattern as the existing broker factoring history trigger: SECURITY DEFINER, pinned search path, with direct EXECUTE revoked from public, anon, and authenticated so only the trigger can run it.

## Security

- RLS enabled on both tables, using the existing `public.has_role()` function.
- `load_status_history`: management, owner, dispatchers, and onboarding staff can view all rows; operators can view history only for their own loads. No one can write directly — all writes come from the trigger. Only SELECT is granted to signed-in users; full access goes to the service role.
- `claim_flags`: management, owner, and dispatchers have full read/write; onboarding staff view only; operators have no access at all.
- No anon grant on either table.

## Performance and maintenance

- Indexes: `load_status_history(load_id)`, `(changed_at)`, `(new_status)`; `claim_flags(load_id)`, `(flag_level)`, `(is_active)`.
- Partial index on `claim_flags(load_id) WHERE is_active AND flag_level = 'hold'` so the settlement engine can skip held loads cheaply.
- BEFORE UPDATE trigger on `claim_flags` calling the existing `public.update_updated_at_column()`.

## Multi-tenant readiness

No tenant-derived constraints; tenancy resolves through `load_id` today, so a `company_id` column plus a policy filter can be added later without restructuring.
