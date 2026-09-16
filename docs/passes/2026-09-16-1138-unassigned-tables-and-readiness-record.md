# Pass report — 2026-09-16 11:38 UTC — the unassigned tables, the disposition guard, and the readiness record

Changes permitted and made: `docs/tms-build-status.md`,
`src/test/tenancy-resolver.test.ts`, and this report. **No migration, no function or
app code, no data change.**

Read first: `docs/passes/2026-09-16-1100-second-carrier-readiness.md`, the record's B6
Group 3 entry ("20 of the 51 candidates … fall to later batches") and the B8 entry
("No batch remains that is merely unstarted").

## Contradictions found

1. **The B8 closing statement is FALSE.** 19 tables lack `company_id` and are in no
   GLOBAL, DEFERRED or log declaration; 15 of them have no decision at all. Traced to
   B6 Group 3's 20 deferred candidates, which no later batch took. Reported, not
   reconciled — nothing was migrated.
2. **`tenancy-resolver.test.ts` was RED before this pass, from B8's own work.** The
   stamped-table census does not include B8's seven token/share tables:
   ```
   FAIL  src/test/tenancy-resolver.test.ts > tenancy batch B2 part two — user_roles, loads, equipment_items > every stamped table shares one trigger name, sorting ahead of validation
   AssertionError: expected [ 'active_dispatch', …(128) ] to deeply equal [ 'active_dispatch', …(121) ]
   +   "binder_share_bundles",
   ```
   The seven extras were confirmed live to be exactly B8's tables (query 6 below).
   B8's "suites passed" claim did not cover this test. Corrected in this pass by
   adding `...B8_SHAPE_1` to the census, with a comment recording that a census
   assertion goes stale on correct work while an invariant does not.
3. The reviewer's expected list of 19 **matches the live list exactly** — no
   difference to report. `email_send_state` is on it but already carries a
   2026-09-13 GLOBAL decision and its own guard, so it is filed under `GLOBAL_LOGS`
   rather than `UNASSIGNED`; that is stated rather than silently absorbed.

No contradiction was found with the 2026-09-13 decisions themselves. The tension
between "seeded rather than applied to" and "hand-onboard the demo drivers" is
recorded in the status entry, unresolved.

---

## STEP 1 — the list, established live

### Query 1 — the inventory (48)

```sql
SELECT count(*) FROM information_schema.tables t
WHERE table_schema='public' AND table_type='BASE TABLE'
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=t.table_name
      AND c.column_name='company_id');
```
→ `48`

### Query 2 — the residue after subtracting the declarations

`GLOBAL_TABLES` (18) and `DEFERRED_TABLES` (8) taken from
`src/test/tenancy-resolver.test.ts:70-91`, plus `audit_log`, `email_send_log`,
`share_token_access_log`:

```sql
WITH lacking AS (SELECT t.table_name FROM information_schema.tables t
  WHERE table_schema='public' AND table_type='BASE TABLE'
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=t.table_name
        AND c.column_name='company_id')),
declared AS (SELECT unnest(ARRAY['applications','application_correction_requests',
  'application_correction_fields','application_document_history',
  'application_interview_notes','application_resume_tokens','application_invites',
  'application_revision_attachments','profiles','carrier_profile',
  'resource_documents','resource_history','release_notes','eld_device_models',
  'eld_revoked_list_checks','revert_courtesy_email_defaults',
  'email_unsubscribe_tokens','suppressed_emails','faq','faq_history','services',
  'service_resources','staff_help_knowledge','pipeline_config','email_templates',
  'message_templates','audit_log','email_send_log','share_token_access_log'])
  AS table_name)
SELECT table_name FROM lacking EXCEPT SELECT table_name FROM declared ORDER BY 1;
```

Verbatim result (19 rows):

