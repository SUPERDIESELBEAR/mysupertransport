# Roadmap

## In progress
- ICA re-send blocked: drop the redundant `trg_enforce_ica_contracts_operator_update`
  wrapper trigger that illegally calls another trigger function by name.
- Deactivation notice confirmation must name the actual recipients, not the saved
  DOT Consultant.

- Module 4 (dispatch company settlement) — Pass 1: schema only. Enum, five tables,
  constraints, grants, RLS, immutability trigger pair, live-catalog tests, purge-list
  registration. No computation function, no line-item writer, no UI.

## Next
- Pass 2: extract the shared period/pay-policy pieces and pin the caller test.
- Pass 3: the pure `computeDispatchSettlement`, verified against the six seed loads.
- Pass 4: the writer RPC and attribution rollup.
- Pass 5: the management screen.

## Done (2026-09-03)
- Resume-link lockout: consume on a human gesture, 30-minute idempotent reuse window,
  `used_at` written after the application resolves, recoverable dead end. Three findings
  recorded as known debt (bearer `draft_token`, no consumption forensics, duplicate
  resume-email log rows).
- [docs] Update section 5 of SECURITY INCIDENT with 2026-09-03 access investigation result
- [docs] Record authoritative cutover purge procedure in `docs/tms-build-status.md`,
  replacing the incomplete list, and document the revenue-layer demo isolation blocker.

## Done (2026-09-04)
- Fix `useAuth.tsx` `fetchProfile` silent failures: inspect `error` on profile read,
  distinguish no-row/error/success with `ProfileLoadResult`, verify `pending → active`
  update wrote before updating local state, and surface failures via `profileError` /
  `profileMissing`. Added `src/hooks/__tests__/useAuth.test.tsx` (5 tests passing).
- [docs] Record standing note in `docs/tms-build-status.md`: `information_schema.role_table_grants`
  produces false negatives; use `pg_class.relacl` or `has_table_privilege()` for grant
  verification, and distinguish `permission denied` from RLS zero-row filtering.
