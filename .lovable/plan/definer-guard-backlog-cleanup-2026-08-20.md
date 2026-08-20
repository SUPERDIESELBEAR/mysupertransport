# Definer Guard Backlog Cleanup

Goal: both guard suites (`definer-search-path`, `definer-live-catalog`) green, with every function fixed rather than exempted wherever fixing is the correct answer. No guard is loosened; no assertion is relaxed.

## What the suites actually report right now

Six failing assertions, verified by running both suites against the live database:

1. 25 live SECURITY DEFINER functions pinned to `public` alone and unaccounted for by either guard.
2. 29 file-resolved definer functions whose pin omits `extensions`.
3. 2 trigger functions (`clear_binder_pending_on_stage2_received`, `company_settings_stamp_updated_by`) executable by anon and authenticated — a client role should never hold EXECUTE on a trigger function.
4. 5 definer functions anon-executable and not in the inventory: the two trigger functions above plus `get_ica_review_link`, `get_share_bundle_meta`, `resolve_share_bundle`.
5. 12 definer functions authenticated-executable and not in the inventory (the load/claim RPC set plus `current_profile_id`).
6. 4 legacy allowlist entries that no longer match any offender.

## Fixes (not registrations)

**Re-pin.** One migration re-authors each offending function with `CREATE OR REPLACE ... SET search_path = public, extensions`, body byte-identical to the live definition (pulled from `pg_get_functiondef`, so no logic drifts). This covers the load-management set — `update_load_status`, `assign_load_driver`, `unassign_load_driver`, `create_load_with_stops`, `check_driver_eligibility`, `check_driver_eligibility_bulk`, `generate_load_number`, `current_profile_id`, `manage_claim_flag` — and the trigger functions from the same work (`log_load_status_change`, `log_claim_flag_change`, `log_broker_factoring_change`, `sync_claim_flag_resolution`, `stamp_facilities_actor`, `stamp_document_exception_resolution`, `stamp_broker_factoring_status_change`, `set_load_document_uploader`, `enforce_loads_operator_update`, `enforce_load_stops_operator_update`, `company_documents_set_version`, `company_documents_supersede_prior`, `company_settings_stamp_updated_by`, `clear_binder_pending_on_stage2_received`), plus the older stragglers the same assertion lists (`get_staff_contact_info`, `submit_application_draft`, `sync_ica_completion_to_onboarding`, `sync_inspection_doc_to_dot`, `get_share_bundle_meta`, `get_ica_review_link`). Repinning removes them from both the file guard and the live public-only guard, so no exemption entry is needed for any of them.

**Revoke where the grant is wrong.** Every trigger function in the set gets `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` — Postgres checks that privilege at `CREATE TRIGGER` time, so revoking costs nothing and closes failures 3 and 4's trigger half. `current_profile_id()` also loses its `authenticated` grant: it is referenced only inside other definer bodies and by no RLS policy (checked `pg_policy` and `pg_proc.prosrc`), so nothing calls it as a client.

**Grants matched to each caller.** The RPCs the app really calls stay granted to `authenticated` only, with `PUBLIC` and `anon` revoked explicitly: `update_load_status`, `assign_load_driver`, `unassign_load_driver`, `create_load_with_stops`, `check_driver_eligibility`, `check_driver_eligibility_bulk`, `generate_load_number`, `manage_claim_flag`. Call sites confirmed in `src/lib/loadDetail.ts`, `CreateLoadPage.tsx`, and the load-detail dialogs.

## Registrations that are genuinely correct

Three functions are token-gated public endpoints reached from unauthenticated pages — `get_ica_review_link` (`IcaReview.tsx`), `get_share_bundle_meta` and `resolve_share_bundle` (`BinderShareBundlePage.tsx`). Their anon EXECUTE is the intended surface, so they are added to `KNOWN_ANON_EXECUTABLE` with a comment naming the page that calls them, and `KNOWN_ANON_EXECUTABLE_MAX` is bumped from 54 to 57 in the same diff. Before adding each one I confirm its body gates on a valid token and returns no financial data; if one does not, it gets the gate instead of the entry.

The eight authenticated RPCs above are added to `KNOWN_AUTHENTICATED_EXECUTABLE`, each with a one-line comment stating the in-body role gate it enforces, and `KNOWN_AUTHENTICATED_EXECUTABLE_MAX` moves from 73 to 81. `get_ica_review_link` and `get_share_bundle_meta` are added there too where they hold the grant.

## Allowlist hygiene

The four stale entries in `LEGACY_PUBLIC_ONLY_PINS` are deleted and `LEGACY_MAX` is lowered accordingly — plus any further entries that stop matching once the repin migration lands. The list only shrinks.

## Wiring the guards into the default run

`npm test` is `vitest run`, and the vitest `include` glob already picks up all three definer suites, so a new unregistered function fails the default run today. What is missing is `test:guards`, the fast pre-commit subset: it lists `definer-search-path` but not `definer-live-catalog` or `definer-fail-open`. Both get added to that script, so the subset that people actually run before pushing includes the authoritative database-backed check. `definer-live-catalog` prints its loud banner and skips its DB assertions when `PGHOST` is absent — that behaviour is left alone.

## Verification

Run both suites plus `definer-fail-open` and the full `vitest run`, read the output in full, and re-query `pg_proc` to confirm no definer function in `public` is left with a public-only pin or an unexpected anon grant. I will report exactly which functions needed fixing versus which were registered.
