# Roadmap

## In progress
- [done 2026-09-12] Make page titles and menu labels identical across portals;
  add missing titles/descriptions with the shared heading; encode deliberate exceptions
  (FAQ and My Truck) and add the navigation/title invariant guard. Pay Setup and Dispatch
  now have final owner decisions and must match their menu labels.
- Module 5 Pass 5 (DONE) — Late Accessorials reachable: dispatcher approval limit as a
  settlement setting (read inside `approve_accessorial_adjustment`, never passed),
  mandatory proof at submit with a charge-type proof map (PROPOSED BY THE BUILD,
  owner to confirm), load-page entry, management/dispatch review list, bell +
  sidebar count + over-a-day banner. Reachability prediction: 11 -> 6.
- [done 2026-09-10] Operator Preview placement: added to Management (Drivers group), moved out of Staff "Tools", and the two card actions labelled.
- [docs] Correct false "fuel unbounded exposure" entry in `docs/tms-build-status.md` (RESOLVED section, ~line 5757) and record the standing lesson about verifying code claims before they enter the record.

- Module 7 (Billing & Invoicing) — Pass 1 DONE 2026-09-04 (see build status).
  Next pass: invoice numbering + the builder that composes lines from
  `load_charges`, then the payment poster. Pass 1 delivered the schema only:
  enums, five tables
  (`invoices`, `invoice_line_items`, `invoice_batches`, `payments`,
  `ar_aging_snapshots`), `company_id` on every one, constraints, grants, RLS
  (management/owner only), submitted-invoice immutability with its own writer gate,
  live-catalog tests, purge-procedure registration, and the two-2%-figures coupling
  recorded as a column comment. No builder, no writer, no payments posting logic,
  no UI, no `supplemental_invoices`.
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
- Drop the orphaned `enforce_ica_contracts_operator_update()` definer function left
  by migration `20260903214629`, after verifying the whitelist trigger covers it.
- Rewrite `parked-and-termination-guardrail` census assertions as invariants, and
  record the "a guard asserts an invariant, not a census" standing rule.

## Done (2026-09-10)
- Drop `public.get_inspection_doc_by_token(uuid)` (legacy delegator, no callers);
  shrink `LEGACY_MAX` 80->79 and both definer-live-catalog ceilings; reachability
  guard 14 -> 13 findings. Recorded the family-revoke lesson and the full inventory
  of PUBLIC-granted `public` functions in `docs/tms-build-status.md`.

## Done (2026-09-10, later)
- Widen the function-reachability guard's in-database searches to EVERY schema
  (policies/function bodies/views) and print the scope in every failure message;
  revoke PUBLIC on `is_valid_application_draft_token` (anon kept, applicant upload
  reverified end to end); drop `can_driver_message_staff(uuid,uuid)`.
  Findings 13 -> 12 (guard fix) -> 11 (drop). Guard-scope lesson recorded:
  a guard that searches too narrowly gives confident wrong answers; its output is
  a candidate, not a verdict.

## Done (2026-09-10, uncalled-function sweep — the remaining six)
- Dropped `compliance_status(int,int)` (inlined into `v_compliance_items`),
  `eld_cron_status()` (superseded by the `eld_cron_runs` read in
  `ELDEscalationJobHealth.tsx`), `get_pei_requests_needing_action()` and
  `get_application_pei_summary(uuid)` (PEI Queue uses `get_pei_queue()`; the
  application PEI tab reads `pei_requests` directly).
- Kept and repinned `assign_user_role` / `remove_user_role` to
  `public, extensions`; allowlisted SUPERSEDED naming the seven service_role
  edge functions that actually assign and remove roles.
- Reachability: predicted 6 -> 2, got 6 -> 3, then 3 -> 1 after allowlisting.
  The difference is `get_user_roles`, which sat in the guard's six but not in the
  six sent for investigation. It stays RED and uninvestigated.
- OPEN QUESTION recorded: the `owner` role invariant now lives only in two
  functions nothing calls.

## Done (2026-09-11, the last uncalled function)
- Dropped `get_user_roles(uuid)`. Not housekeeping: SECURITY DEFINER, took ANY
  user id, no in-body self-or-staff check, `authenticated` could execute — so
  any signed-in user, operator included, could read another user's role array
  and see who holds `owner`. RLS closes that boundary everywhere else.
  Replacements: `useAuth` reading `user_roles` under RLS, `has_role()` (202
  policy expressions, 65 function bodies), direct service-role reads in edge
  functions.
- Ceilings: LEGACY_MAX 75 -> 74; KNOWN_AUTHENTICATED_EXECUTABLE_MAX 125 -> 124.
  Anon ceiling unchanged at 31 (anon EXECUTE was revoked 2026-09-03).
- Reachability guard: predicted 1 -> 0, got 1 -> 0. GREEN for the first time.
  The sweep that began with 16 findings is complete.

## Owner invariant (Passes 2-5)
- [done 2026-09-11] Pass 1: `user_roles_single_owner` partial unique index (at most one owner).
- [done 2026-09-11] Pass 2: trigger on `user_roles` refusing `owner` writes/deletes unless unlocked;
  `bootstrap_assign_owner` (zero-owner case only); fix `delete-user-account` to
  refuse owner targets (corrected Pass 1 finding; defence in depth for transfer).
- Pass 3: `transfer_owner` RPC + `owner_transfers` (management-only recipient,
  72h expiry, either-party cancel) — MUST be one atomic function, not two writes.
- Pass 4: UI + out-of-band email to the current owner with a cancel link.
- Pass 5: document the break-glass database procedure for an unavailable owner.


## Quarterly Inspection Program + Clean Roadside Bonus
- [done 2026-09-11] Staged migration (applies on draft accept):
  `inspection_program_settings` (configurable caps, bonus amounts, group months,
  reminder offsets, grace limits), `inspection_cycles`, `inspection_program_payments`,
  additive `roadside_stops.bonus_eligible/bonus_amount/report_submitted_at`,
  `grant_inspection_grace()` and `inspection_grace_used()` (both SECURITY DEFINER,
  `SET search_path = public, extensions`, PUBLIC/anon revoked). The grace allowance
  is read INSIDE `grant_inspection_grace` from settings, never passed by the caller.
- [done] `src/lib/inspectionProgram.ts` (group from unit last digit, cycle status,
  deadlines, launch + 60-day onboarding credit) and `src/lib/inspectionBonus.ts`
  (clean = zero violations; case-number and 24h checks are reviewer warnings, not blocks).
  25 tests across `inspectionProgram.test.ts` and `inspectionBonus.test.ts`.
- [done] UI: `QuarterlyInspectionPanel` in the Vehicle Hub detail drawer,
  `InspectionProgramPanel` at Management > Equipment > Inspection Program,
  collapsible `InspectionLevelGuide` in the roadside form, roadside list and review queue.
- [done] Fleet-wide inspection calendar tab added to `InspectionProgramPanel`, with
  year selector, group/status/search filters and one-click jump to the Vehicle Hub.
- [done] `supabase/functions/cron-inspection-reminders` — 30/14/3-day reminders,
  one send per driver per cycle per stage. Email lookup corrected to read from the
  operator's `application_id` -> `applications(email)`. NOT deployed and NOT scheduled:
  it reads the new tables, so deploy + `cron.schedule` after the draft is accepted.
- Overdue is an ADVISORY badge ("not dispatch eligible"), not a hard dispatch block.
- Deferred: CSA percentile and DataQ figures in the monthly summary stay manual —
  there is no FMCSA feed wired up.
