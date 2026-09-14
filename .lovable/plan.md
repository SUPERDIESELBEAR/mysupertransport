# Re-cutting the remaining tenancy batches

Read-only pass. Nothing was changed. Every figure below comes from a live catalog
query run in this session.

## 1. The actual inventory

**178 tables still lack `company_id`, holding 33,833 rows.** 18 tables already carry it.
193 public tables in total.

The plan's "~70 tables / ~2,900 rows" for B3 was measuring only the *middle* of the
remaining set — tables with rows and no non-primary unique index. That filter silently
excluded 55 empty tables and, because the four largest logs *do* carry unique indexes
(`email_send_log`, `dispatch_daily_log`) or were assigned to B5 on paper, the row total
understated by roughly sevenfold. The B3 stop measured 69 tables / 21,861 rows against
the same filter and found the same discrepancy. Neither figure describes the real work.

Write paths, taken from the live `INSERT`/`ALL` policies (207 of them) and from
`pg_proc` for the definer-only paths:

- staff-only (`is_staff(auth.uid())` or role tests): the large majority
- signed-in driver, keyed to his own `operators` row: 45 tables
- `service_role` only: `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`,
  `suppressed_emails`, `operator_offboarding_steps`
- anonymous: **`applications` is the only table with an `anon` INSERT grant.**
  `share_token_access_log` and `document_short_links` are written on the anonymous path,
  but through SECURITY DEFINER functions (`_share_token_gate`, `get_or_create_short_link`)
  — no anon grant on the table itself.

FK parents were read from `pg_constraint`; every child of `loads`, `operators`, `brokers`,
`equipment_items` and `applications` hangs off a parent that either already carries
`company_id` (the first four) or is deliberately global (`applications`).

## 2. The re-cut: six batches

**B4 — empty tables. 31 tables, 0 rows.**
`vacant_units`, `truck_state_permits`, `truck_plate_history`, `staff_messaging_settings`,
`staff_help_threads`, `staff_help_messages`, `staff_email_overrides`,
`settlement_settings_history`, `rm_deposits`, `rm_deposit_transactions`,
`pay_policy_assignments`, `pandadoc_documents`, `inspection_program_payments`,
`inspection_cycles`, `ica_amendments`, `ica_amendment_units`, `driver_staff_contacts`,
`driver_staff_contact_suppressions`, `document_send_log`,
`dispatch_settlement_rates_history`, `dispatch_deductions`, `detention_claims`,
`deductions`, `deduction_installments`, `company_documents`, `cash_advances`,
`broker_notes`, `broker_factoring_history`, `broker_documents`,
`broker_do_not_load_history`, `broker_contacts`.
No backfill can fail. Column, FK, stamp, index only.

**B5 — staff-written with rows. 66 tables, 4,891 rows.**
Largest: `dispatch_status_history` 1,486, `eld_cron_runs` 1,051, `pei_request_events` 527,
`equipment_assignments` 278, `onboarding_status` 154, `pei_requests` 144,
`fuel_transaction_lines` 125. This is the batch the plan called "mechanical" — it
genuinely is, because the writer always resolves through membership.
It carries the two remaining global singletons: `settlement_settings_singleton_check`
(`CHECK (singleton)`) and `email_send_state_id_check` (`CHECK (id = 1)`), plus
`carrier_signature_settings_singleton` (`UNIQUE ((true))`). All three must become
per-company or a second company cannot have settlement rules, a signature block, or an
email-send cursor.

**B6 — driver-written. 45 tables, 3,999 rows. Own batch, own verification.**
Largest: `operator_documents` 1,184, `driver_vault_documents` 843, `inspection_documents`
774, `document_acknowledgments` 365, `forecast_loads` 275, `forecast_expenses` 273,
`preview_sessions` 119, `contractor_pay_setup` 56. Includes the whole ELD/RODS set
(`rods_days`, `rods_events`, `rods_amendments`, `rods_divergences`, `rods_unlock_events`,
`rods_correction_requests`, `eld_malfunction_events`, `eld_extension_requests`,
`eld_devices`, `eld_sync_alerts`, `eld_malfunction_notifications`), the messaging set,
the service-library set, `equipment_receipts`, `load_documents`, `document_exceptions`,
`passenger_authorizations`, `roadside_stops` and children.
A mistake here surfaces as a driver who cannot certify a log, so it goes after B5 and
before the logs.

**B7 — the four large logs. 4 tables, 22,716 rows.**
`notifications` 10,822, `dispatch_daily_log` 5,859, `audit_log` 3,984,
`email_send_log` 2,051. Grouped on size alone; each gets its own migration so a long
`NOT NULL` validation never blocks another table.

**B8 — token and share tables. 6 tables, 884 rows.**
`share_tokens` 693, `share_token_access_log` 156, `document_short_links` 25,
`binder_share_bundles` 8, `ica_review_links` 2, `officer_packet_links` 0. Separate
because their writer is a definer function reached anonymously — see §3.

**Declared GLOBAL, no `company_id` — 26 tables, 1,343 rows.**
`applications` and its seven children (correction requests/fields, document history,
interview notes, resume tokens, invites, revision attachments), `profiles`,
`carrier_profile` itself, and the reference/content tables: `faq`, `faq_history`,
`services`, `service_resources`, `resource_documents`, `resource_history`,
`release_notes`, `pipeline_config`, `email_templates`, `eld_device_models`,
`eld_revoked_list_checks`, `notification_role_defaults`,
`revert_courtesy_email_defaults`, `staff_help_knowledge`, `email_unsubscribe_tokens`,
`suppressed_emails`.
Each needs a one-line declaration with its reason before the batch that would otherwise
have swept it up. The email-suppression pair is the one genuine open question: a
suppressed address is a property of the address, not of a carrier.

