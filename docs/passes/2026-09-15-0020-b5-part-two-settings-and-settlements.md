# Pass report — B5 part two: the per-carrier settings tables and the settlement family

Date: 2026-09-15 00:20 UTC. Mode: BUILD. Scope: two migrations, 19 tables.

## 1. The actual list, established live first

The re-cut said B5 was 66 staff-written populated tables / 4,891 rows. That count
no longer describes the work, and the pass established the list from the live
catalog (`pg_class` / `pg_attribute` + `query_to_xml` row counts, 2026-09-15)
before building.

At the start of the pass: 196 public tables, 145 without `company_id`. Removing
the recorded GLOBAL declarations, the deferred content tables, the B6
driver-written population, the four B7 logs and the B8 token/share tables left
the settings and settlement families as the reviewable staff-written remainder.

How it differed from the re-cut:
- Three tables the re-cut listed in B5 were already done (B5 part one:
  `settlement_settings`, `carrier_signature_settings`; and
  `inspection_binder_order` was named by the disposition sort, not the re-cut).
- The disposition sort (2026-09-14) moved tables between categories after the
  re-cut was written, so the re-cut's 66/4,891 is stale. It is not corrected
  arithmetic — it is a superseded population.
- `equipment_serial_conflict_dismissals` (4 rows) is still open; it was excluded
  from B4 for having rows and was not reached in this pass.

Groups built (one migration each):

- **Group A — 12 per-carrier settings tables.** The nine from the disposition
  sort (`company_settings`, `fleet_settings`, `load_number_config`,
  `dot_consultant_email_settings`, `insurance_email_settings`,
  `carrier_notification_settings`, `inspection_program_settings`,
  `pei_cadence_settings`, `dispatch_settlement_rates`), plus `mo_plates` and
  `notification_role_defaults` (owner decisions, 2026-09-14), plus
  `inspection_binder_order`.
- **Group B — 7 immutability-locked settlement tables.** `settlements`,
  `settlement_line_items`, `settlement_withheld_loads`, `dispatch_settlements`,
  `dispatch_settlement_line_items`,
  `dispatch_settlement_load_contributions`, `dispatch_settlement_charge_verdicts`.

Group C (the plain remainder) was NOT started. See §7.

## 2. Shape

Group A: nullable → backfill from the bare scalar subquery
`(SELECT id FROM public.carrier_profile)` (so a second carrier raises `21000`)
→ `SET NOT NULL`, no surviving default, FK `ON DELETE RESTRICT`, index on
`company_id`, and `aa_stamp_tenant_company_id BEFORE INSERT` calling the
canonical `public.stamp_tenant_company_id()` (SECURITY DEFINER, pinned
`search_path`, membership-first then operator, explicit `service_role` company
permitted, otherwise `42501` refusal). Shape 1 — the tables are staff-written
under an authenticated session, so the resolver has a caller to resolve.

Group B: the approved `ADD COLUMN NOT NULL DEFAULT <sole carrier>` followed by
`DROP DEFAULT` in the same migration, which fires no row trigger and therefore
did NOT require suspending any immutability lock. No deviation from the
2026-09-13 rejection was needed in this pass.

## 3. Group B derivation checks (the thing that proves the default was right)

Read-only, after the constant default was written and dropped. Every row's
company derived from its own parent, compared against what the default wrote:

| table | rows | agree with derived parent | distinct derived companies |
| --- | --- | --- | --- |
| `settlements` (via `operators`) | 1 | 1 | 1 |
| `settlement_line_items` (via settlement) | 1 | 1 | 1 |
| `settlement_withheld_loads` (via settlement) | 2 | 2 | 1 |
| `dispatch_settlement_load_contributions` (via `loads`) | 7 | 7 | 1 |
| `dispatch_settlement_line_items` (via dispatch settlement) | 9 | 9 | 1 |
| `dispatch_settlements` (via contributions) | 7 paths | 7 | 1 |
| `dispatch_settlement_charge_verdicts` (via contribution) | 3 | 3 | 1 |

No table derived more than one company, so no trigger suspension was
considered. All six settlement immutability triggers remain `tgenabled = 'O'`,
and a guard asserts that rather than memory.

## 4. Unique indexes and their disposition

