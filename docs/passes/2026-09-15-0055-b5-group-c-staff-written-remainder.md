# Pass report — 2026-09-15 00:55 UTC — B5 Group C, the staff-written remainder

## 1. The list, established live before any DDL

The re-cut's population figures are superseded. Measured from the live catalog at the
start of this pass: **122 public tables without `company_id`, 32,953 rows**.

Subtracting the recorded GLOBALs (18 + `email_send_state`), the 8 DEFERRED content
tables, the four B7 logs, the token/share candidates for B8, the eleven person-owned
tables that resolve through operator/member, and every table with a driver or anonymous
write path, the actual staff-written remainder reachable in this pass was **17 tables,
779 rows**:

| Table | Rows | Route |
| --- | --- | --- |
| cert_reminders | 53 | standard |
| claim_flag_history | 1 | standard |
| document_version_history | 17 | standard |
| equipment_assignments | 278 | standard |
| equipment_serial_conflict_dismissals | 4 | standard (held out of B4 for having rows) |
| mo_plate_assignments | 60 | standard |
| truck_maintenance_records | 17 | standard |
| load_references | 19 | standard |
| load_reference_citations | 14 | standard |
| parser_diagnostics | 82 | standard |
| rate_con_ingest_queue | 5 | standard |
| active_dispatch | 79 | constant-default |
| claim_flags | 1 | constant-default |
| lease_terminations | 35 | constant-default |
| load_charges | 4 | constant-default |
| truck_dot_inspections | 105 | constant-default |
| truck_owners | 5 | constant-default |

### How this differed from the re-cut

- The re-cut's B5 population (66 tables / 4,891 rows) is not the remainder; nineteen of
  those were completed in B5 part two and others are driver-written.
- **`dispatch_status_history` was excluded**, against its earlier reading as staff-only:
  `src/pages/operator/OperatorPortal.tsx:409` inserts into it from the driver's truck-down
  acknowledgement. Driver-written, therefore B6.
- `load_status_history` and `load_change_history` were likewise excluded: a
  driver-initiated load status change reaches them through definer triggers. B6.
- `active_dispatch` was **kept**: the operator portal only reads it
  (`OperatorPortal.tsx:513`, `OperatorDispatchStatus.tsx:97`).
- `truck_owners` was **kept**: `OperatorICASign.tsx:118/136` are reads.
- Classification of driver-written tables by RLS predicate alone under-counts, because
  several driver writes go through SECURITY DEFINER RPCs with no policy predicate. Every
  candidate in this batch was checked against the client code as well.

## 2. Route per table, and why

Eleven tables took the standard shape: nullable → `UPDATE ... = (SELECT id FROM
public.carrier_profile)` (bare scalar subquery, raises 21000 on a second carrier) →
`SET NOT NULL`, no surviving default, FK `ON DELETE RESTRICT`, `company_id` index,
`aa_stamp_tenant_company_id` BEFORE INSERT trigger.

Six tables carry UPDATE-firing triggers — `trg_dispatch_status_history`,
`trg_claim_flags_zz_history`, `trg_claim_flags_updated_at`,
`enforce_lease_termination_void`, `set_lease_terminations_updated_at`,
`trg_load_charges_updated_at`, `stamp_load_charges_actor`, `trg_compute_dot_next_due`,
`trg_sync_dot_to_inspection_documents`, `truck_owners_updated_at`. A backfill UPDATE on
those would have written spurious dispatch-history and claim-history rows and moved
`updated_at` on every row. They therefore took the **approved constant-DEFAULT-then-DROP
route**, which runs no row UPDATE.

**This is a wider use of that route than "immutability-locked", and it is recorded as
such**: the reason here is trigger side effects, not a lock. No trigger was suspended.

### Derivation check (what proves the constant was right, not merely uniform)

| Table | Parent | Rows | Agreeing |
| --- | --- | --- | --- |
| active_dispatch | operators | 79 | 79 |
| lease_terminations | operators | 35 | 35 |
| truck_dot_inspections | operators | 105 | 105 |
| truck_owners | operators | 5 | 5 |
| claim_flags | loads | 1 | 1 |
| load_charges | loads | 4 | 4 |

Full agreement, every table, every row.

## 3. Unique indexes — every one read from `pg_indexes`, with disposition

| Index | Disposition |
| --- | --- |
| active_dispatch_pkey, cert_reminders_pkey, claim_flag_history_pkey, claim_flags_pkey, document_version_history_pkey, equipment_assignments_pkey, equipment_serial_conflict_dismissals_pkey, lease_terminations_pkey, load_charges_pkey, load_reference_citations_pkey, load_references_pkey, mo_plate_assignments_pkey, parser_diagnostics_pkey, rate_con_ingest_queue_pkey, truck_dot_inspections_pkey, truck_maintenance_records_pkey, truck_owners_pkey | surrogate keys, left global |
| active_dispatch_operator_id_key (operator_id) | operator is already company-scoped, left global |
| cert_reminders_cron_dedupe_idx (operator_id, doc_type, threshold, sent date) WHERE source='cron' | operator-scoped, left global |
| one_active_assignment_per_item (equipment_id) WHERE returned_at IS NULL | equipment is already company-scoped, left global |
| load_references_load_id_reference_class_value_key_key | load-scoped, left global |
| truck_owners_operator_id_key, truck_owners_user_id_key | person/operator scoped; one person, one carrier, left global |
| rate_con_ingest_queue_resend_email_id_key | identifies one inbound email, left global |
| **equipment_serial_conflict_dismissals_conflict_key_key (conflict_key)** | **RE-SCOPED** → `equipment_serial_conflict_dismissals_company_key_uniq (company_id, conflict_key)`; the key is `<device_type>:<serial>` and two carriers can hold identically-labelled devices |
| **rate_con_ingest_queue_attachment_sha256_key (attachment_sha256)** | **RE-SCOPED** → `rate_con_ingest_queue_company_attachment_sha256_uniq (company_id, attachment_sha256) WHERE attachment_sha256 IS NOT NULL`; the same rate confirmation PDF mailed to two carriers would otherwise be swallowed as a duplicate |