```
driver_documents
driver_optional_docs
eld_cron_runs
email_send_state
equipment_return_confirmations
fuel_disagreement_acceptances
fuel_import_batches
fuel_transaction_lines
fuel_transactions
onboard_assignment_sheet_sends
operator_broadcasts
operator_departing_events
operator_parking_events
pei_accidents
pei_request_events
pei_requests
pei_responses
staff_event_acknowledgments
staff_help_query_log
```

### Query 3 — exact row counts (`SELECT count(*) FROM public.<t>` each)

```
driver_documents|11
driver_optional_docs|0
eld_cron_runs|1091
email_send_state|1
equipment_return_confirmations|0
fuel_disagreement_acceptances|0
fuel_import_batches|1
fuel_transaction_lines|125
fuel_transactions|69
onboard_assignment_sheet_sends|9
operator_broadcasts|1
operator_departing_events|2
operator_parking_events|2
pei_accidents|1
pei_request_events|527
pei_requests|144
pei_responses|16
staff_event_acknowledgments|115
staff_help_query_log|5
```

Total 1,995 rows.

### Query 4 — writers

Repo search, per table: `rg -l "'<table>'|\"<table>\"" src supabase/functions`
(`src/integrations/supabase/types.ts` and `src/test/**` omitted below).

Live definer functions:

```sql
SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.prosrc ~* 'INSERT INTO public\.(<the 19>)'
   OR p.prosrc ~* 'UPDATE public\.(fuel_transactions|pei_requests|email_send_state|operator_parking_events|operator_departing_events)');
```

Verbatim (all SECURITY DEFINER):

```
accept_fuel_disagreement | definer
add_pei_staff_note | definer
assign_fuel_transaction_operator | definer
clear_operator_departing | definer
clear_operator_parked | definer
commit_fuel_import | definer
complete_pei_request_on_response | definer
log_pei_manual_send | definer
log_pei_phone_attempt | definer
set_operator_departing | definer
set_operator_parked | definer
set_pei_request_auto_pause | definer
submit_pei_response | definer
confirm_equipment_returned | definer
```

