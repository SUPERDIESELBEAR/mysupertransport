# Reimbursement pay class, Phase 1 broker extensions, and Load Detail tab grouping record

## 1. Record the Load Detail tab grouping decision

Update `docs/tms-build-status.md` with the agreed tab layout **before** Modules 4–7 land, so the decision is not revisited piecemeal as the page grows.

```text
Load Detail tabs (to be built when Module 5 lands and a second financial section exists):

1. Operations (default)
   - Load Summary
   - Stops
   - Reefer / Loadout / Flags blocks
   - Messages about this load
   - Status History

2. Financials
   - Rate Details
   - Pay Policy (Module 4)
   - Accessorials (Module 5)
   - Fuel (Module 6)

3. Documentation
   - Documents
   - Reference Numbers
   - Verbatim Verification

4. Audit & Claims
   - Claims
   - Change History
   - Internal Notes

Note: Messages live in Operations while Documents live in Documentation. A document
exception and the conversation about it will therefore appear on different tabs.
That is acceptable and deliberate; it separates operational threads from the document
record itself.
```

Add this under a new **Load Detail — future tab layout** section, and reference it from the existing `Build order` section.

## 2. Reimbursement pay class

Goal: a charge class that pays the driver **at cost** for an out-of-pocket expense, with any amount billed above the receipt kept as company margin. This is the missing `at_cost` branch in `src/lib/payTreatment.ts`.

### What changes

- Extend `ClassificationKey` in `src/lib/revisedRateCon.ts` to include `reimbursement` (or treat `lumper` as the first `at_cost` class). The test at `src/lib/__tests__/revisionReviewHygiene.test.ts` already expects the descriptor to work without hardcoding a percentage.
- Update `payTreatment` so that the new class returns `{ kind: 'at_cost', label: 'reimbursed at cost' }` instead of a percentage.
- Add a way to record the **driver-paid amount** on a charge (separate from what the broker billed). Options:
  - Add `driver_paid_amount` to `public.load_charges`, OR
  - Introduce a small `charge_reimbursement_details` child table keyed by `load_charges(id)` (keeps the main table narrow and lets future reimbursement classes carry receipts, approval state, etc.).
- Update `src/lib/loadSavePayload.ts` and `loadToFormValues` to carry the new field through create/edit.
- Update the revision review modal so a line classified as the reimbursement class renders the `at_cost` label and cannot be mis-classified back to a percentage.
- Update `RateDetailsCard.tsx` or `LoadSummaryCard.tsx` to show the treatment hint when a charge settles at cost.

### Open question to decide during implementation

Whether the reimbursement class is a **new classification key** (e.g., `reimbursement`) alongside `lumper`, or whether `lumper` itself becomes the first `at_cost` class. The current policy column is named `lumper_reimbursement_pct`, which suggests lumper is already intended to be reimbursement-like. The simplest first step is to make `lumper` settle at cost (driver paid amount = billed amount until receipts are uploaded), and add the broader `reimbursement` key later if other out-of-pocket expenses need it.

## 3. Phase 1 broker extensions

Goal: enrich the broker record so dispatch and settlement decisions can use carrier packet status, signed agreements, multiple contacts, do-not-load flags, and dispatcher ratings/notes.

### Database changes

1. `public.brokers` — add columns:
   - `do_not_load boolean NOT NULL DEFAULT false`
   - `do_not_load_reason text`
   - `do_not_load_date date`
   - `dispatcher_notes text`
   - `rating smallint` (1–5, nullable)
   - `carrier_packet_status text` (e.g., `not_received`, `pending`, `received`, `expired`) OR keep as a `broker_documents` category
   - `broker_agreement_status text` (signed/un-signed/expired)
   - `updated_at` trigger already exists; no new trigger needed

2. `public.broker_contacts` — new table for multiple contacts per broker:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `broker_id uuid REFERENCES public.brokers(id) ON DELETE CASCADE`
   - `name text`
   - `role text` (e.g., `dispatch`, `accounting`, `claims`)
   - `email text`
   - `phone text`
   - `is_primary boolean DEFAULT false`
   - `created_at`, `updated_at`, `created_by`, `updated_by` (FK to `profiles(id)`)
   - Partial unique index: one `is_primary` per broker

3. `public.broker_documents` — already exists. Use it for:
   - `carrier_packet` category
   - `signed_broker_agreement` category
   - Add `is_current_version` and expiration logic already present; ensure it is surfaced in the broker dialog.

4. RLS and GRANTs follow the same pattern as `broker_documents` and `broker_factoring_history`:
   - `authenticated`: SELECT, INSERT, UPDATE, DELETE
   - `service_role`: ALL
   - `anon`: none
   - Policies: staff full access; operators read-only for their own loads’ brokers (or no access — to decide, but simplest is staff-only for now).

### UI changes

- **Broker Directory** (`BrokersListPage.tsx`):
  - Add columns for `do_not_load`, `rating`, `primary contact email`, and a document status indicator (packet + agreement).
  - Add filters for `do_not_load` and packet status.

- **Broker Dialog** (`BrokerDialog.tsx`):
  - New sections:
    - Status flags: `do_not_load`, reason, date
    - Rating and dispatcher notes
    - Multiple contacts with primary toggle, add/remove
    - Document attachments: carrier packet, signed agreement (upload/view)
  - Keep the existing factoring history and duplicate-detection flow intact.

- **Load creation / assignment**:
  - When a load is created with a broker flagged `do_not_load`, show a blocking warning that requires an override reason from management/owner.
  - In the broker list, visually flag do-not-load brokers.

## 4. Verification

- Run the full test suite (with and without database) and confirm baselines match.
- Add/update unit tests:
  - `payTreatment` returns `at_cost` for the reimbursement class.
  - `buildRevisionDiff` / `applyRevision` handle the new class.
  - Broker dialog save payload matches the updated schema.
  - `do_not_load` flag surfaces in the broker list filters.
- Update `docs/tms-build-status.md` built-modules and open-items sections.

## 5. Order of work

1. Record tab grouping in `docs/tms-build-status.md`.
2. Reimbursement pay class (database + type + UI hint).
3. Phase 1 broker database changes (columns + `broker_contacts` table + RLS + grants + indexes).
4. Broker UI extensions (directory columns/filters, dialog sections, do-not-load warning).
5. Tests and docs update.