Both replaced constraints were dropped before their backing indexes (the `2BP01` lesson
from the previous pass).

## 4. Structural verification

All 17 tables: `company_id` NOT NULL, **no** surviving default, FK to
`carrier_profile(id)` with `ON DELETE RESTRICT`, `aa_stamp_tenant_company_id` present and
ENABLED. Zero nulls and zero rows off the live carrier in all 17.

`public` policy count: **560**, equal to the recorded baseline. No draft migration was
pending. One carrier, 15 `company_members`, one `owner` role — unchanged.

## 5. Probes (all inside one transaction, ROLLBACK)

- **A — a scratch second company keeps its own rows.** Service-role-shaped caller
  (`request.jwt.claims` role `service_role`) inserting `cert_reminders` with
  `company_id = 0000…00c3` produced a row still carrying `0000…00c3`. PASS.
- **B — a spoofed company is overwritten.** Signed-in `company_members` caller sending
  `company_id = 0000…00c3` produced a row carrying the real carrier. PASS.
- **C — a non-member, non-operator caller is refused**, verbatim:

  ```
  ERROR:  Cannot resolve a company for this public.document_version_history row: the
  caller holds no company_members row and no server-side company was named. Refusing
  rather than defaulting to a carrier.
  HINT:  Staff must have a company_members row; service-role callers must pass company_id explicitly.
  ```

After ROLLBACK: 1 carrier, 0 scratch rows, 15 members, 1 owner.

Two earlier probe attempts aborted before any write, on their own errors, and are
reported rather than hidden: `carrier_profile` has `legal_name`/`usdot_number`, not
`carrier_name`/`carrier_usdot`; `cert_reminders.doc_type` is `CHECK (doc_type IN ('CDL',
'Medical Cert'))`; `mo_plate_assignments` has no `assigned_date` column.

Also learned and recorded: `stamp_tenant_company_id` honours an explicitly supplied
`company_id` **only** when `auth.role() = 'service_role'`. A raw `psql` session without
that claim is refused even when it names a company. That is correct fail-closed
behaviour, and it is why the edge-function changes below are necessary rather than
optional.

## 6. Code adapted

Browser create paths, wrapped in `insertPayload(...)` so the browser never sends a
company (13 sites): `DocumentEditorModal.tsx` (×2), `DispatchPortal.tsx` (×2),
`MiniDispatchCalendar.tsx` (×2), `MoPlateRegistry.tsx` (×2), `MoPlateAssignModal.tsx`,
`EquipmentAssignModal.tsx`, `InspectionComplianceSummary.tsx` (×2),
`MaintenanceRecordModal.tsx`, `LogUpdateModal.tsx`, `DOTInspectionModal.tsx`,
`InspectionBinderAdmin.tsx`, `DeactivationWizardContent.tsx`,
`LeaseTerminationBuilderModal.tsx`, `equipmentSync.ts`.

Service-role edge functions, which have no `auth.uid()` and therefore must name the
company explicitly or be refused — each derives it from the operator the row is about,
or from `soleCompanyId`: `cron-cert-reminders`, `send-cert-reminder`,
`send-osas-to-operator`, `receive-rate-con-email` (`soleCompanyId`), `invite-operator`,
`provision-test-driver`, `provision-demo-driver`, `reset-demo-driver`.

`npx tsgo --noEmit`: clean.

## 7. Suites run, by name

- `src/test/tenancy-resolver.test.ts` — **69 passed**, including the five new B5 Group C
  assertions (structure, live-carrier rows, parent derivation, the two re-scoped keys,
  and that the avoided history/derivation triggers are still ENABLED). One vitest
  *runner* error, `[vitest-worker]: Timeout calling "onTaskUpdate"` — a reporter RPC
  timeout on a 250s run, not a failing assertion.
- `src/test/grant-parity-live.test.ts`, `src/test/policy-grant-parity.test.ts`,
  `src/test/definer-search-path.test.ts`,
  `src/test/caller-evaluated-functions.test.ts` — **17 passed, 4 files**.

## 8. What is left in the whole tenancy sequence, measured

**105 tables, 32,174 rows** without `company_id`:

| Group | Tables | Rows |
| --- | --- | --- |
| Declared GLOBAL (18 + `email_send_state`) | 19 | 998 |
| DEFERRED content tables | 8 | 318 |
| B7 — the four logs | 4 | 22,719 |
| B8 — token/share candidates | 7 | 1,004 |
| B6 driver-written + still unclassified | 67 | 7,135 |

So the outstanding *work* is B6 (driver-written), B7 (logs), B8 (token/share) plus the
eight deferred decisions; 27 of the 105 are already dispositioned as needing no column.

## 9. Contradictions

- The re-cut's B5 population is superseded, as above; `dispatch_status_history`,
  `load_status_history` and `load_change_history` were reclassified out of the
  staff-written pile on live code evidence.
- The 67-table "B6 + unclassified" figure is a group, not a decided batch. Driver-written
  versus staff-written for those has not been settled table by table, and it should be
  before B6 is built.
- Cross-carrier steady-state isolation remains unverifiable: there is still exactly one
  real carrier. Every isolation claim above is a scratch-company claim inside a
  rolled-back transaction.
- Linter total 180, against 172 recorded earlier; still unattributed to any change in
  this sequence, and carried forward unresolved.