| Table | Rows | Writers (file / function) | Proposed disposition — reason |
| --- | --- | --- | --- |
| `fuel_transactions` | 69 | `src/lib/fuel/fuelImport.ts`; definer `commit_fuel_import`, `assign_fuel_transaction_operator`; read by `src/lib/settlementEngine.ts`, `settlementRun.ts`, `FuelLocationReportPage.tsx`, `FuelDriverDetailPage.tsx`, `fuelExceptions.ts` | **per-carrier (next batch)** — a carrier's fuel spend feeds its settlements |
| `fuel_transaction_lines` | 125 | definer `commit_fuel_import` | **per-carrier** — child of the above; derive from parent |
| `fuel_import_batches` | 1 | `src/lib/fuel/fuelImport.ts`, `fuelExceptions.ts` | **per-carrier** — a carrier's own card import history |
| `fuel_disagreement_acceptances` | 0 | `src/lib/fuel/fuelImport.ts`; definer `accept_fuel_disagreement` | **per-carrier** — a driver's acceptance of his carrier's charge |
| `operator_broadcasts` | 1 | `src/components/management/OperatorBroadcast.tsx`; `supabase/functions/send-operator-broadcast`, `dispatch-scheduled-broadcasts` | **per-carrier** — one carrier's message to its own drivers |
| `operator_departing_events` | 2 | `src/components/drivers/DepartingControl.tsx`; definer `set_operator_departing`, `clear_operator_departing` | **per-carrier** — derive from the operator |
| `operator_parking_events` | 2 | definer `set_operator_parked`, `clear_operator_parked` only (no client writer found) | **per-carrier** — derive from the operator |
| `equipment_return_confirmations` | 0 | `src/components/drivers/EquipmentReceiptControl.tsx`; definer `confirm_equipment_returned` | **per-carrier** — derive from the assignment/operator |
| `driver_optional_docs` | 0 | `src/hooks/useDriverOptionalDocs.ts` | **per-carrier** — keyed on `driver_id`; derive from the operator |
| `onboard_assignment_sheet_sends` | 9 | `supabase/functions/send-osas-to-operator`; `src/components/equipment/SignOffSheetList.tsx` | **per-carrier** — derive from the parent sheet |
| `staff_event_acknowledgments` | 115 | `src/hooks/useStaffBirthdayAnniversaryEvents.ts` | **per-carrier** — a staff member's own acknowledgment, and staff belong to a company |
| `driver_documents` | 11 | `src/components/documents/DocumentHub.tsx`, `AdminDocumentList.tsx`, `DocumentEditorModal.tsx`; read by `OperatorPortal.tsx`, `OperatorDetailPanel.tsx`, `ContractorPaySetup.tsx` | **DEFERRED content** — it is the Document Hub library, not per-driver data; no driver column. Same product-versus-carrier split as `faq`/`services` |
| `eld_cron_runs` | 1,091 | `supabase/functions/process-eld-escalations`; read by `ELDEscalationJobHealth.tsx` | **GLOBAL** — the job ran once, over all carriers; a run is not tenant data |
| `staff_help_query_log` | 5 | `supabase/functions/staff-help-chat` | **GLOBAL** or per-carrier — it logs a question against a global corpus. Proposal: GLOBAL while `staff_help_knowledge` is DEFERRED |
| `email_send_state` | 1 | `supabase/functions/process-email-queue` | **GLOBAL** — already decided 2026-09-13 (`CHECK (id = 1)`, shared sending domain) and separately guarded |
| `pei_requests` | 144 | `src/lib/pei/api.ts`, `sendPEIEmail.ts`, `AddPreviousEmployerModal.tsx`, `ApplicationPEITab.tsx`, `PEIQueuePanel.tsx`, `PipelineDashboard.tsx`; `supabase/functions/log-pei-event`, `pei-release-fcra`, `pei-auto-cadence`; definer `set_pei_request_auto_pause`, `add_pei_staff_note`, `log_pei_manual_send`, `log_pei_phone_attempt` | **waits-on-applications** — hangs off a GLOBAL `applications` row |
| `pei_request_events` | 527 | `supabase/functions/log-pei-event`; `src/lib/pei/api.ts` | **waits-on-applications** |
| `pei_responses` | 16 | `supabase/functions/log-pei-event`; `src/lib/pei/api.ts`; definer `submit_pei_response`, `complete_pei_request_on_response` | **waits-on-applications** |
| `pei_accidents` | 1 | `src/lib/pei/api.ts` | **waits-on-applications** |

Proposals only. The owner decides.

### Query 5 — every live policy on the 19, verbatim

```sql
SELECT tablename||' | '||policyname||' | '||cmd||' | '||coalesce(roles::text,'')
     ||' | USING '||coalesce(qual,'-')||' | CHECK '||coalesce(with_check,'-') AS p
FROM pg_policies WHERE schemaname='public' AND tablename IN (<the 19>)
ORDER BY tablename, policyname;
```

