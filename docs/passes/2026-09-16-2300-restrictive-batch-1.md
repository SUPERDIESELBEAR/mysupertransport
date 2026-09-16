# 2026-09-16 23:00 UTC — restrictive tenant policy, BATCH 1 (staff-only tables)

Mode: BUILD. Read first: the 2026-09-16 status entries (pilot batch of four;
2226 UTC ambiguity), `docs/passes/2026-09-16-1920-restrictive-policy-precheck.md`
(batch order, section h), `docs/passes/2026-09-16-1840-read-enforcement-census.md`.
No contradiction with the record was found before STEP 1.

## STEP 1 — the batch, chosen live

Query (`/tmp/b1/cand2.sql`): permissive policies admitting `authenticated` (or
`{public}`) classified with the census order SERVICE → COMPANY → ROLE-ONLY →
OWNERSHIP → OTHER; kept tables where `bool_and(class IN ('ROLE-ONLY','SERVICE'))`;
joined to tables having a `company_id` column; excluded RESTRICTIVE_DONE +
`company_members`, the 25 realtime tables from the pre-check, the 12 financial
tables, `user_roles`/`company_members`, the token tables, and the two
policy-less tables (`document_short_links`, `message_notification_throttle`,
excluded as token/no-policy).

Result: **45 candidates** — 21 with rows, 24 empty.

Row counts:

```
equipment_items|219            parser_diagnostics|82
mo_plate_assignments|60        load_change_history|47
mo_plates|38                   notification_role_defaults|35
document_version_history|17    dispatch_settlement_load_contributions|7
equipment_serial_conflict_dismissals|4
dispatch_settlement_charge_verdicts|3
carrier_notification_settings|2
claim_flag_history|1  claim_flags|1  company_settings|1
dispatch_settlement_rates|1  dot_consultant_email_settings|1
fleet_settings|1  insurance_email_settings|1  load_number_config|1
pay_policies|1  pei_cadence_settings|1
(24 further candidates at 0 rows)
```

Batch = rows first, capped at 25 → the 21 nonempty candidates plus 4 empty
broker tables. **4 of the 25 selected tables are empty.**

```
broker_contacts, broker_do_not_load_history, broker_documents,
broker_factoring_history, carrier_notification_settings, claim_flag_history,
claim_flags, company_settings, dispatch_settlement_charge_verdicts,
dispatch_settlement_load_contributions, dispatch_settlement_rates,
document_version_history, dot_consultant_email_settings, equipment_items,
equipment_serial_conflict_dismissals, fleet_settings, insurance_email_settings,
load_change_history, load_number_config, mo_plate_assignments, mo_plates,
notification_role_defaults, parser_diagnostics, pay_policies,
pei_cadence_settings
```

Remainder for batch 2 (all empty, 20, from `comm -23` of candidates vs batch):
`broker_notes`, `cash_advances`, `company_documents`, `detention_claims`,
`dispatch_deductions`, `dispatch_settlement_rates_history`,
`document_send_log`, `eld_devices`, `eld_extension_requests`,
`eld_malfunction_notifications`, `eld_sync_alerts`, `pay_policy_assignments`,
`rm_deposit_transactions`, `rm_deposits`, `roadside_stop_documents`,
`roadside_stop_violations`, `settlement_settings_history`,
`staff_email_overrides`, `truck_plate_history`, `vacant_units`.

CORRECTION recorded honestly: an intermediate summary in this pass said
`broker_notes` and `notification_role_defaults` were wrongly omitted from the
batch. That was wrong — `notification_role_defaults` IS in the batch and
`broker_notes` is an empty remainder table. The earlier row-count listing also
printed 23 empties, omitting `dispatch_deductions`; the live `comm` check
resolved 45 = 25 + 20.

## STEP 2/4 — real-session counts, before and after

Sessions minted with `lovable auth-session --json --user <uuid>` for
Marcus Mueller (owner, `5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`),
Leo Wallace (dispatcher, `7d80cc10-4e82-4e96-a8e2-70bb9c1b46ef`),
Mae Lauron (onboarding_staff/management, `2cedd3ac-cd90-46fb-8c43-bfe7595264ea`),
Steve Figueroa (driver, `878be880-396a-4dd6-9ae1-787df2a5e749`),
Donald Alleyne (truck owner, `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`).
Counts via PostgREST `HEAD`/`Prefer: count=exact`, 5 identities × 25 tables =
125 rows in `/tmp/b1/before.txt` and `/tmp/b1/after.txt`.

After the migration: `IDENTICAL: all 125 counts unchanged`.

Service-role counts could NOT be obtained. Verbatim, for every table:

```
ERROR:  permission denied to set role "service_role"
```

That line of the prompt is therefore UNPROVEN, not passing.

## STEP 3 — the migration

For each of the 25 tables, exactly:

