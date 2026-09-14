# Tenancy disposition sort — 145 tables without `company_id`

All counts below come from live queries run this pass against `pg_constraint`,
`information_schema.columns`, `information_schema.tables` and `pg_stat_user_tables`.
Nothing was changed, and no disposition is written here.

Live baseline: 196 public base tables. 51 carry `company_id`. 145 do not.

Reconciliation to the record's 137: the 145 include the 20 already declared GLOBAL,
`email_send_state`, and the 6 deferred content tables; the 137 also count 9 tables that
already have the column but no recorded batch.

---

## 1. Structural pile — no decision needed

**56 tables** are reachable from an already-scoped parent through an unbroken chain of
**NOT NULL** foreign keys. Query: recursive walk from the 51 scoped tables plus
`carrier_profile` along FK edges whose referencing columns are all NOT NULL.

**Depth 1 — 46 tables, parent named by the FK column**

Via `operators(operator_id)` (36): `active_dispatch`, `blank_log_acknowledgments`,
`cert_reminders`, `contractor_pay_setup`, `dispatch_daily_log`, `dispatch_status_history`,
`documents`, `driver_vault_documents`, `eld_devices`, `eld_extension_requests`,
`eld_malfunction_events`, `equipment_assignments`, `equipment_receipts`,
`equipment_return_confirmations`, `forecast_deductions`, `forecast_expenses`,
`forecast_loads`, `ica_contracts`, `lease_terminations`, `officer_packet_links`,
`onboard_assignment_sheets`, `onboarding_status`, `operator_departing_events`,
`operator_documents`, `operator_offboarding_steps`, `operator_parking_events`,
`roadside_stops`, `rods_amendments`, `rods_correction_requests`, `rods_days`,
`rods_divergences`, `rods_unlock_events`, `settlements`, `truck_dot_inspections`,
`truck_maintenance_records`, `truck_owners`.

Via `loads(load_id)` (10): `claim_flag_history`, `claim_flags`,
`dispatch_settlement_load_contributions`, `document_exceptions`, `load_change_history`,
`load_charges`, `load_documents`, `load_references`, `load_status_history`, `load_stops`.

**Depth 2 — 10 tables**: `dispatch_settlement_charge_verdicts` (via
`dispatch_settlement_load_contributions`), `ica_driver_acknowledgments` (`ica_contracts`),
`load_reference_citations` (`load_references`), `onboard_assignment_sheet_items` and
`onboard_assignment_sheet_sends` (`onboard_assignment_sheets`), `roadside_stop_documents`
and `roadside_stop_violations` (`roadside_stops`), `rods_events` (`rods_days`),
`settlement_line_items` and `settlement_withheld_loads` (`settlements`).

**Structural in intent, but the link is nullable or not a foreign key at all — 33 tables.**
These are not decisions either, but they cannot be scoped by inheritance as they stand:

- Nullable FK to a scoped parent: `eld_sync_alerts`, `mo_plate_assignments`,
  `passenger_authorizations`, `operator_broadcast_recipients`, `fuel_transactions`,
  `share_token_access_log`, `staff_event_acknowledgments`, `parser_diagnostics`,
  `rate_con_ingest_queue`, `dispatch_settlement_line_items`, `messages`,
  `eld_malfunction_notifications`, `driver_uploads`, `service_help_requests`,
  `staff_help_query_log`.
- Owner column with no FK: `driver_documents` and `driver_optional_docs` (`driver_id`
  NOT NULL), `inspection_documents` (`driver_id` nullable), `pei_requests`
  (`application_id` NOT NULL).
- Owner is a person, not a row in a scoped table (`user_id` NOT NULL): `notifications`,
  `notification_preferences`, `staff_ui_preferences`, `user_view_preferences`,
  `thread_participants`, `message_reactions`, `document_acknowledgments`,
  `service_resource_bookmarks`, `service_resource_completions`, `service_resource_views`,
  `message_notification_throttle`. Their company is resolvable from the person
  (`company_members`, then `operators`) but not by a join to a scoped table.
