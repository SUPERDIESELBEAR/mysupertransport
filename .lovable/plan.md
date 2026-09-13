# Tenancy step 2 — batching plan for `company_id`

Read-only. Every figure below is from a live query run 2026-09-13, not from the record.

**Live baseline.** 193 tables in `public`. Nine already carry `company_id`: the eight billing
tables plus `company_members` (added in step 1). So **184 tables lack it**, not 185 — the
difference is `company_members` itself, which arrived after the proposal was written.
Of those 184, **56 are empty**, which matches expectation exactly.

---

## 1. FK dependency order

**There is one cycle, and it is real:** `brokers.primary_document_id → broker_documents →
brokers`. Every other cycle the catalog reports (68 paths) routes through that same pair —
`loads → brokers → broker_documents → brokers`, and so on. There is no second independent
cycle.

The cycle does **not** block adding the column: `ALTER TABLE ADD COLUMN` has no ordering
constraint. It only matters for a backfill that derives a child's company from its parent,
and there the pair must be broken by hand: backfill `brokers` from the single company row
directly, then `broker_documents` from `brokers`.

Order that matters for derivation, parents first:

```text
tier 0  carrier_profile (the company itself), profiles, company_members
tier 1  operators, applications, brokers, equipment_items, facilities, pay_policies,
        eld_device_models, truck_owners, fuel_import_batches, mo_plates, services
tier 2  loads, ica_contracts, onboarding_status, contractor_pay_setup, broker_documents,
        driver_documents, inspection_documents, settlements, dispatch_settlements,
        equipment_assignments, fuel_transactions, invoices*
tier 3  load_stops, load_documents, load_charges, load_references, claim_flags,
        settlement_line_items, dispatch_settlement_* , deductions, ica_amendments,
        inspection_cycles, roadside_stops, rods_days, fuel_transaction_lines
tier 4+ everything hanging off tier 3 (history, citations, verdicts, installments,
        acknowledgments, notifications, violations, documents-of-documents)
```

**No FK to any other business table** (order irrelevant, backfill is the single company id):
`audit_log`, `notifications`, `share_tokens`, `email_send_log`, `email_send_state`,
`email_templates`, `email_unsubscribe_tokens`, `suppressed_emails`, `eld_cron_runs`,
`preview_sessions`, `pipeline_config`, `company_settings`, `fleet_settings`,
`settlement_settings`, `load_number_config`, `notification_role_defaults`,
`inspection_binder_order`, `release_notes`, `staff_help_knowledge`, `faq_history`,
`resource_history`, `mo_plates`, `carrier_notification_settings`,
`insurance_email_settings`, `dot_consultant_email_settings`, `pei_cadence_settings`,
`inspection_program_settings`, `staff_ui_preferences`, `user_view_preferences`,
`revert_courtesy_email_defaults`, `staff_messaging_settings`, `equipment_items`.

**Honest limit:** with one company in `carrier_profile`, every backfill resolves to the same
literal id whatever the join. The derivation logic is therefore *written* but not *tested* by
this step. Only the fictitious company (step 5) can test it.

## 2. Batches by risk

Seven batches. The row counts are live.

| # | What | Tables | Rows | Why grouped |
|---|---|---|---|---|
| B1 | Empty tables | 56 | 0 | No backfill, no trigger can fire, no index rebuild. Column + `NOT NULL` + stamp trigger in one migration. |
| B2 | Spine parents with identity uniqueness | 8 | ~750 | The real work: `equipment_items` (219, two serial indexes), `loads` (17, `load_number`), `applications` (338, `lower(email)`), `operators` (154), `profiles` (170), `user_roles` (182), `brokers` (12), `facilities` (2). Each needs an index decision from §4. |
| B3 | Rows, no identity-bearing unique index | ~70 | ~2,900 | Mechanical. `load_stops` 35, `load_charges` 4, `ica_contracts` 64, `contractor_pay_setup` 56, `cert_reminders` 50, `forecast_*` 544, `mo_plate_assignments` 60, `active_dispatch` 79, etc. |
| B4 | Immutability-locked | 13 | ~50 | §5. Small but each needs its own unlock; keep them apart from mechanical work. |
| B5 | The four large logs | 4 | 22,030 | `notifications` 10,752 · `dispatch_daily_log` 5,772 · `audit_log` 3,969 · `email_send_log` 2,043. Own batch on size alone — the `NOT NULL` validation and the rewrite are the only long locks in step 2. |
| B6 | Mid-large children | ~14 | ~6,300 | `operator_documents` 1,182 · `eld_cron_runs` 1,030 · `driver_vault_documents` 822 · `inspection_documents` 774 · `share_tokens` 693 · `pei_request_events` 527 · `document_acknowledgments` 361 · `equipment_assignments` 278 · others. |
| B7 | Close-out | — | — | `NOT NULL` on anything left nullable, stamp-trigger parity sweep, unique-index diff, guard tests. No DDL on new tables. |

