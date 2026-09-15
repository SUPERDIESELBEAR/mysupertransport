# Truck-owner tenancy — STOPPED on a contradiction in the record

Build mode. 2026-09-15 19:15 UTC. Immutable: append only.

NO DDL WAS APPLIED BY THIS PASS. One migration attempt failed and rolled back in
full; the live state is exactly what it was before the pass began. No code, no
tests, no functions changed. This file is the only change.

## 1. The contradiction

Section 1 of the pass says `truck_owners` GETS `company_id` — five rows, NOT NULL,
FK `ON DELETE RESTRICT`, stamp trigger, bare scalar backfill.

IT ALREADY HAS IT, and has since earlier the same day. Live, verbatim results:

| table | `company_id` nullable | `aa_stamp_tenant_company_id` | FK `confdeltype` | NULLs |
| --- | --- | --- | --- | --- |
| truck_owners | NO | 1 | r | 0 |
| operator_documents | (absent) | 0 | (absent) | — |
| document_acknowledgments | (absent) | 0 | (absent) | — |

The index is `truck_owners_company_id_idx` — NOT a name this pass would have
produced — and the migration that created it is
`supabase/migrations/20260915004133_...` (2026-09-15 00:41 UTC), the B5 Group C
migration. `docs/passes/2026-09-15-0055-b5-group-c-staff-written-remainder.md`
records it explicitly: `truck_owners | 5 | constant-default`, backfilled
`truck_owners | operators | 5 | 5` — i.e. DERIVED FROM THE PARENT OPERATOR.

The attempt failed verbatim with:

```
ERROR:  42701: column "company_id" of relation "truck_owners" already exists
```

## 2. Why this is a contradiction and not merely redundant work

Two separate points, and the second is the one that matters.

1. TIMING. Both the B6 Group 2 report (18:45) and the truck-owner decision record
   (19:00) speak of `truck_owners` gaining the column as FUTURE work. It had
   existed since 00:41 that day. Whoever wrote both — that was me — did not read
   the B5 Group C report before writing them. This is the same failure the record
   already counts as the source-citation pattern, in its ninth-plus instance: a
   claim about what EXISTS is a claim about the live catalog, and must come from a
   query.

2. DERIVATION. The 19:00 decision is explicit that a truck owner belongs to the
   carrier BECAUSE HE LEASED IT A TRUCK, and that the resolver must NOT derive his
   company from the operators he owns — the stated reason being the no-driver gap.
   The column that exists was BACKFILLED FROM THE PARENT OPERATOR. For the five
   live rows the value is identical either way (all five parents resolve to
   `6b54d0e6-8743-4284-b55b-8cd094b093dd`, the only carrier), so no row is wrong
   today. But the recorded intent and the applied derivation disagree, and the
   pass instruction named the bare-scalar route specifically. That is an owner
   decision to confirm, not something to reconcile mid-pass.

## 3. What IS established, and is not in question

Read live, not from the record:

- 5 `truck_owners` rows, all `company_id = 6b54d0e6-8743-4284-b55b-8cd094b093dd`,
  one carrier in `carrier_profile`.
- THREE of the five owners are ALSO operators
  (`820157e8-…`, `c5993805-…`, `2bd87f8e-…`), confirming the record's statement
  that an owner may drive his own truck. In every case his own `operators` row and
  his `truck_owners` row resolve to THE SAME company, so operator-before-truck-owner
  ordering changes no outcome today. Two owners are owner-only:
  `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0` — the user the whole decision was made
  for — and `22ec8422-11d5-45a2-91da-38f296b94de7`.
- WRITE PATH. `invite-truck-owner` is the ONLY writer of `truck_owners`, and it
  does pass `company_id` explicitly, as the record says. Eleven other files touch
  the table; all eleven are reads (`OperatorPortal`, `TruckOwnerCard`,
  `ICABuilderModal`, `RecordPaperIcaModal`, `OperatorICASign`,
  `DeactivationWizardContent`, `sync-onboarding-doc-to-binder`,
  `notify-onboarding-update`, `send-notification`, `file-executed-ica`,
  `resend-invite`). `delete-user-account` deletes, and needs no company.
- The resolver is still TWO sources; it contains no reference to `truck_owners`.
- Both held-back tables are still unscoped, and the B6 Group 2 guard still passes.

## 4. Preparation that survives, for the pass that resumes

Established live so the next pass need not re-derive it:

- `operator_documents` (1,184) derives from its parent operator: 1,184 of 1,184
  resolve. Its only UPDATE trigger is `AFTER UPDATE OF deleted_at`, so a
  `company_id` backfill UPDATE fires NOTHING — the standard
  nullable → backfill → NOT NULL route is safe, no constant-DEFAULT dodge needed.
- `document_acknowledgments` (365 rows, 80 distinct `user_id`) is PERSON-owned.
  Following the three resolver sources in order, ZERO rows and ZERO users fail to
  resolve. It has no non-internal triggers at all.
- Neither table has a UNIQUE index other than its primary key, so nothing needs
  rescoping.
- ONE SERVICE-ROLE WRITER MUST NAME THE COMPANY:
  `finalize-passenger-auth/index.ts:196` inserts into `operator_documents` from a
  service-role client with no `company_id`. It would raise 42501 the moment the
  column lands. It ALREADY resolves the operator's company a few lines above
  (line 194, `companyId`) for the `driver_vault_documents` insert, so the fix is
  to pass that same value. No other service-role INSERT into either table exists.
- The B6 Group 2 guard to retire lives in `src/test/tenancy-resolver.test.ts`,
  the `HELD_BACK` array at line 1317 and the truck-owner test at 1347.

## 5. What remains in B6

Group 1 (ELD/RODS, 10 tables) done. Group 2: five of seven done; these two still
held back, now blocked on the section 2 answer rather than on the resolver.
Group 3 (the rest of the driver-written set) untouched, plus the two no-writer
findings — `ica_driver_acknowledgments` (9 rows) and `documents` (0 rows).
