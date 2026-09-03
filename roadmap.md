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
