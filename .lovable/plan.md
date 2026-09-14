# Tenancy disposition audit — how many tables are in an undecided state

Read-only. Nothing was changed. Live catalog read 2026-09-14 19:50 UTC; the record read
is `docs/tms-build-status.md` (13,213 lines) and `.lovable/plan.md` as it stood before
this file was overwritten (the 2026-09-14 re-cut).

**Live totals:** 196 public tables. **51 carry `company_id`. 145 do not.**

Of the 145: **20 declared GLOBAL** (2026-09-14), **6 declared DEFERRED** (2026-09-14),
**1 declared GLOBAL** on 2026-09-13 (`email_send_state`), **4 named for batch B7**, and
**114 with no disposition of any kind**. Of those 114, **43 do not appear anywhere in
the record at all** — not once, in 13,213 lines.

## 1. The thirteen tables from the 2026-09-13 §3 list

That list is not in `docs/tms-build-status.md`. Only the corrections from that pass
reached it, which is confirmed by search: the phrase never appears, and neither do
several of the table names.

| Table | `company_id` today | What the record says today | Disposition |
| --- | --- | --- | --- |
| `company_settings` | no | **Zero occurrences in the record.** The re-cut's index sweep (plan file only, never copied into the record) says `company_settings(setting_key)` "must become per-company" | none in the record |
| `fleet_settings` | no | **Zero occurrences.** | none |
| `settlement_settings` | **yes** | 2026-09-14: primary key moved to `(company_id)`, "one settlement settings row per carrier" | PER-COMPANY — agrees with 09-13 |
| `load_number_config` | no | 6 mentions, all operational: "The generator locks the single `load_number_config` row", "reset to 1" | none |
| `pay_policies` | **yes** | 2026-09-14 B3: per-company default index, stamped | PER-COMPANY — agrees |
| `carrier_signature_settings` | **yes** | 2026-09-14: `UNIQUE ((true))` → `UNIQUE (company_id)` | PER-COMPANY — agrees |
| `inspection_program_settings` | no | 1 mention, about a draft migration not being applied. Nothing on tenancy | none |
| `pei_cadence_settings` | no | **Zero occurrences.** | none |
| `inspection_binder_order` | no | 1 mention, about binder records. Index sweep (plan file only) says `inspection_binder_order(scope)` "must become per-company" | none in the record |
| `email_templates` | no | 2026-09-14: declared GLOBAL, with the note "Recorded GLOBAL on the re-cut's authority only" and a flag that no reasoning exists | **GLOBAL — contradicts 09-13** |
| `notification_role_defaults` | no | 2026-09-14: GLOBAL, "Product defaults for what each role is notified about" | **GLOBAL — contradicts 09-13** |
| `audit_log` | no | 22 mentions, every one about purge order or row counts. The one tenancy statement is the re-cut's batch list: `audit_log` is one of the four large logs in **B7** | per-company by batch assignment, never by declaration |
| `share_tokens` | no | **Zero occurrences in the record.** Named in the plan file's B8 list only | none in the record |

Three agree because they were migrated. Two contradict. Six have no disposition in the
record at all. Two (`audit_log`, `share_tokens`) are named only as batch members, which
is a schedule, not a reasoned disposition.

## 2. Every table with no recorded disposition and no `company_id` — 114

**43 that appear nowhere in the record.** These are the ones indistinguishable from
tables that were missed:

`binder_share_bundles` `carrier_notification_settings` `cert_reminders`
`company_settings` `dispatch_status_history` `document_version_history`
`dot_consultant_email_settings` `driver_documents` `driver_optional_docs` `eld_devices`
`eld_malfunction_notifications` `eld_sync_alerts` `fleet_settings` `ica_review_links`
`inspection_document_versions` `insurance_email_settings` `message_reactions`
`message_templates` `message_threads` `mo_plate_assignments` `mo_plates`
`officer_packet_links` `onboard_assignment_sheet_sends` `operator_broadcast_recipients`
`operator_broadcasts` `passenger_authorizations` `pei_accidents` `pei_cadence_settings`
`pei_request_events` `pei_responses` `rods_amendments` `rods_correction_requests`
`rods_divergences` `rods_unlock_events` `service_resource_bookmarks`
`service_resource_completions` `service_resource_views` `share_tokens`
`staff_event_acknowledgments` `staff_help_query_log` `thread_participants`
`truck_dot_inspections` `truck_maintenance_records`