Correction to expectation: `dispatch_daily_log` belongs in B5 on size **and** carries a
duplicated unique index (`dispatch_daily_log_op_date_uniq` and `unique_operator_log_date`
are the same two columns) — two indexes to rebuild, not one.

## 3. Tables that should NOT get the column

Recommended global:

- **`carrier_profile`** — it *is* the company. Its `carrier_profile_singleton` unique index
  (`btree ((true))`) must be dropped before a second company can exist. This is the single
  hardest blocker in step 2 and it is one line.
- **`company_members`** — already the join; a second `company_id` would be circular.
- **`profiles`** — one row per auth user (`profiles_user_id_key` on `user_id`). A person is
  one person; their company reach is membership, not a column here.
- **`eld_device_models`** — the FMCSA registered/revoked device catalogue. Federal reference
  data; duplicating it per tenant means one tenant misses a revocation.
- **`suppressed_emails`, `email_unsubscribe_tokens`** — deliverability state belongs to the
  sending domain, which is shared. A bounce is a bounce for every tenant.
- **`release_notes`** — SUPERDRIVE product notes, not carrier data.

Recommended tenant data despite looking global: `company_settings`, `fleet_settings`,
`settlement_settings`, `load_number_config`, `pay_policies`, `carrier_signature_settings`,
`inspection_program_settings`, `pei_cadence_settings`, `inspection_binder_order`,
`email_templates`, `notification_role_defaults`, `audit_log`, `share_tokens`. Every one of
these is a business rule or an audit trail that must differ between carriers.

**Needs your decision, not mine:** `faq`, `services`, `service_resources`,
`staff_help_knowledge`, `pipeline_config`. These are content SUPERTRANSPORT authored. Global
means every tenant sees SUPERTRANSPORT's FAQ; per-tenant means seeding it for each. My lean
is per-tenant with a nullable "global" row set, but that is a product choice.

## 4. Unique indexes

Live unique indexes (non-PK) on tables gaining the column, with a recommendation each:

**Must become per-company (leading `company_id`):**
- `loads_load_number_key (load_number)` — ST-numbering restarts per carrier.
- `applications_email_non_draft_unique (lower(email)) WHERE NOT is_draft` — one driver may
  apply to two carriers.
- `idx_equipment_items_canonical_serial_uniq (device_type, canonical_serial) WHERE status <> 'deactivated'`
  and `idx_equipment_items_serial_type` — **the named hard case.** Real serials do not
  collide across carriers, but the fictitious company will use fabricated ones that do. Go
  per-company; global uniqueness here buys nothing and blocks demo seeding.
- `user_roles_single_owner (role) WHERE role = 'owner'` — as it stands a second tenant
  **cannot have an owner**. This is a hard multi-tenant blocker and easy to miss.
- `pay_policies_single_company_default (is_company_default) WHERE is_company_default` — same
  shape, same fix.
- `carrier_signature_settings_singleton ((true))`, `settlement_settings` singleton,
  `company_settings_setting_key_key`, `load_number_config`, `pipeline_config_stage_key_key`,
  `email_templates_milestone_key_key`, `notification_role_defaults (role, category)`,
  `inspection_binder_order_scope_key`, `carrier_notification_settings_email_key`.
- `uq_facilities_name_city_state_active` — each carrier keeps its own facility list.
- `fuel_transactions_dedup_key (invoice_no, invoice_date, card_no)` — two carriers can
  receive the same provider invoice number.
- `rate_con_ingest_queue_attachment_sha256_key` — the same rate con is emailed to both
  carriers on a co-brokered load; today the second one silently dedupes away.

**Must stay global:** every token and idempotency index —
`share_tokens_scope_resource_unique`, `binder_share_bundles_token_key`,
`document_short_links_share_token_key`, `ica_review_links_token_key`,
`applications_draft_token_key`, `application_correction_requests_token_key`,
`onboard_assignment_sheets_access_token_key`, `rods_days_certification_token_key`,
`inspection_documents_share_token_idx`, `passenger_authorizations_response_token_key`,
`idx_pei_requests_token`, `preview_sessions_code_hash_key`,
`rods_divergences_idempotency_key_key`, `rods_unlock_events_idempotency_key_key`,
`rate_con_ingest_queue_resend_email_id_key`, `idx_email_send_log_message_sent_unique`.
A token is resolved *before* the tenant is known; scoping it per company would either break
resolution or make two tenants able to mint the same token.

