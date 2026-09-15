# B6 Group 2 (part) — driver-written document tables

Build mode. 2026-09-15 18:45 UTC. Immutable: append only.

## 1. The list, established live

Candidates found by reading the live catalog and every write path, not the plan:

| table | rows | writer |
| --- | --- | --- |
| operator_documents | 1,184 | driver, **truck owner**, staff, service role |
| driver_vault_documents | 843 | staff + service role (`finalize-passenger-auth`); no driver INSERT policy |
| document_acknowledgments | 365 | driver and **truck owner** (person-owned by `user_id`) |
| load_documents | 25 | driver (own load) and staff |
| driver_uploads | 6 | `auth.uid() = driver_id` and staff |
| equipment_receipts | 3 | driver (own operator, return direction) and staff |
| document_exceptions | 0 | driver (own load) and staff |

Not in scope, with reasons: `roadside_stop_documents` is staff-written only
(`RoadsideStopsCard`); `driver_documents` is the company-authored content library
and belongs to the deferred content decision; `ica_driver_acknowledgments` holds 9
rows and **no identifiable writer**; `documents` holds 0 rows and **no
identifiable writer**. The last two are findings, not tables to stamp quietly.

## 2. Two tables held back — a live break avoided, not a preference

`operator_documents` and `document_acknowledgments` were NOT migrated.

`document_acknowledgments` holds 4 rows belonging to user
`24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`, a live profile whose only role is
`truck_owner`. He has **no `company_members` row and no `operators` row**, so
`current_company_id()` — membership first, operator second — returns NULL for him.
Under Shape 1 a NOT NULL `company_id` would have made his next acknowledgement
raise 42501. He reaches both tables through `OperatorPortal` with
`viewerRole = 'truck_owner'`, and `operator_documents` carries a deliberate
truck-owner INSERT policy, so the path is real, not theoretical.

That is a third resolution source the resolver does not have. It is an owner
decision (truck owner → his driver's operator row → company, or a membership of a
non-staff kind), not something to invent inside a batch. Both tables stay global
and a guard now fails if either gains the column.

## 3. What was migrated, and by which route

Five tables, `company_id uuid NOT NULL`, no default left behind, FK to
`carrier_profile` `ON DELETE RESTRICT`, an index, and `aa_stamp_tenant_company_id`
(Shape 1) on INSERT.

- Nullable → backfill → NOT NULL: `document_exceptions` (empty).
- Backfill from the parent operator: `driver_vault_documents`,
  `equipment_receipts`. Neither has an UPDATE-firing trigger, so the backfill
  fires nothing.
- Constant DEFAULT then DROP DEFAULT, no backfill UPDATE: `driver_uploads`
  (AFTER UPDATE `notify_driver_on_upload_status_change` would have notified every
  driver) and `load_documents` (BEFORE UPDATE `update_updated_at_column` would
  have moved `updated_at` on every row). The derivation check ran first and found
  ONE company across all rows of both (6/6 and 25/25).

A DEFAULT expression may not contain a subquery — the first attempt failed with
the verbatim error `ERROR: 0A000: cannot use subquery in DEFAULT expression` and
applied nothing. The bare-scalar refusal was therefore expressed as a guard
`DO` block using `SELECT ... INTO STRICT` plus a literal-equality check, so a
second carrier still aborts the migration instead of stamping the wrong id.

## 4. Verification

Real driver, Steve Figueroa (`878be880-396a-4dd6-9ae1-787df2a5e749`), inserting
into `driver_uploads` under his own authenticated claims, transaction aborted:

```
PROBE_ROLLBACK: bare=6b54d0e6-… spoofed=6b54d0e6-… expected=6b54d0e6-…
bare_ok=t spoof_overwritten=t
```

An insert naming no company was stamped with his carrier; an insert naming
`00000000-…` was overwritten with his carrier. Nothing was kept.

Structural, live: all five `is_nullable = NO`, `confdeltype = r`, exactly one
`aa_stamp_tenant_company_id`, zero rows whose `company_id` is not a live carrier,
one distinct company per table, and the only UNIQUE index on each remains its
primary key — no unique constraint needed rescoping. Policy count 560, unchanged.
Security linter 172, the established baseline.

## 5. The service-role writer that would have broken

`finalize-passenger-auth` inserts into `driver_vault_documents` from a
service-role client. Shape 1 requires a service-role caller to NAME the company,
so this would have raised 42501 after the migration. It now reads
`operators.company_id` for the authorization's operator, refuses with a 500 when
that cannot be resolved, and passes `company_id` explicitly. Deployed. `deno
check` clean.

Client insert paths adapted to the typed `insertPayload` helper (server keeps
control of the column): `DriverVaultCard`, `EquipmentAssetSheet`,
`OperatorInspectionBinder`, `OperatorBinderPanel`, `EquipmentReturnCard`,
`OperatorReturnReceipts`, and both `load_documents` inserts in
`src/lib/loadDocuments.ts`. `document_exceptions` has no client insert path.

Two build failures occurred during that adaptation and were fixed before this
report was written: the generated types made `company_id` required on the
literals (seven sites), and `EquipmentAssetSheet` was missing the
`insertPayload` import. Per the standing rule this report is written after the
LAST change and the typecheck, not after the migration.

## 6. Suites

- `npx tsgo --noEmit` — clean.
- `src/test/tenancy-resolver.test.ts` — 91/91 (includes 9 new document guards).
  The run still emits the known `Timeout calling "onTaskUpdate"` worker warning.
- `src/test/grant-parity-live.test.ts`, `policy-grant-parity.test.ts`,
  `definer-live-catalog.test.ts`, `operator-settlement-isolation.test.ts`,
  `notification-isolation.test.ts` — 42/42.

## 7. Boundaries — what this does NOT prove

Cross-carrier invisibility of these five tables is still unproven: there is one
real carrier. The stamp is proven; isolation is asserted by the policy shape.
Truck-owner uploads to `operator_documents` and acknowledgements were exercised
only by reading policies and code, not by a live truck-owner session.

## 8. B6 remaining

Group 1 (ELD/RODS, 10 tables) done. Group 2 five of seven done, two blocked on
the truck-owner resolver decision. Group 3 (the rest of the driver-written set)
untouched, along with the two no-writer findings above.