Three of these hold federal ELD or roadside data (`eld_devices`, `rods_amendments`,
`rods_correction_requests`, `rods_divergences`, `rods_unlock_events`,
`truck_dot_inspections`) — the same class as the timezone defect that was called the
highest-severity item in the tenancy work.

**71 mentioned but never dispositioned.** Mentioned often, always operationally:
`settlements` (42), `load_charges` (37), `fuel_transactions` (29), `settlement_line_items`
(22), `lease_terminations` (19), `load_stops` (16), `fuel_transaction_lines` (15),
`load_change_history` (14), `dispatch_settlements` (13), `onboarding_status` (13),
`load_documents` (12), `fuel_import_batches` (11), `dispatch_settlement_rates` (9),
`equipment_assignments` (9), `load_number_config` (9), `parser_diagnostics` (9),
`claim_flags` (7), `settlement_withheld_loads` (6), `load_references` (6),
`active_dispatch` (5), `dispatch_settlement_charge_verdicts` (5),
`dispatch_settlement_load_contributions` (5), `preview_sessions` (5), and 48 more with
four or fewer.

Money tables are in this group. `settlements`, `settlement_line_items`, `load_charges`,
`invoices`' children by association, `fuel_transactions` — heavily discussed, never
declared either way.

## 3. Where today's declaration contradicts 2026-09-13

**`email_templates`** — 09-13: tenant data, because a carrier's email wording is its
own. 2026-09-14: GLOBAL, on the grounds that it sits in a table of reference content.
Today's entry already flags that the GLOBAL side has no written reasoning; the
tenant-side reasoning existed but never reached the record. Both positions are now
known, and they are opposite.

**`notification_role_defaults`** — 09-13: tenant data. 2026-09-14: GLOBAL, "product
defaults for what each role is notified about". This is a real disagreement on merits: a
carrier plausibly decides which of its roles get which alerts, and equally plausibly
inherits a product default. Nothing in the record settles it.

No other contradiction exists among the thirteen, because the remaining eleven either
already agree (three migrated) or have no second position to contradict.

## 4. Should any of today's twenty declarations be revisited?

**Two of the twenty: `email_templates` and `notification_role_defaults`.** Both were
written from a record that did not contain the 09-13 recommendation. Each now looks
settled and is not. `email_templates` was already flagged in the same entry, which is
the only reason it is visible.

**The other eighteen do not appear to be affected**, on the evidence available: none of
them is on the 09-13 §3 list, and their reasons (applicants are unauthenticated; a
profile is one auth user; `carrier_profile.id` *is* the company; the FMCSA device list;
SUPERDRIVE's own changelog; the shared sending domain) do not depend on anything the
missing list said. That is a statement about this one missing document, not a clean bill
of health: the same failure mode could hide another chat-only decision, and this audit
can only see what was written down.

## 5. A separate finding, not asked for but in scope

**Nine tables already carry `company_id` and appear in no recorded batch:**
`invoices`, `invoice_line_items`, `invoice_batches`, `invoice_number_config`, `payments`,
`ar_aging_snapshots`, `factoring_remittances`, `accessorial_adjustments`,
`unit_number_config`.

All nine are `NOT NULL`, no default, FK to `carrier_profile` — and **none has the
`aa_stamp_tenant_company_id` trigger**, so the value must be supplied by the writer.
`allocate_invoice_number` does resolve it server-side; `create_invoice`,
`create_accessorial_adjustment` and `add_load_charge` do not mention `company_id` at
all. That is neither sanctioned stamping shape, and it is undeclared. The record's only
acknowledgement is one clause in the `company_members` entry: "the eight billing FKs and
`invoice_number_config`'s `UNIQUE (company_id, year)` already point at it."

## The count you asked for

| State | Tables |
| --- | --- |
| Declared, and consistent with everything found | 18 of today's 20, plus 6 deferred, plus `email_send_state` |
| Declared, but from an incomplete record | 2 (`email_templates`, `notification_role_defaults`) |
| Named in a batch, never declared | 4 logs (B7) + 6 token tables (B8, plan file only) |
| No disposition anywhere, no column | **114**, of which **43 are absent from the record entirely** |
| Column present, no disposition, no stamping shape | **9** |

**137 tables need a disposition** before the declaration requirement means anything
(114 + 9 + the 14 named only as batch members). Nothing here proposes how to settle
them.