Order: **B4 → B5 → B6 → B7 → B8**, globals declared before B5.

## 3. Stamping shape per table

- **Shape 1 (membership trigger, `current_company_id()`):** every table in B4, B5, B6.
  The resolver is membership-first with an operator fallback, so both staff and drivers
  resolve; a caller who is neither still resolves to NULL and the NOT NULL column refuses.
- **Shape 2 (service-role may name the company; membership still wins and overwrites):**
  `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`,
  `operator_offboarding_steps`, `notifications` (cron inserts), `audit_log`
  (edge-function inserts), `eld_cron_runs`, `preview_sessions`, `cert_reminders`.

**Fits neither — B8.** `share_token_access_log` is inserted by `_share_token_gate`, which
runs on behalf of an *anonymous* visitor: there is no membership and no operator row, so
`current_company_id()` is NULL, and it is not service-role either.
The only correct source is the token's own row. That means a **third shape: derive the
company from the parent record inside the definer function** — stated plainly as a third
shape, not smuggled in. `document_short_links` has the same problem via
`get_or_create_short_link` (anon-executable). The other four B8 tables are created by
signed-in staff and use Shape 1; only the *access log* is anonymous.

## 4. The index sweep

82 unique non-primary indexes on the 178 tables, read from `pg_index`. Dispositions by
what the key actually is:

**Must become per-company** (key is a name or scalar a second company would legitimately
reuse): `company_settings(setting_key)`, `inspection_binder_order(scope)`,
`carrier_notification_settings(email)`, `fuel_transactions(invoice_no, invoice_date,
card_no)`, `dispatch_settlements(payee_key, period_month)`,
`equipment_serial_conflict_dismissals(conflict_key)`,
`carrier_signature_settings((true))`, plus the two singleton CHECKs named in B5.

**Stay global, deliberately:** every token index — `share_tokens(scope, resource_id)`,
`binder_share_bundles(token)`, `ica_review_links(token)`,
`document_short_links(share_token)`, `rods_days(certification_token)`,
`onboard_assignment_sheets(access_token)`, `pei_requests(response_token)`,
`passenger_authorizations(response_token)`, `application_correction_requests(token)`,
`inspection_documents(public_share_token)`, `preview_sessions(code_hash)`,
`email_unsubscribe_tokens(token)`, `rods_divergences(idempotency_key)`,
`rods_unlock_events(idempotency_key)`, `rate_con_ingest_queue(attachment_sha256 /
resend_email_id)`. A token must be globally unique or the lookup is ambiguous.
`carrier_profile(usdot_number)` is global by decision (2026-09-14).
`applications(lower(email))` and `applications(draft_token)` are global by the
applications decision.

**Unchanged, no company needed:** the ~55 remaining indexes are keyed on an id whose
parent already carries `company_id` — `operator_id`, `load_id`, `message_id`, `user_id`,
`equipment_id`, `deduction_id`, `event_id`, `cycle_id`, `resource_id`, `broker_id`,
`document_id`, `dispatch_settlement_id`. Two rows in different companies cannot share
such a key, so scoping adds nothing.

**Duplicate found:** `dispatch_daily_log` carries two identical unique indexes,
`dispatch_daily_log_op_date_uniq` and `unique_operator_log_date`, both on
`(operator_id, log_date)`. One should be dropped in B7 rather than both maintained.

**Triggers moving with an index:** for each index scoped per-company, the sweep checks
`pg_trigger` for a function enforcing the same rule and moves it too — as
`enforce_equipment_serial_uniqueness` had to in B2.

## 5. Verification per batch

Common to all: row counts before/after per table, policy count unchanged,
`grant_parity_report()` zero rows, a scratch second company rolled back, and the owner
still resolving as sole owner of SUPERTRANSPORT. Every probe runs in an aborting
transaction — the 2026-09-14 lesson.

- **B4** — structural only: NOT NULL, no default, FK `RESTRICT`, stamp present.
- **B5** — a staff insert per singleton table succeeds for a scratch second company while
  SUPERTRANSPORT keeps its own row.
- **B6, the one that matters** — a real signed-in driver session (Steve Figueroa, used in
  the last two passes) exercising: upload a document (`operator_documents`), acknowledge
  an agreement (`document_acknowledgments`), file a forecast row, and read his ELD cache.
  **Certifying a log cannot be exercised here** — `certify_rods_day`'s live RPC arm is one
  of the two permanent named skips and needs a device; the structural check is that
  `rods_days`/`rods_events` stamp correctly on a scratch insert as the driver.
- **B7** — timing per table, and the duplicate index resolved.
- **B8** — an anonymous share-token fetch still works and writes an access-log row
  carrying the token's company.

## Contradictions

Three, all in the plan rather than the database:

1. **B3's size.** The plan says ~70 tables / ~2,900 rows. The real remaining set is 178
   tables / 33,833 rows, and no subset of it matches the plan's figure.
2. **`notifications`, `dispatch_daily_log`, `audit_log`, `email_send_log`** are assigned
   to B5 in the plan but qualify for B3 under the plan's own filter — 22,716 rows sitting
   in the wrong batch.
3. **"Mechanical" is wrong for 45 tables.** They are driver-written; they were blocked
   until 2026-09-14 and they carry the risk that a mistake stops a driver working.