Every unique index on the 19 tables was read from `pg_indexes`. Re-scoped to
lead with `company_id` (the record named the first three; the fourth and fifth
were found live and are additions to the record's list):

- `company_settings(setting_key)` → `company_settings_company_setting_key_uniq`
- `inspection_binder_order(scope)` → `inspection_binder_order_company_scope_uniq`
- `carrier_notification_settings(email)` → `carrier_notification_settings_company_email_uniq`
- `notification_role_defaults(role, category)` → `notification_role_defaults_company_role_category_uniq`
- `dispatch_settlements(payee_key, period_month)` → `dispatch_settlements_company_payee_period_uniq`

`equipment_serial_conflict_dismissals(conflict_key)`, which the record also
named, was NOT touched: the table is not in this pass.

Everything else on the 19 was a primary key or keyed on an id already owned by a
company (settlement/parent/load ids), and was left alone. A guard asserts the
five new names exist and the five global names they replaced are gone.

The first Group A migration attempt FAILED BEFORE ANY CHANGE, verbatim:

```
ERROR:  2BP01: cannot drop index company_settings_setting_key_key because constraint company_settings_setting_key_key on table company_settings requires it
HINT:  You can drop constraint company_settings_setting_key_key on table company_settings instead.
```

Retry dropped the CONSTRAINTS (not the indexes) first and succeeded.

## 5. Verification

Structural, live, all 19: `attnotnull = true`, `atthasdef = false`, no default
expression, exactly one `ON DELETE RESTRICT` FK to `carrier_profile`, exactly one
enabled `aa_stamp_tenant_company_id`. Every row: zero nulls, zero rows off the
live carrier.

Probe transaction (aborted by a final `RAISE`, so nothing survives):

- owner member insert into `mo_plates` → stamped `6b54d0e6-…b093dd` (SUPERTRANSPORT)
- the same insert supplying a scratch company → OVERWRITTEN to SUPERTRANSPORT
- a fresh draft `settlements` row + `settlement_line_items` child → both stamped SUPERTRANSPORT
- `service_role` naming the scratch company in `company_settings` → landed on the scratch company; `company_settings` then read 1 row for SUPERTRANSPORT and 1 for the scratch company, each seeing only its own
- non-member, non-operator session → refused, `42501`, verbatim:
  `Cannot resolve a company for this public.mo_plates row: the caller holds no company_members row and no server-side company was named. Refusing rather than defaulting to a carrier.`

An earlier probe attempt failed BEFORE writing anything, verbatim, and is
reported rather than hidden because it is evidence the locks work:

```
ERROR:  42501: Settlement f77911b0-50cd-4ae3-bff2-ebb0bc4331af is PAID; its breakdown is immutable.
CONTEXT:  PL/pgSQL function enforce_settlement_child_immutability() line 10 at RAISE
```

(a prior attempt also failed with
`ERROR: 42703: column "reason" of relation "settlement_withheld_loads" does not exist`
— a wrong probe, no write.)

Post-probe steady state, measured after the aborts: 1 carrier, 15 company
members, 1 owner, 560 policies (the 2026-09-14 baseline, unchanged), and the
row counts unchanged (`company_settings` 1, `mo_plates` 38, `settlements` 1,
`settlement_withheld_loads` 2).

## 6. Client paths adapted

`insertPayload(...)` added so the required column is not sent from the browser:
`FleetReminderIntervalDialog.tsx`, `CarrierNotificationRecipients.tsx`,
`EmailNotificationSettings.tsx` (upsert conflict target changed to
`company_id,role,category`), `MoPlateFormModal.tsx`.

## 7. What remains, and where the pass stopped

Stopped cleanly at a group boundary. Group C (the plain staff-written
remainder) was not begun. Live at the end of the pass: 122 tables still without
`company_id`, of which 100 are populated, 32,953 rows — this figure includes the
declared GLOBAL tables, the 8 deferred content tables, B6, B7 and B8, so it is
NOT all outstanding work. `equipment_serial_conflict_dismissals` (4 rows) is the
one table named by the record that is still open in B5.

## 8. Suites run, by name

- `src/test/tenancy-resolver.test.ts` — 64 tests. First full run: 63 passed, 1
  failed; the failure was a pooler connection fault, verbatim
  `psql: error: ... FATAL: (EAUTHQUERY) auth_query secret check timed out`, not
  an assertion. Re-run of that single test (`-t "a member IS stamped"`) passed.
  Two assertion failures were found and fixed during the pass: the stamped-table
  census had to name the 19 new tables deliberately, and the GLOBAL/DEFERRED
  declaration counts had to move (see below).
- `npx tsgo --noEmit` — clean.

New guards added to `src/test/tenancy-resolver.test.ts`: a B5-part-two block
asserting shape on all 19, that every row belongs to the live carrier, the five
per-company unique keys and the absence of the five global ones they replaced,
and that all six settlement immutability locks are still ENABLED.

Declaration lists changed to match the owner's 2026-09-14 decisions:
`notification_role_defaults` left GLOBAL (it is now per-carrier, asserted in the
new block) and `email_templates` left GLOBAL for DEFERRED alongside
`message_templates` (the nullable product-default / carrier-override shape). The
lists are now 18 GLOBAL and 8 DEFERRED.

## 9. Contradictions

- The re-cut's B5 population (66 tables / 4,891 rows) does not describe the
  live state and was superseded by the 2026-09-14 disposition sort. Reported in
  §1 rather than reconciled silently.
- The Supabase linter reported 180 findings after each migration, against a 172
  figure recorded on 2026-09-14. The delta is NOT attributed: the pass did not
  establish provenance for the eight, and no claim is made that these migrations
  caused them. It needs a dated re-baseline in its own pass.
- Otherwise none found.

## 10. Unverifiable with one real carrier

Steady-state cross-carrier invisibility. Every isolation observation in §5 comes
from a scratch company inside an aborted transaction.