**No change needed:** anything already keyed on an entity that is itself company-scoped —
`settlements_operator_id_period_start_key`, `contractor_pay_setup_operator_unique`,
`onboarding_status_operator_id_key`, `active_dispatch_operator_id_key`,
`load_stops_load_sequence_unique`, `deduction_installments (deduction_id, …)`,
`dispatch_settlement_*` pairs, `truck_state_permits (operator_id, state_code)`,
`inspection_cycles (operator_id, cycle_year, cycle_month)`. Scoping the parent scopes these.

**Precedent held:** `invoice_number_config_company_id_year_key`, `invoices_company_number_key`,
`invoice_batches_company_number_key`, `accessorial_adjustments_company_reference_key` and
`ar_aging_snapshots_daily_uniq` already lead with `company_id`. Follow that shape.

## 5. Immutability triggers

Live triggers on tables gaining the column, and whether an `UPDATE … SET company_id = …`
would be refused:

**Refused unconditionally — append-only, no escape clause in the function body:**
`application_document_history` (`RAISE EXCEPTION 'application_document_history is append-only'`,
12 rows), `fuel_disagreement_acceptances` (0), `eld_revoked_list_checks` (0),
`rods_divergences` (0), `inspection_document_versions` (8).

**Refused conditionally:** `settlements` (1 row) and `settlement_line_items` /
`settlement_withheld_loads` refuse when the settlement is `paid` unless
`settlement_writer_active()` is set; `dispatch_settlements` (1) and its two children refuse
the same way via `dispatch_settlement_writer_active()`. `rods_days` (2) refuses when the day
is certified or locked; `rods_events` (0) refuses when its day is locked, with a
`rods.privileged` escape. `messages` (18) restricts recipient-side updates only — a
service-role backfill is unaffected. `onboarding_status` (154) and `inspection_documents`
(774) only pin specific columns (ELD signature, share token) and will pass.

**The unlock, per shape:**
1. Locked/append-only tables: `ADD COLUMN company_id uuid NOT NULL DEFAULT '<company>'`
   followed by `ALTER COLUMN … DROP DEFAULT` **in the same migration**. This is a table
   rewrite, fires **no row triggers**, and needs no `UPDATE` at all. Needs your sign-off
   because the standing rule bans defaults — the rule is about a *persisting* default, and
   this one does not survive the migration. That reading is yours to confirm.
2. If you prefer no default at any moment: `ALTER TABLE … DISABLE TRIGGER <name>`, update,
   re-enable, all inside the migration. Rejected as the primary route because it opens a
   window in which any concurrent write bypasses a federal-record lock.
3. Settlement families already have the sanctioned route — set the writer-active flag around
   the update. Use it there rather than either of the above.

## 6. Verification per batch

Beyond `count(*) WHERE company_id IS NULL = 0`:

- **Column shape:** `attnotnull` true, `atthasdef` false, and `pg_get_expr` null for every
  table in the batch — proves no default survived.
- **Value correctness:** `count(DISTINCT company_id) = 1` and that value equals the live
  `carrier_profile.id`; zero rows whose `company_id` is absent from `carrier_profile`.
- **Nothing else changed:** row count per table captured before and after and compared, not
  eyeballed; `553` policy count unchanged; `grant_parity_report()` still zero rows; the
  unique-index inventory diffed against the pre-batch snapshot so a rebuilt index is proved
  to have gained `company_id` and nothing else was dropped.
- **Stamping actually works:** an insert as an authenticated member with a *spoofed*
  `company_id` comes back stamped with the real one; the same insert by a non-member is
  refused. This is the step-1 probe repeated per batch, rolled back.
- **Locked tables still locked:** after the batch, the append-only refusal still raises its
  verbatim message. A backfill that quietly left a trigger disabled must fail here.
- **Batch 5 only:** the `NOT NULL` validation timed, and confirmation the four indexes on
  those tables are still `indisvalid`.
- **Every batch:** `npx tsgo --noEmit`, plus `tenancy-resolver`, `policy-grant-parity`,
  `grant-parity-live`, `definer-search-path`, `definer-fail-open`, `purge-path-coverage`
  (step 2 adds tables the 13-step purge must reach).

---

CONTRADICTIONS: none found. Two reconciliations, neither a conflict: the proposal's "185
tables" is 184 today because `company_members` was created afterward and carries the column;
and the record's `equipment_items` count of 219 and the largest-table figures all match live.