- Children of `applications`, which is declared GLOBAL: 7 tables — they inherit GLOBAL,
  and that is settled by the parent, not open.

### Own column, or parent join? Recommendation

**Recommend: every one of these tables gets its own `company_id`, stamped from the parent.**

- A parent-join policy has to be written and re-verified per table and per policy, and it
  evaluates per row on every read; a child two levels down needs a two-table join in each
  of its four policies. The cost is paid on every query, forever.
- Uniqueness cannot be scoped through a join at all. Per-company unique indexes need the
  column locally.
- Immutability triggers and audit reads also need the value locally to fail closed.
- The cost of the column is one-time: nullable add, backfill from the parent, NOT NULL,
  RESTRICT FK, stamp trigger. That is the shape already run seven times.

The one case for a join is a leaf with no policies of its own and no uniqueness. There are
few enough of those that the uniformity is worth more than the saved columns.

---

## 2. Ambiguous pile — genuine business decisions (13 tables)

| Table | The question, in business terms | Cost of "each carrier's own" | Cost of "SUPERDRIVE's" |
|---|---|---|---|
| `company_settings` | Does each carrier configure its own operating settings? | None — this is what it is for | Wrong: carriers would share settings |
| `fleet_settings` | Does each carrier set its own fleet rules? | Per-carrier setup work at onboarding | One carrier's fleet rule silently governs another's trucks |
| `load_number_config` | Does each carrier number its own loads from its own sequence? | Each carrier needs a prefix and a starting number | Load numbers collide across carriers |
| `inspection_program_settings` | Does each carrier run its own inspection program, or does SUPERDRIVE prescribe one? | Setup per carrier | Carriers with different inspection cadences cannot both be served |
| `pei_cadence_settings` | How often previous employers are chased — carrier's call or product default? | Setup per carrier | A carrier cannot chase faster than the product allows |
| `inspection_binder_order` | Does each carrier decide the order documents appear in an officer's binder? | Setup per carrier | All carriers show the same binder order |
| `carrier_notification_settings` | Does each carrier choose which alerts it receives? | Setup per carrier | Alerts are the same for everyone |
| `dot_consultant_email_settings` | Does each carrier name its own DOT consultant? | Setup per carrier | Wrong: one carrier's consultant receives another's compliance mail |
| `insurance_email_settings` | Does each carrier name its own insurance contact? | Setup per carrier | Same leak as above |
| `message_templates` | Are canned messages a carrier's own wording, or SUPERDRIVE's? | Each carrier writes its own | Carriers send identical wording; a carrier cannot phrase things its way |
| `mo_plates` | Is the Missouri plate pool one carrier's property? | Correct if plates are carrier-owned | Plates appear assignable across carriers |
| `dispatch_settlement_rates` | Does each carrier set what it pays its dispatchers? | Setup per carrier | One carrier's dispatcher pay reaches another's settlement |
| `share_tokens` | Are public share links a carrier's own, or a shared token space? | Token space partitions cleanly | Tokens are global; a token names data across carriers |

Thirteen is inside the ten-to-fifteen expectation, so the structural rule holds. `eld_cron_runs`,
`preview_sessions`, `audit_log`, `email_send_log`, `document_short_links`,
`binder_share_bundles`, `ica_review_links`, `equipment_serial_conflict_dismissals`,
`message_threads`, `operator_broadcasts`, `fuel_import_batches`, `fuel_transaction_lines`,
`fuel_disagreement_acceptances`, `pei_accidents`, `pei_request_events`, `pei_responses`,
`document_version_history`, `inspection_document_versions` are infrastructure or children —
structural, and listed as such above or in the batch notes, not decisions.

One question sits under the person-owned tables and should be answered before them:
**can one person work for two carriers at once?** If yes, a person's preferences and
notifications must be per person **and** per carrier. If no, the person's company is a
lookup and no column is needed on the preference rows.

---

## 3. Federal pile — confirmed by FK, not assumed (18 tables)

Hours-of-service, inspection and roadside data. Every one below was checked for a NOT NULL
FK; the inheritance holds except where noted.