```
driver_documents | Drivers can view visible documents | SELECT | {public} | USING ((is_visible = true) AND (auth.uid() IS NOT NULL)) | CHECK -
driver_documents | Staff can delete driver documents | DELETE | {public} | USING is_staff(auth.uid()) | CHECK -
driver_documents | Staff can insert driver documents | INSERT | {public} | USING - | CHECK is_staff(auth.uid())
driver_documents | Staff can update driver documents | UPDATE | {public} | USING is_staff(auth.uid()) | CHECK -
driver_documents | Staff can view all driver documents | SELECT | {public} | USING is_staff(auth.uid()) | CHECK -
driver_optional_docs | Drivers can view their own optional docs | SELECT | {public} | USING (auth.uid() = driver_id) | CHECK -
driver_optional_docs | Staff can manage driver optional docs | ALL | {public} | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
eld_cron_runs | eld_cron_runs_select_staff | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
email_send_state | Service role can manage send state | ALL | {public} | USING (auth.role() = 'service_role'::text) | CHECK (auth.role() = 'service_role'::text)
equipment_return_confirmations | erc_staff_read | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
fuel_disagreement_acceptances | fuel_disagreement_acceptances_read_staff | SELECT | {authenticated} | USING ( SELECT is_staff(auth.uid()) AS is_staff) | CHECK -
fuel_import_batches | fuel_batches_read_staff | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
fuel_import_batches | fuel_batches_write_management | ALL | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
fuel_transaction_lines | fuel_lines_read_staff | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
fuel_transaction_lines | fuel_lines_write_management | ALL | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
fuel_transactions | fuel_transactions_read_staff | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
fuel_transactions | fuel_transactions_write_management | ALL | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
onboard_assignment_sheet_sends | Staff insert osas sends | INSERT | {authenticated} | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
onboard_assignment_sheet_sends | Staff manage osas sends | SELECT | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR (EXISTS ( SELECT 1
   FROM (onboard_assignment_sheets s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE ((s.id = onboard_assignment_sheet_sends.sheet_id) AND (o.user_id = auth.uid()))))) | CHECK -
operator_broadcasts | Mgmt can insert broadcasts | INSERT | {public} | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
operator_broadcasts | Mgmt can update broadcasts | UPDATE | {public} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_broadcasts | Mgmt can view broadcasts | SELECT | {public} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_broadcasts | Operators can view broadcasts addressed to them | SELECT | {authenticated} | USING (id IN ( SELECT operator_broadcast_recipients.broadcast_id
   FROM operator_broadcast_recipients
  WHERE (operator_broadcast_recipients.operator_id IN ( SELECT operators.id
           FROM operators
          WHERE (operators.user_id = auth.uid()))))) | CHECK -
operator_broadcasts | mgmt delete broadcasts | DELETE | {public} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_broadcasts | mgmt update broadcasts | UPDATE | {public} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
operator_departing_events | Dispatch and management can view departing events | SELECT | {authenticated} | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_parking_events | Staff can view parking events | SELECT | {authenticated} | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
pei_accidents | Management delete PEI accidents | DELETE | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
pei_accidents | Staff insert PEI accidents | INSERT | {authenticated} | USING - | CHECK is_staff(auth.uid())
pei_accidents | Staff view PEI accidents | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
pei_request_events | Staff view PEI events | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
pei_requests | Management delete PEI requests | DELETE | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
pei_requests | Staff insert PEI requests | INSERT | {authenticated} | USING - | CHECK is_staff(auth.uid())
pei_requests | Staff update PEI requests | UPDATE | {authenticated} | USING is_staff(auth.uid()) | CHECK -
pei_requests | Staff view PEI requests | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
pei_responses | Management delete PEI responses | DELETE | {authenticated} | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
pei_responses | Staff insert PEI responses | INSERT | {authenticated} | USING - | CHECK is_staff(auth.uid())
pei_responses | Staff view PEI responses | SELECT | {authenticated} | USING is_staff(auth.uid()) | CHECK -
staff_event_acknowledgments | Staff can delete own acknowledgments | DELETE | {authenticated} | USING (user_id = auth.uid()) | CHECK -
staff_event_acknowledgments | Staff can insert own acknowledgments | INSERT | {authenticated} | USING - | CHECK (user_id = auth.uid())
staff_event_acknowledgments | Staff can read own acknowledgments | SELECT | {authenticated} | USING (user_id = auth.uid()) | CHECK -
staff_help_query_log | staff_help_query_log_insert_own | INSERT | {authenticated} | USING - | CHECK ((user_id = auth.uid()) AND is_staff(auth.uid()))
staff_help_query_log | staff_help_query_log_read_admin | SELECT | {authenticated} | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
```

Every one of these is a role test or an ownership test. **None carries a company
predicate**, and none could: the column does not exist. With a second carrier, staff
of carrier B read carrier A's fuel transactions, import batches, broadcasts, parking
and departing events, ELD job health, PEI requests and responses, and the Document
Hub library. `staff_event_acknowledgments` and `driver_optional_docs` are the two
protected by ownership rather than role, so they do not leak.