```sql
CREATE POLICY tenant_isolation ON public.<table>
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

Ledger: all 25 moved from `PENDING_RESTRICTIVE` to `RESTRICTIVE_DONE` in
`src/test/tenancy-resolver.test.ts` (done 4 → 29, pending 143 → 118).

## STEP 5 — writes

Screen: Equipment Inventory (`src/components/equipment/EquipmentInventory.tsx`);
write path `src/components/equipment/EquipmentItemModal.tsx:186-189`. As Mae:

1. insert without `company_id` → 201, stamped SUPERTRANSPORT;
2. insert with spoofed `company_id` → 201, trigger overwrote it;
3. normal update → 204;
4. update setting a random `company_id` → refused:
   `{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy \"tenant_isolation\" for table \"equipment_items\""}`.

Cleanup: first filtered delete returned `error code: 1101` with residue 2;
deleting each scratch id returned 204; residue 0, `equipment_items` back to 219.

## STEP 6 — guard and suites

Guard failure (staleness), verbatim:

```
AssertionError: stale PENDING_RESTRICTIVE entries: expected [ Array(1) ] to deeply equal []
+ ["equipment_items: declared pending but already carries a restrictive policy"]
```

File restored with `cmp` clean; suite green 122/122 with the pre-existing
unhandled `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`.

A guard that was WRONG. `grant-parity-live` failed:

```
parser_diagnostics | authenticated | INSERT | policy "tenant_isolation" admits authenticated for INSERT but the role holds no INSERT grant
```

`grant_parity_report()` looped over all policies; a RESTRICTIVE policy grants
nothing, and `parser_diagnostics` INSERT is deliberately RPC-only. The function
now filters `p.polpermissive` (migration this pass, comment recorded in the
body). Report now returns zero rows; suite green.

Counts: policies **589** (564 + 25); restrictive policies **29** (4 + 25);
linter **172**, same five categories. `npx tsgo -p tsconfig.app.json --noEmit`
exit 0.

Suites run green: tenancy-resolver (122), tenancy-helper-ambiguity,
definer-live-catalog, definer-search-path, definer-fail-open,
policy-grant-parity, notification-isolation, function-reachability,
grant-parity-live (after the fix), actor-stamp-fk, billing-schema,
caller-evaluated-functions, dispatch-settlement-screen, equipment-serial-guard,
fuel-import-live, invoice-dispatch-reconciliation, load-dispatcher-editing,
operator-pay-exposure, payments-schema, return-sheet-device-enum,
settlement-adjustment-seam, shared-pay-percentage-source-guard,
e2e/blueGraceLoadPath.

RED, NOT caused by this pass: `src/test/dispatch-settlement-schema.test.ts`,
10 failures. Causes, both predating this pass:

```
AssertionError: expected [ …(25) ] to deeply equal [ …(24) ]   (+ "company_id:uuid:NO")
ERROR:  Cannot resolve a company for this public.dispatch_settlements row: the caller
holds no company_members row and no server-side company was named. Refusing rather
than defaulting to a carrier.
HINT:  Staff must have a company_members row; service-role callers must pass company_id explicitly.
CONTEXT:  PL/pgSQL function stamp_tenant_company_id() line 14 at RAISE
```

`dispatch_settlements.company_id` and its stamp trigger date from B5 part two
(2026-09-15); the restrictive policies are `TO authenticated` and cannot reach
the sandbox psql role. Left failing and reported, not edited.

## STEP 7 — screens for the owner

Staff portal: Equipment Inventory (`equipment_items`,
`equipment_serial_conflict_dismissals` via `SerialConflictsPanel`), MO Plate
Registry (`mo_plates`, `mo_plate_assignments`), Operator Detail Panel
(`insurance_email_settings`, `dot_consultant_email_settings`), Document editor
(`document_version_history`), Staff email category prefs
(`notification_role_defaults`), PEI cadence card + Application PEI tab
(`pei_cadence_settings`).
Dispatch portal: Dispatch Board and Loads list (`claim_flags`,
`claim_flag_history`, `load_change_history` via `src/lib/loadDetail.ts`),
Brokers list / broker detail (`broker_contacts`, `broker_documents`,
`broker_do_not_load_history`, `broker_factoring_history` via
`src/lib/brokerRelationship.ts`), rate-con parsing diagnostics
(`parser_diagnostics`).
Management portal: Fleet reminders and DOT inspections (`fleet_settings`),
Deactivation page (`mo_plate_assignments`), ELD carrier notification recipients
(`carrier_notification_settings`), Fuel discount passthrough / settlement run
(`pay_policies`), dispatch settlement run (`dispatch_settlement_rates`,
`dispatch_settlement_load_contributions`, `dispatch_settlement_charge_verdicts`).
No clickable screen was found for `company_settings` or `load_number_config`
(configuration read by server paths).

## Changed files

- migration: 25 `tenant_isolation` policies (one statement per table).
- migration: `public.grant_parity_report()` narrowed to permissive policies.
- `src/test/tenancy-resolver.test.ts` — ledger 29 done / 118 pending.
- `docs/tms-build-status.md`, `docs/tms-wish-list.md`, this report.

## Boundary

Still ONE carrier. These 25 policies are proven not to hide anything from the
five real people who use the system; they are NOT proven to hide another
carrier's rows, because no other carrier's rows exist.

## Prompt

The final prompt line was complete, not truncated.