| Table | Parent (FK) | Inheritance holds |
|---|---|---|
| `rods_days` | `operators(operator_id)` NOT NULL | Yes |
| `rods_events` | `rods_days(rods_day_id)` NOT NULL | Yes |
| `rods_amendments` | `operators(operator_id)` + `rods_days(rods_day_id)` NOT NULL | Yes |
| `rods_divergences` | `operators(operator_id)` NOT NULL | Yes |
| `rods_unlock_events` | `operators(operator_id)` NOT NULL | Yes |
| `rods_correction_requests` | `operators(operator_id)` NOT NULL | Yes |
| `blank_log_acknowledgments` | `operators(operator_id)` NOT NULL | Yes |
| `eld_devices` | `operators(operator_id)` NOT NULL | Yes |
| `eld_extension_requests` | `operators(operator_id)` NOT NULL | Yes |
| `eld_malfunction_events` | `operators(operator_id)` NOT NULL | Yes |
| `truck_dot_inspections` | `operators(operator_id)` NOT NULL | Yes |
| `truck_maintenance_records` | `operators(operator_id)` NOT NULL | Yes |
| `roadside_stops` | `operators(operator_id)` NOT NULL | Yes |
| `roadside_stop_documents` | `roadside_stops(stop_id)` NOT NULL | Yes |
| `roadside_stop_violations` | `roadside_stops(stop_id)` NOT NULL | Yes |
| `eld_malfunction_notifications` | `eld_malfunction_events(event_id)` **nullable** | **No** — needs its own column or a NOT NULL parent |
| `eld_sync_alerts` | `operators(operator_id)` **nullable** | **No** — same |
| `inspection_documents` / `inspection_document_versions` | `driver_id` with **no FK**; versions hang off `inspection_documents` | **No** — the chain never reaches a scoped table |

Three federal-data breaks, and they are the same class as the timezone defect: a §395.8 or
inspection record whose company cannot be derived from its own row. These should be scoped
explicitly with their own column rather than left to inheritance.

---

## 4. The two declarations to revisit

**`email_templates`** — 0 rows live, no FK, no `company_id`. Declared GLOBAL on 2026-09-14,
and the record itself flags that it was recorded on weak authority.
- For tenant: the wording a carrier sends to its drivers is that carrier's voice, and
  editing a template today would change every carrier's mail.
- For global: templates carry product structure and variables; per-carrier copies must each
  be migrated when a variable changes, and a carrier can override by content rather than by row.

**`notification_role_defaults`** — 0 rows live, no FK, no `company_id`. Declared GLOBAL
2026-09-14.
- For tenant: which role gets which alert is how a carrier organises its office; a
  three-person carrier and a thirty-person carrier do not route alerts the same way.
- For global: these are *defaults*, and per-user `notification_preferences` already exists
  for divergence; keeping defaults global means new alert types reach everyone at once.

Both belong in the ambiguous pile. Neither is decided here.

---

## 5. What the declaration requirement should become

Today it binds only tables a batch reached, so "declared" means "was in a batch".

**Proposal: a structural guard that reads the live table list and asserts every public table
has a recorded disposition** — one of PER-COMPANY (has the column), GLOBAL, DEFERRED, or
INHERITS-*parent* — from a checked-in registry, and fails naming any table absent from it.

Worth building: yes. It is the only mechanism that has caught draft-area work reaching the
database three times, and it turns "nobody decided" into a failing test instead of an audit.

**Predicted first run: 114 failures** — the 114 tables with neither a column nor a
disposition. If the guard also requires a disposition for tables that already have the
column but no recorded batch, the first run reports **123**.

---

## Contradictions

1. The record's 137 and this pass's 145 are the same set counted differently — 145 lack the
   column, 137 lack a disposition. Worth stating once in the record.
2. `inspection_documents` and `inspection_document_versions` hold federal inspection data
   with no FK to any scoped table. The record treats the inspection binder as structural.
3. `eld_sync_alerts` and `eld_malfunction_notifications` are federal-class rows whose only
   link to a company is nullable.
