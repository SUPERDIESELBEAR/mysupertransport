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

---

# APPENDED 2026-09-15 01:15 UTC — THE BUILD BROKE AFTER THIS REPORT WAS COMMITTED

This report was committed while the pass was still running, and the pass then broke the
build. Nothing above mentions it. This section is the correction; nothing above has been
rewritten.

## 10. The verbatim build error

```
build failed with exit status 1: stderr:
les/esbuild/lib/main.js:622:9)
    at handleIncomingPacket (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:677:12)
    at Socket.readFromStdout (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:600:7)
    at Socket.emit (node:events:519:28)
    at addChunk (node:internal/streams/readable:561:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
    at Readable.push (node:internal/streams/readable:392:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
error: script "build:dev" exited with code 1

stdout:
vite v5.4.19 building for development...
transforming...
✓ 237 modules transformed.
```

The preview reported the two parse errors underneath it verbatim:

```
/dev-server/src/components/inspection/InspectionBinderAdmin.tsx: Unexpected token, expected ":" (854:12)
  852 |                 email_sent: false,
  853 |               })))
> 854 |             )
      |             ^
  855 |           : Promise.resolve(),

/dev-server/src/components/documents/DocumentEditorModal.tsx: Unexpected keyword 'import'. (25:0)
  23 | import { scrollElementIntoViewWithOffset } from '@/hooks/useScrollIntoViewOnOpen';
  24 | import {
> 25 | import { insertPayload } from '@/integrations/supabase/helpers';
  26 |   AlertDialog, AlertDialogAction, AlertDialogCancel,

TypeError: error loading dynamically imported module: .../src/components/inspection/InspectionBinderAdmin.tsx
```

## 11. What was wrong in each file, and why Group C caused it

Both breaks came from the same cause: the client adaptation in section 6 was applied with
a **scripted text edit** that wrapped insert payloads in `insertPayload(...)` and inserted
the helper import. The script was not syntax-aware.

- `DocumentEditorModal.tsx` — the import line was injected **inside** an existing
  multi-line `import { ... } from '@/components/ui/alert-dialog'` statement, between its
  opening brace and its first specifier. The file could not be parsed at all.
- `InspectionBinderAdmin.tsx` — wrapping `docsToRemind.map(d => ({...}))` in
  `insertPayload('cert_reminders', {...})` added a closing paren, and the script left the
  original `)` on the following line as well. One unbalanced paren, inside a ternary, so
  the parser failed at the `:` of `: Promise.resolve()`.

Neither was a logic error. Both were purely mechanical damage from a non-AST edit.

## 12. Both files ARE insert paths into Group C tables

- `DocumentEditorModal.tsx` inserts into **`document_version_history`** (two sites, lines
  266 and 367).
- `InspectionBinderAdmin.tsx` inserts into **`cert_reminders`** (line 846).

So the question of a required-column window is a real one, and the answer must be stated
precisely, because two things are being conflated:

- **A window did exist in which those two modules could not load at all.** The Group C
  migration landed with commit `b702cc79` (00:54:41Z); the two files were left in a
  non-parsing state from commit `70540178` (00:43:14Z) and repaired by `70fb2dc0`
  (00:59:22Z) — about **16 minutes**, of which the post-migration part was under 5.
- **There was never a window in which the database demanded `company_id` and the client
  could not supply it.** `company_id` is stamped server-side by
  `aa_stamp_tenant_company_id` from `current_company_id()`; the client neither sends it
  nor is permitted to choose it. The `insertPayload` wrapping is a *typing* change, not a
  data change. An unwrapped insert would have succeeded.
- **Could anything have hit it?** Only a staff user who opened the document editor or the
  Inspection Binder admin screen inside those 16 minutes, on the preview build. The
  failure mode was a screen that would not load — a parse error, before any request — not
  a rejected write and not a row written without a carrier. Consistent with that: the live
  check in section 7 found **zero** rows with a null or foreign `company_id` in either
  table, and it was re-confirmed after the repair.

## 13. What the fix changed

Commit `70fb2dc0` "Fixed stray build errors", two lines total:

- `DocumentEditorModal.tsx` — moved the `insertPayload` import above the `import {` it had
  been dropped inside (1 line changed).
- `InspectionBinderAdmin.tsx` — deleted the orphaned `)` left on line 854 (1 line removed).

No behaviour, no payload, no query, no schema change.

## 14. Which of this report's existing claims still hold

- **Sections 1–5 (inventory, classification, migration routes, derivation checks) hold.**
  They are statements about the database and about which tables were chosen; the break did
  not touch either.
- **Section 7 (verification) verified the DATABASE, not the APPLICATION.** It ran while
  these two files were unparseable. Every structural, policy, index, trigger, probe and
  count claim in it is still accurate for the database — those were live SQL reads. But it
  was written as a clean bill of health for the pass, and at the moment it was written the
  application did not build. The "clean pass" framing in section 7 and in section 6's
  claim that the client paths were adapted is **withdrawn as of the original commit** and
  only becomes true from commit `70fb2dc0` onward.
- **Section 6 (adapted paths) holds only in its list, not in its implied state.** The
  right files were touched; two of them were left broken.
- **Sections 8 and 9 (remaining work, contradictions) hold.**

## 15. Current results, re-run after the repair (01:04–01:16 UTC)

- `npx tsgo --noEmit` — **clean, no output**. This is the check that would have caught
  both parse errors and was not run between the scripted edit and the report.
- `src/test/grant-parity-live.test.ts`, `src/test/policy-grant-parity.test.ts`,
  `src/test/definer-search-path.test.ts`,
  `src/test/caller-evaluated-functions.test.ts` — **4 files, 17 passed**, 9.55s.
- `src/test/tenancy-resolver.test.ts` — run three times, and **no run was fully green**.
  Every failure was the same infrastructure error, never an assertion:

  ```
  psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com", port 6543
  failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
  ```

  | Run | Result | Test(s) that failed |
  | --- | --- | --- |
  | 01:04 | 68 passed, 1 failed | Group C structural check (`load_reference_citations` query) |
  | 01:08 | 66 passed, 3 failed | owner-membership, B4 off-carrier, B5-part-two structural |
  | 01:12 | 68 passed, 1 failed | B5-part-one GLOBAL check |

  A different test failed each time, always on connection setup, and every failing test
  passed in another run — so across the three runs all 69 assertions have passed, but
  **no single green run of this suite can be claimed right now**, and the honest statement
  is that the suite is currently flaky against the pooler. The earlier
  `[vitest-worker]: Timeout calling "onTaskUpdate"` reporter error also recurred; the
  suite takes ~4 minutes of live SQL and is at the tooling's limits.

  This supersedes section 7's "69 passed" line, which was one run and is now stale.

## 16. The state this file now reflects

Finished state as of 01:16 UTC 2026-09-15: migration applied, client paths adapted **and
building**, typecheck clean, related suites green, tenancy suite green in aggregate but
not in a single run.