### Query 6 — the seven extra stamps (contradiction 2)

```sql
WITH live AS (SELECT t.tgrelid::regclass::text n FROM pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgname='aa_stamp_tenant_company_id' AND t.tgenabled='O')
SELECT n FROM live WHERE n IN ('share_tokens','document_short_links','binder_share_bundles',
  'ica_review_links','officer_packet_links','preview_sessions','passenger_authorizations')
ORDER BY 1;
```
→ all seven present. Exactly the count difference 128 − 121.

---

## STEP 2 — the disposition guard

Added at the foot of `src/test/tenancy-resolver.test.ts`: three new lists
(`GLOBAL_LOGS`, `AWAITING_APPLICATIONS`, `UNASSIGNED`) and one test,
`tenancy disposition — every table accounted for > no public base table lacks both a
company_id and a disposition`. It asserts four things: the inventory query returned
something at all; every columnless table is in one of the five lists; none is in two;
and no list names a table that has since gained the column.

Command:

```
npx vitest run src/test/tenancy-resolver.test.ts -t "no public base table lacks"
```

Green (before the demonstration):

```
 ✓ src/test/tenancy-resolver.test.ts (115 tests | 114 skipped) 1104ms
   ✓ tenancy disposition — every table accounted for > no public base table lacks both a company_id and a disposition  1097ms
 Test Files  1 passed (1)
      Tests  1 passed | 114 skipped (115)
```

### Deliberate failure — `driver_documents` removed from `UNASSIGNED`

```
 FAIL  src/test/tenancy-resolver.test.ts > tenancy disposition — every table accounted for > no public base table lacks both a company_id and a disposition
AssertionError: these tables have no company_id and no disposition: decide, or add them to UNASSIGNED: expected [ 'driver_documents' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "driver_documents",
+ ]

 ❯ src/test/tenancy-resolver.test.ts:1936:7
```

Restored (`rg` confirmed the line back in place) and re-run green, as above.

### The existing guards

The corrected census, run alone:

```
npx vitest run src/test/tenancy-resolver.test.ts -t "every stamped table shares one trigger name"
 ✓ tenancy batch B2 part two — user_roles, loads, equipment_items > every stamped table shares one trigger name, sorting ahead of validation  2728ms
      Tests  1 passed | 114 skipped (115)
```

Whole file:

```
npx vitest run src/test/tenancy-resolver.test.ts
 Test Files  1 passed (1)
      Tests  115 passed (115)
     Errors  1 error
   Duration  356.65s
```

**115 of 115 pass.** The trailing `Errors 1 error` is the known Vitest worker
`onTimeoutError` / `Timeout._onTimeout` on a ~6-minute run, not an assertion. Recorded
rather than claimed clean: this run is not wholly green, and the same artefact was
recorded in B7.

Typecheck, with the correct project (a bare `npx tsgo --noEmit` compiles zero files):

```
npx tsgo -p tsconfig.app.json --noEmit
TYPECHECK_OK
```

---

## STEP 3 — the record

`docs/tms-build-status.md`, dated entry `2026-09-16 — the unassigned tables, and the
second-carrier readiness record`, covering (a) the corrected B8 statement and why no
prior guard could catch it, (b) the five prerequisites before a second
`carrier_profile` row, (c) the three accepted-for-the-demo items, (d) the four
corrections to the readiness report, (e) the unresolved seeded-versus-hand-onboarded
tension, (f) the `SET ROLE` verification boundary, and the census-was-red finding.

## Files changed

- `docs/tms-build-status.md` — appended one dated entry.
- `src/test/tenancy-resolver.test.ts` — added `GLOBAL_LOGS`,
  `AWAITING_APPLICATIONS`, `UNASSIGNED` and the disposition test; added
  `...B8_SHAPE_1` to the stamped-table census with a comment.
- `docs/passes/2026-09-16-1138-unassigned-tables-and-readiness-record.md` — this report.

No migration ran. No database row was written or deleted. No function or application
code was modified.
