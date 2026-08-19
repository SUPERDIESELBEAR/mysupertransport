# Claim Flag History Audit Table

Adds an append-only audit trail for claim flags. Database only, no UI. No existing table is rebuilt — the only change to an existing object is one new trigger on `claim_flags`.

## New table: `claim_flag_history`

One row per claim-flag change, with the exact column list, types, and defaults from the request: identity (`claim_flag_id`, `load_id`), `action` (created / updated / resolved / reopened), before/after pairs for flag level, active state, resolution text, estimated amount and actual amount, plus `change_source`, `notes`, `changed_at`, `changed_by`, `created_at`. Claim flag and load references cascade on delete; the profile reference sets null.

## Trigger

An AFTER INSERT OR UPDATE trigger on `claim_flags`:

- INSERT writes one `created` row with all `previous_*` columns null.
- UPDATE writes a row only when `flag_level`, `is_active`, `resolution`, `estimated_claim_amount`, or `actual_claim_amount` actually changed, compared with `IS DISTINCT FROM`.
- Action on update: true to false on `is_active` is `resolved`, false to true is `reopened`, anything else is `updated`.
- `changed_by = auth.uid()` in all cases.

Ordering is guaranteed by timing, not naming: the existing `trg_claim_flags_sync_resolution` is a BEFORE UPDATE trigger, so an AFTER trigger always sees the final committed values. The new trigger is named `trg_claim_flags_zz_history` so it also sorts last among AFTER triggers.

The function follows the existing `log_broker_factoring_change` pattern: SECURITY DEFINER, `search_path = public`, with direct EXECUTE revoked from public, anon, and authenticated so only the trigger can run it.

## Security

- RLS enabled, using the existing `public.has_role()` function.
- Management, owner, dispatcher, and onboarding staff can SELECT. Operators get no access at all, matching `claim_flags`.
- No direct INSERT/UPDATE/DELETE policies — all writes come from the trigger.
- Grants: SELECT only to `authenticated`, ALL to `service_role`, no anon grant.

## Performance and multi-tenancy

- Indexes on `claim_flag_id`, `load_id`, and `changed_at`.
- No tenant-derived constraints; tenancy resolves through `load_id` today, so a `company_id` column plus a policy filter can be added later without restructuring.
