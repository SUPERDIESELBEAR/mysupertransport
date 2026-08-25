# Phase 1 broker extensions

Broker directory only. No changes to loads, pay policies, settlements, or invoicing. The earlier reverted draft is treated as a starting point, not as approved.

## What already exists (verified against the live database)

- **brokers** — company name, MC/DOT, single primary contact (name/email/phone), billing email, mailing address, `factoring_status` + reason + timestamp, payment terms, `avg_days_to_pay`, one free-text `notes` blob, `is_active`, created/updated attribution. No packet fields, no agreement fields, no do-not-load flag, no rating, no per-note attribution.
- **broker_documents** — `broker_id`, `document_category` (plain `text`, not an enum), `document_name`, `file_url`, `file_path`, `expiration_date`, `notes`, `version_number`, `is_current_version`, `created_by`. **Shape fits**: the signed broker-carrier agreement and packet paperwork go here as categories (`carrier_packet`, `signed_broker_agreement`). No parallel document store is needed. Note it has `created_by` but no `updated_by`.
- **broker_factoring_history** — already the attributed audit trail for factoring status only. It is status-specific (`previous_status`/`new_status` are the factoring enum), so it is not reused for do-not-load or notes.
- **RLS pattern (confirmed)**: management/owner `ALL`; dispatcher/onboarding_staff `SELECT`/`INSERT`/`UPDATE`; history read-only for staff; operators have no policy at all. New tables mirror this exactly.
- **Override audit precedent (confirmed)**: `BrokerDialog.tsx` already writes an `audit_log` row with action `broker_duplicate_override` and the matched-broker context. The do-not-load override follows the same shape.

## Do-not-load warning at load creation — answer

It can be done **without touching the load save path**. `BrokerSelect.tsx` already holds the full broker record from `useBrokers()`, so the warning renders purely from data already in memory, in the same place the existing provisional-name warning renders. Nothing in the save payload, RPC, parser, or revision code is touched. The warning also appears on the Load Detail broker row.

The override reason is recorded when the user acknowledges the warning at selection time (an `audit_log` row, same pattern as duplicate override), not inside the save transaction. That keeps `create_load_with_stops` / `update_load_with_stops` and the revision path completely untouched. No hard block anywhere.

## Database changes

**brokers — new columns**
- `carrier_packet_completed boolean NOT NULL DEFAULT false`, `carrier_packet_completed_at timestamptz`, `carrier_packet_completed_by uuid` (profiles)
- `broker_agreement_signed boolean NOT NULL DEFAULT false`, `broker_agreement_signed_at timestamptz`, `broker_agreement_recorded_by uuid` (profiles), `broker_agreement_document_id uuid` referencing `broker_documents(id) ON DELETE SET NULL`
- `do_not_load boolean NOT NULL DEFAULT false`, `do_not_load_reason text`, `do_not_load_set_at timestamptz`, `do_not_load_set_by uuid` (profiles)
- `rating smallint` (1–5, nullable, validated in a trigger rather than a CHECK on mutable data)

Attribution/timestamp columns are stamped by a `BEFORE INSERT OR UPDATE` trigger using `current_profile_id()`; client payloads that try to set them are ignored/overwritten. Existing `updated_at` trigger stays.

**broker_contact_role enum** — `dispatch`, `accounts_payable`, `claims`, `after_hours`, `other`.

**broker_contacts** (new) — `id`, `broker_id` (cascade), `name`, `role broker_contact_role NOT NULL DEFAULT 'other'`, `phone`, `email`, `notes`, `is_primary boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`, `created_by`, `updated_by`. Partial unique index enforcing one primary per broker; index on `(broker_id, role)`.

**broker_notes** (new) — running attributed record instead of one overwritten blob: `id`, `broker_id` (cascade), `body text NOT NULL`, `created_at`, `created_by` (stamped server-side), plus `updated_at`/`updated_by` for author-only edits. Existing `brokers.notes` is left in place and shown as a legacy note; nothing is migrated automatically.

**broker_do_not_load_history** (new) — audit trail of do-not-load transitions: `broker_id`, `previous_value boolean`, `new_value boolean`, `reason`, `changed_at`, `changed_by`. Written by an `AFTER UPDATE OF do_not_load` trigger, mirroring the existing factoring-history trigger.

Order per new table: `CREATE TABLE` → `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated` and `ALL TO service_role` (no `anon`) → `ENABLE ROW LEVEL SECURITY` → policies (management/owner `ALL`; dispatcher/onboarding_staff select/insert/update; history tables staff read-only). Verified afterwards with `grant_parity_report()` and the Supabase linter.

## UI changes

- **Broker Dialog** (`BrokerDialog.tsx`) — new sections: Carrier packet & agreement (completed toggles, dates read-only from stamps, agreement document upload/link into `broker_documents`), Status flags (do-not-load with required reason, showing who set it and when), Rating, Contacts (add/edit/remove, role select, primary toggle), Notes (append-only running list with author and timestamp). Existing factoring history and duplicate-detection flow untouched.
- **Broker Directory** (`BrokersListPage.tsx` / `brokersColumns.tsx`) — new optional columns: do-not-load, rating, packet status, agreement status, primary contact by role; filters for do-not-load and packet status; do-not-load rows visually flagged.
- **BrokerSelect** — do-not-load warning with acknowledge-with-reason, audit-logged. Same warning surface on Load Detail's broker row (read-only display).
- Data access extended in `src/lib/brokers.ts` / `useBrokers.ts` plus a new `src/lib/brokerContacts.ts` and `src/lib/brokerNotes.ts`, so both directory and dialog read the same shapes (both-paths rule).

## Explicitly not in this pass

Computed broker scorecard (rate per mile, detention approval rate, short-pay frequency, days to pay) stays Module 9.

## Verification

- `grant_parity_report()` clean for `broker_contacts`, `broker_notes`, `broker_do_not_load_history`; linter clean.
- Operator role confirmed to have no read path to any broker table.
- Rendering tests against real query output for the new read-side components (contacts list, notes list, packet/agreement status block), per the reader-boundary rule.
- Test asserting the do-not-load warning appears in both broker selection and the directory, and that it never blocks a save.
- Test asserting actor/timestamp columns are ignored when sent from the client and set from `current_profile_id()`.
- Full test suite run; `docs/tms-build-status.md` updated (Phase 1 broker extensions built; scorecard deferred to Module 9).
