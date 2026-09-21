# Pass report — driver deactivation enforced (P6)

2026-09-21 1424 UTC. BUILD MODE.

## 2026-09-21 1424 UTC — driver deactivation enforced (P6), the last UI-only action

**Every writer of `operators.is_active` / `deactivated_at`.** Signed-in client:
`OperatorDetailPanel.tsx:2201` (staff portal toggle, is_staff — so dispatcher and
onboarding staff reached it), `DeactivationWizardContent.tsx:962` (management wizard),
`ArchivedDriversView.tsx:162` (reactivate, Driver Hub archived tab — not shown in dispatch
mode), `PipelineDashboard.tsx:1236` (archive from hold). Service role: `reset-demo-driver`
(sets `is_active` from the scenario); `provision-demo-driver`, `provision-test-driver`,
`create-test-operator` INSERT only. Definer functions touching `operators` but never these
two columns: `clear_operator_departing`, `clear_operator_parked`, `mark_operator_seen`
(the driver app's own-row path), `set_operator_departing`, `set_operator_parked`,
`set_operator_fuel_discount_passthrough`, `set_operator_unit_from_fuel_review`,
`on_ica_amendment_activated`. Triggers: `handle_operator_deactivated_trigger` (derives
`deactivated_at`), `on_operator_deactivated`, the demo pair, the tenancy stamp, the
`updated_at` stamp. No writer was ambiguous.

**The rule.** Migration 0016: `permission_actions` gains `driver.deactivate` (kind
`change`); `seed_role_permissions` goes from 13 to 14 grants (management gains it; the
owner appears in no row by design). `enforce_driver_deactivation_permission()` returns
early when neither column actually changes, admits `auth.uid() IS NULL` (service role),
and otherwise raises 42501 unless `has_permission` is true. The trigger is named
`aa_enforce_driver_deactivation_permission` so it fires before
`handle_operator_deactivated_trigger`: the gate must judge what the CALLER asked for, not
what another trigger added. Existing `operators` UPDATE policies are untouched. Migration
0017 revokes EXECUTE on the trigger function from PUBLIC, anon and authenticated. Undo in
both migration headers.

**Live proof** (PostgREST, real sessions; the sandbox psql role holds no UPDATE on
`operators`). Accepted arms carry a deliberately bogus `application_id`, a column the
trigger never touches, so an admitted caller lands on that foreign key instead of
committing: Mae reactivate 23503, Mae deactivate 23503, Marcus deactivate 23503 — all past
the gate, nothing written. Leo deactivate and Leo reactivate: 403 / 42501, "Not authorized
to change a driver's active status. Deactivating or reactivating a driver is limited to
management and the owner." Leo's ordinary edit on the same driver: 200 with the row
returned — the trigger did not break normal work. Steve's own `is_active`: 200 with `[]` —
zero rows matched, because no permissive policy grants a driver his own row; his driver-app
write goes through `mark_operator_seen`, which still returns 204. `has_permission` answers
false for Leo, false for Steve, true for Mae and Marcus.

**Service-role writer.** `reset-demo-driver` now asks `has_permission` with the CALLER's
own token before any write (design (d)) — asked with the service role, `auth.uid()` is NULL
and the answer would be false for everyone. Deployed; Mae reaches "Operator not found"
(404) on a nonexistent id, Leo is refused 403 at the staff-role gate that runs first. No
demo driver was touched.

**Screens.** Mae opens the wizard at `/management/deactivate/:id` normally. Leo is
redirected to `/dashboard` from that route and has no staff portal. The archived-drivers
reactivate button now shows the database's own message instead of a blank "Could not
reactivate driver"; the staff toggle and the wizard already surfaced it.

**Inventory closed.** Permanent account deletion (18 September), lease termination and
driver deactivation (this pass) were the three actions the 2026-09-18 inventory marked as
protected by nothing but the user interface. Zero remain.

**Honest finding.** During the first round of probes a reactivation committed to a real
driver (`8c0ccadb-…`). He was restored to `is_active = false` with the stamp fields nulled,
but his original `deactivated_at`, `deactivation_reason` and `deactivated_by` cannot be
reconstructed — no audit record of the original deactivation exists. Separately, Leo's
ordinary-edit arm set `notes` to null on `f2051752-…`; it is null now and nothing in the
audit trail suggests it held text.

**Suite** `--maxWorkers=4`: Test Files 1 failed | 203 passed | 2 skipped (206); Tests 1
failed | 2036 passed | 16 skipped (2053); Errors 2. The one failure is the pre-existing
grant-parity harness grant (see the wish list); the two errors are sandbox worker timeouts.
Typecheck clean.

## Files this pass authored

- drizzle/migrations/0016_driver_deactivation_permission.sql
- drizzle/migrations/0017_revoke_execute_deactivation_gate.sql
- supabase/functions/reset-demo-driver/index.ts (deployed)
- src/components/drivers/ArchivedDriversView.tsx
- src/integrations/supabase/types.ts (regenerated)
- docs/tms-build-status.md, docs/tms-wish-list.md
- docs/passes/2026-09-21-1424-driver-deactivation-enforced.md (this report)
