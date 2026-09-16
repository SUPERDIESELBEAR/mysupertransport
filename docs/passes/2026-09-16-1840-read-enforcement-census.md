# Pass report — 2026-09-16 18:40 UTC — the owner's disposition decision, and the live read-enforcement census

Changes permitted: `docs/tms-build-status.md` and this report. `src/test/tenancy-resolver.test.ts`
was edited ONLY as the two temporary Step 3 mutations and ends **byte-identical to HEAD**
(proof below). **No migration, no function or app code, no data change.**

Read first: the record's `2026-09-16 — the unassigned tables, and the second-carrier
readiness record` entry and
`docs/passes/2026-09-16-1138-unassigned-tables-and-readiness-record.md`.

## Contradictions found

One, and it is the point of the pass:

**The reviewer's reading of the migration files is RIGHT about the shape and slightly
wrong about the number.** Live, **12** tables with `company_id` carry a policy that tests
the ROW's company, not 13 — `carrier_profile` is the thirteenth on the reviewer's list and
it has no `company_id` column at all (its `id` IS the company, and its policy is
`(id = current_company_id())`). The other twelve are exactly the twelve named. So:

- 148 public base tables have `company_id`.
- 12 of them test it in a policy.
- **123 have at least one policy that admits a read on ROLE ALONE.**

`loads_staff_manage` is `has_role(...)` only, as the reviewer said. Verbatim below.

Nothing else contradicted the record. Carrier count is still 1 (`SELECT count(*) FROM
public.carrier_profile` → `1`).

---

## STEP 1 — the owner's decision, and the arithmetic

The decision itself is recorded in `docs/tms-build-status.md` (entry
`2026-09-16 — the owner's disposition decision, and the live read-enforcement census`),
section (a). Twelve tables go per-carrier in the next batch; `driver_documents` joins the
DEFERRED content group (nine now); `eld_cron_runs` is GLOBAL with a noted read-policy
defect to revisit alongside the `process-eld-escalations` timezone fix. The test lists were
NOT changed — the batch will move them.

### The arithmetic, reconciled table by table

The 2026-09-16 entry said the gap traces to "B6 Group 3's 20 deferred candidates" and then
listed 19 tables. Both numbers are right; the entry did not show the join. It is:

```
B6 Group 3 measured        88 tables lacking company_id
  less 18 declared GLOBAL
  less  8 DEFERRED content
  less  4 B7 logs      (notifications, dispatch_daily_log, audit_log, email_send_log)
  less  7 B8 token/share
  =        51 candidates          <- B6's own figure
B6 migrated               31
  =        20 remaining           <- "20 of the 51 candidates … fall to later batches"
```

Those 20 are today's 19 **plus `share_token_access_log`**, which B8 met inside the
candidate pool and declared GLOBAL rather than migrating (`docs/passes/2026-09-15-2359-b8-token-share.md`).
19 + 1 = 20. Reconciled, exactly, with no residue.

The whole-database chain agrees independently: 88 − 31 (B6) − 2 (B7 migrated
`notifications` and `dispatch_daily_log`) − 7 (B8) = **48**, which is the live count of
tables lacking `company_id` measured this pass and last.

One nuance worth stating rather than absorbing: `email_send_state` is one of the 19 and
one of the 20. It was already decided GLOBAL on 2026-09-13 and separately guarded, so it
was never truly undecided — but no batch subtracted it either, which is why it surfaced in
the residue.

---

## STEP 2 — THE LIVE READ-ENFORCEMENT CENSUS

Every query below was run with `psql` against the live database. No writes.

### Query 1 — how many tables have the column

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND column_name='company_id'
  AND table_name IN (SELECT table_name FROM information_schema.tables
                     WHERE table_schema='public' AND table_type='BASE TABLE');
```
→ `148`

### Query 2 — every policy on those tables (a)

```sql
WITH ct AS (SELECT DISTINCT c.table_name t FROM information_schema.columns c
  JOIN information_schema.tables tb ON tb.table_schema='public'
   AND tb.table_name=c.table_name AND tb.table_type='BASE TABLE'
  WHERE c.table_schema='public' AND c.column_name='company_id')
SELECT p.tablename, p.policyname, p.cmd, p.permissive, p.roles::text,
       coalesce(p.qual,''), coalesce(p.with_check,'')
FROM pg_policies p JOIN ct ON ct.t=p.tablename WHERE p.schemaname='public'
ORDER BY 1,2;
```
→ **436 policies over 146 tables.** All 436, verbatim with their classification, are in
Appendix A at the foot of this report.

Two tables have `company_id` and **no policy at all**:

```sql
SELECT t FROM ct WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=ct.t) ORDER BY 1;
```
```
document_short_links
message_notification_throttle
```

RLS is enabled on both, so with no policy neither `anon` nor `authenticated` reads
anything: locked, reachable only by definer functions and service role. Grants confirm no
role but the sandbox's own is even granted:

```
document_short_links|sandbox_exec|INSERT,SELECT
message_notification_throttle|sandbox_exec|INSERT,SELECT
```

### Query 3 — the helper functions, live bodies (b)

Distinct functions referenced in those 436 predicates:
`current_company_id`, `has_role`, `is_own_operator`, `is_own_rods_operator`, `is_staff`,
`is_thread_participant`, `is_truck_owner_for_operator`, `operator_awaiting_return`,
`operator_return_requested` (plus `now`, `uid`).

The two that decide the whole census:

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (auth.role() = 'service_role'
           OR ur.company_id = public.current_company_id())
  )
$function$

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('onboarding_staff','dispatcher','management','owner')
      AND (auth.role() = 'service_role'
           OR ur.company_id = public.current_company_id())
  )
$function$
```

Both test the CALLER'S ROLE ROW against the caller's own company. Neither takes the row
being read, and neither can. `is_staff(auth.uid())` is true for carrier B's dispatcher
exactly as it is for carrier A's, and a policy whose whole predicate is `is_staff(auth.uid())`
therefore admits carrier B's dispatcher to carrier A's rows. That is the finding, stated
plainly: **the classification ROLE-ONLY is not a criticism of these functions — they do the
job they are named for. It is the absence of a second test.**

The ownership functions, live, all SECURITY DEFINER:

```sql
is_own_operator(_operator_id uuid)        -> EXISTS(operators o WHERE o.id=_operator_id AND o.user_id=auth.uid())
is_own_rods_operator(_operator_id uuid)   -> EXISTS(operators o WHERE o.id=_operator_id AND o.user_id=auth.uid())
is_truck_owner_for_operator(_uid,_op)     -> EXISTS(truck_owners WHERE user_id=_uid AND operator_id=_op)
is_thread_participant(_thread,_user)      -> EXISTS(thread_participants WHERE thread_id=_thread AND user_id=_user)
operator_awaiting_return(_operator_id)    -> EXISTS(onboarding_status os WHERE os.operator_id=_operator_id AND <any delivery_method='awaiting_return'>)
operator_return_requested(_operator_id)   -> EXISTS(onboard_assignment_sheets s WHERE s.operator_id=_operator_id AND s.return_requested_at IS NOT NULL)
```

The first four bind the row to THIS caller, so they isolate across carriers as a side
effect of isolating across people — classified OWNERSHIP. The last two do **not**: they
test a state of the operator named by the row and nothing about the caller. They only ever
appear ANDed with an ownership or role term, so they never widen a policy on their own;
they are noted here so the classification is not mistaken for an ownership claim.

`current_company_id()`, for the record (unchanged since the truck-owner pass): membership,
then own operator row, then own `truck_owners` row, else NULL.

### Query 4 — the classification (b)

436 policies:

| class | count |
| --- | --- |
| ROLE-ONLY | 243 |
| OWNERSHIP | 171 |
| COMPANY | 19 |
| OTHER | 2 |
| SERVICE | 1 |

Rule applied, in order: `service_role`-only roles or a bare `auth.role() = 'service_role'`
predicate → SERVICE; any `company_id` in the predicate → COMPANY; any `has_role`/`is_staff`
without one → ROLE-ONLY; otherwise `auth.uid()` or one of the four person-binding functions
→ OWNERSHIP; anything left → OTHER. A predicate that is `has_role(...) OR <ownership>` is
ROLE-ONLY, because the role branch alone admits.

The 19 COMPANY policies, verbatim, over 12 tables:

```
accessorial_adjustments | dispatcher management owner read within company | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
ar_aging_snapshots | ar_aging_snapshots management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
carrier_signature_settings | Management can delete carrier signature settings | DELETE | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
carrier_signature_settings | Management can insert carrier signature settings | INSERT | PERMISSIVE | {authenticated} | USING - | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
carrier_signature_settings | Management can update carrier signature settings | UPDATE | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
carrier_signature_settings | Staff can view carrier signature settings | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND is_staff(auth.uid())) | CHECK -
factoring_remittances | factoring_remittances management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
invoice_batches | invoice_batches management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
invoice_line_items | invoice_line_items management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
invoice_number_config | Management and owner read invoice numbering | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
invoices | invoices management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
payments | payments management and owner only | ALL | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
settlement_settings | Management can create settlement settings | INSERT | PERMISSIVE | {authenticated} | USING - | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
settlement_settings | Management can update settlement settings | UPDATE | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
settlement_settings | Staff can read settlement settings | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
share_tokens | Management can update share tokens | UPDATE | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
share_tokens | Staff can view share tokens | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))) | CHECK -
unit_number_config | Management changes unit number config | UPDATE | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
unit_number_config | Onboarding staff and management read unit number config | SELECT | PERMISSIVE | {authenticated} | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
```

Every one is `(company_id = current_company_id()) AND <role test>` — the correct shape, and
the shape the other 136 tables do not have.

`carrier_profile` (no `company_id`; `id` is the company):

```
Callers read only their own carrier profile|SELECT|{authenticated}|(id = current_company_id())|-
Management can delete the carrier profile|DELETE|{authenticated}|(has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'))|-
Management can insert the carrier profile|INSERT|{authenticated}|-|(has_role(...'management') OR has_role(...'owner'))
Management can update the carrier profile|UPDATE|{authenticated}|(has_role(...'management') OR has_role(...'owner'))|(has_role(...'management') OR has_role(...'owner'))
```

Read is company-scoped; **write is role-only**, so carrier B's management could update
carrier A's profile row. Not in scope to fix here; listed under (e) for the owner.

The two OTHER policies:

```
inspection_program_settings | staff read program settings | SELECT | USING true
preview_sessions            | No client access to preview sessions | ALL | USING false | CHECK false
```

`inspection_program_settings`' read is `true` — every authenticated user of every carrier,
regardless of role. `preview_sessions` is closed to clients entirely.

The one SERVICE policy is on `staff_help_threads`; the rest of the service-role paths in
this database are definer functions and grants rather than policies.

### Query 5 — the summary table (c)

`table | rows | RESTRICTIVE | ROLE-ONLY by cmd`. **No table in `public` has a RESTRICTIVE
policy** (query 6), so that column reads `none` throughout and is kept only because it was
asked for. Tables with a ROLE-ONLY policy admitting a READ (`SELECT` or `ALL`) sort first,
then by row count descending.

| table | rows | policies | RESTRICTIVE | ROLE-ONLY by cmd | other classes |
| --- | --- | --- | --- | --- | --- |
| `dispatch_daily_log` | 5928 | 6 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `dispatch_status_history` | 1502 | 3 | none | INSERT 1, SELECT 1 | OWNERSHIP 1 |
| `operator_documents` | 1184 | 6 | none | ALL 1, SELECT 1 | OWNERSHIP 4 |
| `driver_vault_documents` | 843 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `inspection_documents` | 774 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `document_acknowledgments` | 365 | 3 | none | SELECT 1 | OWNERSHIP 2 |
| `equipment_assignments` | 278 | 5 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 1 |
| `forecast_loads` | 278 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `forecast_expenses` | 275 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `equipment_items` | 219 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `user_roles` | 182 | 3 | none | SELECT 2 | OWNERSHIP 1 |
| `onboarding_status` | 154 | 7 | none | INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 4 |
| `operators` | 154 | 6 | none | INSERT 1, SELECT 1, UPDATE 2 | OWNERSHIP 2 |
| `truck_dot_inspections` | 105 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `parser_diagnostics` | 82 | 2 | none | SELECT 1, UPDATE 1 | — |
| `active_dispatch` | 80 | 5 | none | INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `ica_contracts` | 65 | 8 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 4 |
| `mo_plate_assignments` | 60 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `contractor_pay_setup` | 56 | 6 | none | SELECT 1, UPDATE 1 | OWNERSHIP 4 |
| `cert_reminders` | 53 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `load_change_history` | 47 | 1 | none | SELECT 1 | — |
| `mo_plates` | 38 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `lease_terminations` | 37 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `load_stops` | 37 | 4 | none | ALL 1, SELECT 1 | OWNERSHIP 2 |
| `notification_role_defaults` | 35 | 2 | none | ALL 1, SELECT 1 | — |
| `onboard_assignment_sheet_items` | 31 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `load_documents` | 25 | 4 | none | ALL 1, SELECT 1 | OWNERSHIP 2 |
| `load_references` | 19 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `truck_maintenance_records` | 19 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `loads` | 18 | 4 | none | ALL 1, SELECT 1 | OWNERSHIP 2 |
| `document_version_history` | 17 | 2 | none | INSERT 1, SELECT 1 | — |
| `load_status_history` | 16 | 2 | none | SELECT 1 | OWNERSHIP 1 |
| `load_reference_citations` | 14 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `brokers` | 13 | 4 | none | ALL 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `onboard_assignment_sheets` | 13 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `service_resource_views` | 11 | 5 | none | SELECT 1 | OWNERSHIP 4 |
| `dispatch_settlement_line_items` | 9 | 1 | none | ALL 1 | — |
| `ica_driver_acknowledgments` | 9 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `inspection_document_versions` | 8 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `passenger_authorizations` | 8 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `dispatch_settlement_load_contributions` | 7 | 1 | none | ALL 1 | — |
| `driver_uploads` | 6 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `rate_con_ingest_queue` | 5 | 2 | none | SELECT 1, UPDATE 1 | — |
| `truck_owners` | 5 | 3 | none | ALL 1 | OWNERSHIP 2 |
| `equipment_serial_conflict_dismissals` | 4 | 3 | none | DELETE 1, INSERT 1, SELECT 1 | — |
| `load_charges` | 4 | 3 | none | ALL 1, SELECT 1 | OWNERSHIP 1 |
| `dispatch_settlement_charge_verdicts` | 3 | 1 | none | ALL 1 | — |
| `equipment_receipts` | 3 | 6 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `rods_correction_requests` | 3 | 4 | none | INSERT 1, SELECT 1 | OWNERSHIP 2 |
| `carrier_notification_settings` | 2 | 2 | none | ALL 1, SELECT 1 | — |
| `facilities` | 2 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `ica_review_links` | 2 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `inspection_binder_order` | 2 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `rods_days` | 2 | 5 | none | SELECT 1 | OWNERSHIP 4 |
| `service_resource_completions` | 2 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `settlement_withheld_loads` | 2 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `blank_log_acknowledgments` | 1 | 3 | none | SELECT 1 | OWNERSHIP 2 |
| `claim_flag_history` | 1 | 1 | none | SELECT 1 | — |
| `claim_flags` | 1 | 2 | none | ALL 1, SELECT 1 | — |
| `company_settings` | 1 | 2 | none | SELECT 1, UPDATE 1 | — |
| `dispatch_settlement_rates` | 1 | 1 | none | ALL 1 | — |
| `dispatch_settlements` | 1 | 1 | none | ALL 1 | — |
| `dot_consultant_email_settings` | 1 | 2 | none | SELECT 1, UPDATE 1 | — |
| `fleet_settings` | 1 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `forecast_deductions` | 1 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `inspection_program_settings` | 1 | 2 | none | ALL 1 | OTHER 1 |
| `insurance_email_settings` | 1 | 2 | none | SELECT 1, UPDATE 1 | — |
| `load_number_config` | 1 | 2 | none | SELECT 1, UPDATE 1 | — |
| `operator_broadcast_recipients` | 1 | 5 | none | INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `pay_policies` | 1 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `pei_cadence_settings` | 1 | 1 | none | SELECT 1 | — |
| `service_help_requests` | 1 | 4 | none | SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `settlement_line_items` | 1 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `settlements` | 1 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `broker_contacts` | 0 | 5 | none | ALL 1, DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `broker_do_not_load_history` | 0 | 2 | none | SELECT 2 | — |
| `broker_documents` | 0 | 4 | none | ALL 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `broker_factoring_history` | 0 | 2 | none | ALL 1, SELECT 1 | — |
| `broker_notes` | 0 | 5 | none | ALL 1, DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `cash_advances` | 0 | 1 | none | ALL 1 | — |
| `company_documents` | 0 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `deduction_installments` | 0 | 1 | none | ALL 1 | — |
| `deductions` | 0 | 1 | none | ALL 1 | — |
| `detention_claims` | 0 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `dispatch_deductions` | 0 | 1 | none | ALL 1 | — |
| `dispatch_settlement_rates_history` | 0 | 2 | none | INSERT 1, SELECT 1 | — |
| `document_exceptions` | 0 | 4 | none | ALL 1, SELECT 1 | OWNERSHIP 2 |
| `document_send_log` | 0 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `documents` | 0 | 4 | none | SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `driver_staff_contact_suppressions` | 0 | 7 | none | DELETE 1, INSERT 1, SELECT 1 | OWNERSHIP 4 |
| `driver_staff_contacts` | 0 | 7 | none | DELETE 1, INSERT 1, SELECT 1 | OWNERSHIP 4 |
| `eld_devices` | 0 | 2 | none | ALL 1, SELECT 1 | — |
| `eld_extension_requests` | 0 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `eld_malfunction_events` | 0 | 4 | none | SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `eld_malfunction_notifications` | 0 | 1 | none | SELECT 1 | — |
| `eld_sync_alerts` | 0 | 2 | none | SELECT 1, UPDATE 1 | — |
| `ica_amendment_units` | 0 | 3 | none | ALL 1, SELECT 1 | OWNERSHIP 1 |
| `ica_amendments` | 0 | 6 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `inspection_cycles` | 0 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `inspection_program_payments` | 0 | 2 | none | ALL 1 | OWNERSHIP 1 |
| `message_threads` | 0 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `officer_packet_links` | 0 | 1 | none | SELECT 1 | — |
| `owner_transfers` | 0 | 2 | none | SELECT 1 | OWNERSHIP 1 |
| `pandadoc_documents` | 0 | 4 | none | INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 1 |
| `pay_policy_assignments` | 0 | 4 | none | DELETE 1, INSERT 1, SELECT 1, UPDATE 1 | — |
| `rm_deposit_transactions` | 0 | 1 | none | ALL 1 | — |
| `rm_deposits` | 0 | 1 | none | ALL 1 | — |
| `roadside_stop_documents` | 0 | 1 | none | ALL 1 | — |
| `roadside_stop_violations` | 0 | 1 | none | ALL 1 | — |
| `roadside_stops` | 0 | 4 | none | ALL 1 | OWNERSHIP 3 |
| `rods_amendments` | 0 | 2 | none | SELECT 1 | OWNERSHIP 1 |
| `rods_divergences` | 0 | 2 | none | SELECT 1 | OWNERSHIP 1 |
| `rods_events` | 0 | 5 | none | SELECT 1 | OWNERSHIP 4 |
| `rods_unlock_events` | 0 | 3 | none | SELECT 1 | OWNERSHIP 2 |
| `service_resource_bookmarks` | 0 | 4 | none | SELECT 1 | OWNERSHIP 3 |
| `settlement_settings_history` | 0 | 1 | none | SELECT 1 | — |
| `staff_email_overrides` | 0 | 2 | none | ALL 1, SELECT 1 | — |
| `staff_help_threads` | 0 | 4 | none | INSERT 1, SELECT 1 | OWNERSHIP 2 |
| `staff_messaging_settings` | 0 | 5 | none | INSERT 1, SELECT 1, UPDATE 1 | OWNERSHIP 2 |
| `thread_participants` | 0 | 5 | none | SELECT 1 | OWNERSHIP 4 |
| `truck_plate_history` | 0 | 1 | none | SELECT 1 | — |
| `truck_state_permits` | 0 | 3 | none | ALL 1, SELECT 1 | OWNERSHIP 1 |
| `vacant_units` | 0 | 3 | none | INSERT 1, SELECT 1, UPDATE 1 | — |
| `notifications` | 10868 | 5 | none | INSERT 1 | OWNERSHIP 4 |
| `share_tokens` | 693 | 3 | none | INSERT 1 | COMPANY 2 |
| `preview_sessions` | 119 | 1 | none | — | OTHER 1 |
| `operator_offboarding_steps` | 100 | 2 | none | — | OWNERSHIP 1, SERVICE 1 |
| `document_short_links` | 25 | **0 — no policy** | none | — | — |
| `messages` | 18 | 7 | none | UPDATE 1 | OWNERSHIP 6 |
| `company_members` | 15 | 1 | none | — | OWNERSHIP 1 |
| `notification_preferences` | 11 | 4 | none | — | OWNERSHIP 4 |
| `binder_share_bundles` | 8 | 2 | none | — | OWNERSHIP 2 |
| `message_notification_throttle` | 6 | **0 — no policy** | none | — | — |
| `user_view_preferences` | 5 | 4 | none | — | OWNERSHIP 4 |
| `accessorial_adjustments` | 2 | 1 | none | — | COMPANY 1 |
| `staff_ui_preferences` | 2 | 4 | none | — | OWNERSHIP 4 |
| `carrier_signature_settings` | 1 | 4 | none | — | COMPANY 4 |
| `invoice_line_items` | 1 | 1 | none | — | COMPANY 1 |
| `invoice_number_config` | 1 | 1 | none | — | COMPANY 1 |
| `invoices` | 1 | 1 | none | — | COMPANY 1 |
| `settlement_settings` | 1 | 3 | none | — | COMPANY 3 |
| `unit_number_config` | 1 | 2 | none | — | COMPANY 2 |
| `ar_aging_snapshots` | 0 | 1 | none | — | COMPANY 1 |
| `factoring_remittances` | 0 | 1 | none | — | COMPANY 1 |
| `invoice_batches` | 0 | 1 | none | — | COMPANY 1 |
| `message_reactions` | 0 | 3 | none | — | OWNERSHIP 3 |
| `payments` | 0 | 1 | none | — | COMPANY 1 |
| `staff_help_messages` | 0 | 3 | none | INSERT 1 | OWNERSHIP 2 |

### Query 6 — the totals (c)

```sql
SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND p.polpermissive = false;
```
→ `0` restrictive policies in the whole schema.

| measure | count |
| --- | --- |
| public base tables with `company_id` | 148 |
| of those, with at least one policy | 146 |
| with no policy at all | 2 |
| total policies on them | 436 |
| tables with ≥1 ROLE-ONLY policy | 127 |
| **tables where a ROLE-ONLY policy admits a READ** | **123** |
| tables whose every policy is COMPANY / OWNERSHIP / SERVICE | 18 |
| tables with a direct `company_id` policy predicate | 12 |
| restrictive policies | 0 |

ROLE-ONLY by command across the 436: SELECT 96, ALL 62, INSERT 34, UPDATE 29, DELETE 22.

The 123 tables whose reads rest on role alone, largest first:

`dispatch_daily_log` (5928), `dispatch_status_history` (1502), `operator_documents` (1184), `driver_vault_documents` (843), `inspection_documents` (774), `document_acknowledgments` (365), `equipment_assignments` (278), `forecast_loads` (278), `forecast_expenses` (275), `equipment_items` (219), `user_roles` (182), `onboarding_status` (154), `operators` (154), `truck_dot_inspections` (105), `parser_diagnostics` (82), `active_dispatch` (80), `ica_contracts` (65), `mo_plate_assignments` (60), `contractor_pay_setup` (56), `cert_reminders` (53), `load_change_history` (47), `mo_plates` (38), `lease_terminations` (37), `load_stops` (37), `notification_role_defaults` (35), `onboard_assignment_sheet_items` (31), `load_documents` (25), `load_references` (19), `truck_maintenance_records` (19), `loads` (18), `document_version_history` (17), `load_status_history` (16), `load_reference_citations` (14), `brokers` (13), `onboard_assignment_sheets` (13), `service_resource_views` (11), `dispatch_settlement_line_items` (9), `ica_driver_acknowledgments` (9), `inspection_document_versions` (8), `passenger_authorizations` (8), `dispatch_settlement_load_contributions` (7), `driver_uploads` (6), `rate_con_ingest_queue` (5), `truck_owners` (5), `equipment_serial_conflict_dismissals` (4), `load_charges` (4), `dispatch_settlement_charge_verdicts` (3), `equipment_receipts` (3), `rods_correction_requests` (3), `carrier_notification_settings` (2), `facilities` (2), `ica_review_links` (2), `inspection_binder_order` (2), `rods_days` (2), `service_resource_completions` (2), `settlement_withheld_loads` (2), `blank_log_acknowledgments` (1), `claim_flag_history` (1), `claim_flags` (1), `company_settings` (1), `dispatch_settlement_rates` (1), `dispatch_settlements` (1), `dot_consultant_email_settings` (1), `fleet_settings` (1), `forecast_deductions` (1), `inspection_program_settings` (1), `insurance_email_settings` (1), `load_number_config` (1), `operator_broadcast_recipients` (1), `pay_policies` (1), `pei_cadence_settings` (1), `service_help_requests` (1), `settlement_line_items` (1), `settlements` (1), `broker_contacts` (0), `broker_do_not_load_history` (0), `broker_documents` (0), `broker_factoring_history` (0), `broker_notes` (0), `cash_advances` (0), `company_documents` (0), `deduction_installments` (0), `deductions` (0), `detention_claims` (0), `dispatch_deductions` (0), `dispatch_settlement_rates_history` (0), `document_exceptions` (0), `document_send_log` (0), `documents` (0), `driver_staff_contact_suppressions` (0), `driver_staff_contacts` (0), `eld_devices` (0), `eld_extension_requests` (0), `eld_malfunction_events` (0), `eld_malfunction_notifications` (0), `eld_sync_alerts` (0), `ica_amendment_units` (0), `ica_amendments` (0), `inspection_cycles` (0), `inspection_program_payments` (0), `message_threads` (0), `officer_packet_links` (0), `owner_transfers` (0), `pandadoc_documents` (0), `pay_policy_assignments` (0), `rm_deposit_transactions` (0), `rm_deposits` (0), `roadside_stop_documents` (0), `roadside_stop_violations` (0), `roadside_stops` (0), `rods_amendments` (0), `rods_divergences` (0), `rods_events` (0), `rods_unlock_events` (0), `service_resource_bookmarks` (0), `settlement_settings_history` (0), `staff_email_overrides` (0), `staff_help_threads` (0), `staff_messaging_settings` (0), `thread_participants` (0), `truck_plate_history` (0), `truck_state_permits` (0), `vacant_units` (0)

### Query 7 — is there any OTHER enforcement mechanism? (c)

Checked, because a policy census is only conclusive if nothing else scopes the read:

- **Restrictive policies:** none in `public` (query 6). Nothing is silently ANDed onto the
  permissive predicates above.
- **Views:** two in `public` — `v_compliance_items` and `v_operator_active_units`. Both are
  `security_invoker=on`, i.e. they run as the CALLER and inherit the base tables' policies
  rather than bypassing them. `security_barrier` is not set on either. So they neither add
  nor remove scoping.
- **Event triggers:** six — `issue_pg_graphql_access`, `issue_graphql_placeholder`,
  `pgrst_ddl_watch`, `pgrst_drop_watch`, `issue_pg_cron_access`, `issue_pg_net_access`. All
  are Supabase/PostgREST plumbing; none rewrites or supplements a policy.
- **Definer functions:** these DO enforce their own rules and are the reason several of the
  148 are not as exposed as their policies suggest — e.g. `add_load_charge` checks the
  caller's role itself, and the invoice/settlement writers refuse mismatched payloads. But a
  definer function protects the path THROUGH it; it does not constrain a direct
  PostgREST `SELECT` on the table, which is the read this census measures.

So the answer is no: for reads, the policies above are the whole of the enforcement.

### (d) The live answer versus the reviewer's reading

Stated plainly, as asked:

1. **The reviewer is right on the substance.** B2–B8 stamped `company_id` and did not add a
   row-level company test to the pre-existing policies. Stamping decided where a row
   BELONGS. It never decided who may READ it. Those are two different jobs and only one of
   them has been done.
2. **`loads_staff_manage` is exactly as described.** Live:
   `ALL | {authenticated} | USING (has_role(auth.uid(),'dispatcher') OR has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'))`
   with the same as its `WITH CHECK`. No `company_id` anywhere in it — on a table that has
   the column, `NOT NULL`, and 17 rows.
3. **The number is 12, not 13.** The thirteenth, `carrier_profile`, has no `company_id`
   column; it scopes by `id`. If the intent was "13 areas of the schema are
   company-scoped," that is fair. If it was "13 tables have a `company_id` predicate," it
   is 12.
4. **The reviewer's characterisation of `has_role`/`is_staff` is precisely correct** and is
   quoted live above. They scope the caller's ROLE to the caller's company. They cannot
   scope the row, because the row is not passed to them.
5. **One thing the reviewer's file-reading could not see:** two of the 148 tables have NO
   policy at all (`document_short_links`, `message_notification_throttle`). Those are
   *safer* than the ROLE-ONLY ones, not less safe — locked to clients entirely.

### (e) What this means, and what closing it would take

The honest summary is one sentence: **as of today a second carrier's staff would see the
first carrier's operational data, and only the twelve billing/settings tables plus every
driver-owned table would hold.**

- **Holds already (18 tables):** every policy is COMPANY, OWNERSHIP or SERVICE. The billing
  family, `carrier_signature_settings`, `settlement_settings`, `unit_number_config`,
  `share_tokens`, and the driver-owned tables whose only policies bind to `auth.uid()`.
- **Holds by accident, and worth naming as such:** the 171 OWNERSHIP policies isolate
  carriers only because they isolate PEOPLE. Steve cannot read another driver's rows, so he
  cannot read another carrier's either. That is real protection, but it is not a tenancy
  boundary — it disappears the moment a policy is widened to "staff may also see this."
- **Does not hold (123 tables):** `loads`, `operators`, `applications`' relatives,
  `brokers`, `facilities`, the equipment tables, the fuel tables, `dispatch_daily_log`,
  `notifications`, the ELD/RODS staff-read paths, and so on.

The closure, when the owner calls for it, is mechanical but large and must not be done as
one migration:

1. For each of the 123, add `company_id = current_company_id()` as an AND term to every
   ROLE-ONLY policy. Where a policy is `has_role(...) OR <ownership>`, the company term
   attaches to the ROLE branch only — a driver must keep reading his own row.
2. Do it in the same batches the stamping used, verifying each with a real session per
   batch, because a policy tightened wrongly does not leak: it BREAKS a screen, silently,
   for the people who use it every day.
3. Leave the anonymous and service routes alone by construction. `share_tokens` already
   demonstrates the pattern: a company-scoped staff read alongside an unscoped anonymous
   resolve.

**Callers that resolve NO company, and therefore must never be put behind
`company_id = current_company_id()`:**

- **Anonymous** — `/inspect/:token`, tracking and share links, short links, officer packets,
  the ICA review link, `preview_sessions`. `auth.uid()` is NULL, so the resolver returns
  NULL and any company predicate is NULL → no rows. These reach data through definer
  functions or token policies and must keep doing so.
- **Applicants** — `applications` is GLOBAL by decision (2026-09-13); an applicant has no
  membership, no operator row and no truck-owner row.
- **Service-role jobs** — `auth.uid()` is NULL. They are exempted explicitly inside
  `has_role`/`is_staff` via `auth.role() = 'service_role'`, and they name the company on
  write via `_shared/tenancy.ts`. A company predicate added to a policy would NOT stop them
  (service role bypasses RLS) — but any definer path that starts calling
  `current_company_id()` for them will get NULL.
- **Truck owners** — they DO resolve now, from their own `truck_owners.company_id` row. Live
  check this pass: **0** profiles resolve to no company (`company_members` ∪ `operators` ∪
  `truck_owners` covers every profile in the database). The gap found on 2026-09-15 is
  closed.

Two defects surfaced by the census that are NOT part of the read-scoping work and want their
own decision:

- `inspection_program_settings`' read policy is `USING true` — any authenticated user of any
  role, any carrier.
- `carrier_profile`'s INSERT/UPDATE/DELETE are role-only, so carrier B's management could
  edit carrier A's profile row.
- (Already noted by the owner in Step 1: `eld_cron_runs` is GLOBAL with an `is_staff` read,
  so its cross-carrier payloads are readable by any carrier's staff. Revisit with the
  `process-eld-escalations` timezone fix.)

### The verification boundary, unchanged and restated

Every statement above is about POLICY TEXT and FUNCTION BODIES read live. None of it is a
demonstration that carrier B's dispatcher reads carrier A's loads, because there is exactly
one carrier and the sandbox role cannot `SET ROLE authenticated` to stage a transactional
RLS read. The exposure is derived, not observed. It becomes observable — and must be
observed — the moment the fictitious second carrier exists.

---

## STEP 3 — the two guard branches, demonstrated

The disposition guard's third and fourth assertions had never failed on purpose. Both were
made to fail, one at a time, in `src/test/tenancy-resolver.test.ts`.

**(i) duplicate list.** Added `'fuel_transactions'` to `DEFERRED_TABLES` while it remained
in `UNASSIGNED`:

```
 FAIL  src/test/tenancy-resolver.test.ts > tenancy disposition — every table accounted for > no public base table lacks both a company_id and a disposition
AssertionError: a table declared in two lists has two contradictory decisions: expected [ 'fuel_transactions' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "fuel_transactions",
+ ]

 ❯ src/test/tenancy-resolver.test.ts:1947:86
 Test Files  1 failed (1)
      Tests  1 failed | 114 skipped (115)
```

**(ii) stale entry.** Reverted (i), then added `'loads'` — which HAS `company_id` — to
`UNASSIGNED`:

```
 FAIL  src/test/tenancy-resolver.test.ts > tenancy disposition — every table accounted for > no public base table lacks both a company_id and a disposition
AssertionError: these tables now have company_id but are still declared without it: expected [ 'UNASSIGNED:loads' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "UNASSIGNED:loads",
+ ]

 ❯ src/test/tenancy-resolver.test.ts:1954:89
 Test Files  1 failed (1)
      Tests  1 failed | 114 skipped (115)
```

Both mutations reverted. Green again:

```
 ✓ src/test/tenancy-resolver.test.ts (115 tests | 114 skipped) 1118ms
   ✓ tenancy disposition — every table accounted for > no public base table lacks both a company_id and a disposition  1114ms
 Test Files  1 passed (1)
      Tests  1 passed | 114 skipped (115)
```

**Byte-identical to HEAD, proven two ways:**

```
$ git show HEAD:src/test/tenancy-resolver.test.ts > /tmp/head.ts
$ diff /tmp/head.ts src/test/tenancy-resolver.test.ts && echo "BYTE-IDENTICAL-TO-HEAD"
BYTE-IDENTICAL-TO-HEAD
$ md5sum /tmp/head.ts src/test/tenancy-resolver.test.ts
2247a0f826f9be51c3e5a973acf59a1f  /tmp/head.ts
2247a0f826f9be51c3e5a973acf59a1f  src/test/tenancy-resolver.test.ts
$ git diff --stat -- src/test/tenancy-resolver.test.ts
$            # empty
```

(`git diff --stat` was observed once reporting a stale `1 file changed` immediately after a
revert while `git diff` itself printed nothing; the md5/`diff` comparison against
`HEAD:` is the authoritative proof and both agree, and a later `--stat` after a two-second
pause was empty. Recorded rather than smoothed over.)

### Full file, quoted exactly, not labelled

```
 Test Files  1 passed (1)
      Tests  115 passed (115)
     Errors  1 error
   Duration  359.02s (transform 424ms, setup 91ms, collect 134ms, tests 356.97s, environment 519ms, prepare 259ms)
```

```
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 ❯ Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10
 ❯ Timeout._onTimeout node_modules/vitest/dist/chunks/index.B521nVV-.js:59:62
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7
```

Per Vitest's own words this "might cause false positive tests," so the 115 passes are not
being presented as a wholly clean run. The same error appeared in the 2026-09-16 1138 pass.
It is not diagnosed and is not being named as harmless.

---

## Files changed by this pass

- `docs/tms-build-status.md` — the owner's disposition decision, the reconciled arithmetic,
  and the read-enforcement census.
- `docs/passes/2026-09-16-1840-read-enforcement-census.md` — this report.
- `src/test/tenancy-resolver.test.ts` — temporarily mutated twice for Step 3, **restored
  byte-identical to HEAD**. Not part of the commit.

No migration ran. No function, no application code, no data changed. Carrier count: 1.

---

## Appendix A — all 436 policies on the 148 `company_id` tables, verbatim

Format: `table | policy | cmd | permissive | roles | class | USING … | CHECK …`

```
accessorial_adjustments | dispatcher management owner read within company | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
active_dispatch | Dispatchers can insert dispatch | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role))
active_dispatch | Dispatchers can update dispatch | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
active_dispatch | Operators can view their own dispatch | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = active_dispatch.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
active_dispatch | Staff can view all dispatch | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
active_dispatch | Truck owner can view linked dispatch | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
ar_aging_snapshots | ar_aging_snapshots management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
binder_share_bundles | Authenticated users can create bundles | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (created_by = auth.uid())
binder_share_bundles | Creators can view their own bundles | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (created_by = auth.uid()) | CHECK -
blank_log_acknowledgments | blank_log_ack_select_own_or_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = blank_log_acknowledgments.operator_id) AND (o.user_id = auth.uid()))))) | CHECK -
blank_log_acknowledgments | blank_log_ack_update_own | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = blank_log_acknowledgments.operator_id) AND (o.user_id = auth.uid())))) | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = blank_log_acknowledgments.operator_id) AND (o.user_id = auth.uid()))))
blank_log_acknowledgments | blank_log_ack_write_own | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = blank_log_acknowledgments.operator_id) AND (o.user_id = auth.uid()))))
broker_contacts | broker_contacts_mgmt_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
broker_contacts | broker_contacts_staff_delete | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
broker_contacts | broker_contacts_staff_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
broker_contacts | broker_contacts_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
broker_contacts | broker_contacts_staff_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
broker_do_not_load_history | broker_dnl_history_mgmt_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
broker_do_not_load_history | broker_dnl_history_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
broker_documents | broker_documents_mgmt_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
broker_documents | broker_documents_staff_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
broker_documents | broker_documents_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
broker_documents | broker_documents_staff_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
broker_factoring_history | broker_factoring_history_mgmt_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
broker_factoring_history | broker_factoring_history_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
broker_notes | broker_notes_author_delete | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) AND (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) | CHECK -
broker_notes | broker_notes_author_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) AND (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) | CHECK ((has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) AND (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)))
broker_notes | broker_notes_mgmt_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
broker_notes | broker_notes_staff_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
broker_notes | broker_notes_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
brokers | brokers_mgmt_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
brokers | brokers_staff_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
brokers | brokers_staff_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
brokers | brokers_staff_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
carrier_notification_settings | carrier_notification_settings_manage_management | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
carrier_notification_settings | carrier_notification_settings_select_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
carrier_signature_settings | Management can delete carrier signature settings | DELETE | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
carrier_signature_settings | Management can insert carrier signature settings | INSERT | PERMISSIVE | {authenticated} | COMPANY | USING - | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
carrier_signature_settings | Management can update carrier signature settings | UPDATE | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
carrier_signature_settings | Staff can view carrier signature settings | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND is_staff(auth.uid())) | CHECK -
cash_advances | Management manages cash advances | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
cert_reminders | Staff can insert cert reminders | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
cert_reminders | Staff can update cert reminders | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
cert_reminders | Staff can view cert reminders | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
claim_flag_history | Staff can view claim flag history | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
claim_flags | claim_flags_onboarding_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
claim_flags | claim_flags_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
company_documents | company_documents_delete_mgmt | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
company_documents | company_documents_insert_mgmt | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
company_documents | company_documents_select_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
company_documents | company_documents_update_mgmt | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
company_members | company_members read own row | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
company_settings | Management can update company settings | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
company_settings | Staff can read company settings | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
contractor_pay_setup | Operators can insert their own pay setup | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = contractor_pay_setup.operator_id) AND (operators.user_id = auth.uid()))))
contractor_pay_setup | Operators can update their own pay setup | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = contractor_pay_setup.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
contractor_pay_setup | Operators can view their own pay setup | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = contractor_pay_setup.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
contractor_pay_setup | Staff can update pay setup records | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
contractor_pay_setup | Staff can view all pay setup records | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
contractor_pay_setup | Truck owner can view linked pay setup | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
deduction_installments | Management manages deduction installments | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
deductions | Management manages deductions | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
detention_claims | Dispatch staff raise detention claims | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
detention_claims | Dispatch staff read detention claims | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
detention_claims | Dispatch staff update detention claims | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_daily_log | Operators can view their own dispatch daily logs | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = dispatch_daily_log.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
dispatch_daily_log | Staff can delete dispatch daily logs | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
dispatch_daily_log | Staff can insert dispatch daily logs | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
dispatch_daily_log | Staff can update dispatch daily logs | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
dispatch_daily_log | Staff can view all dispatch daily logs | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
dispatch_daily_log | Truck owner can view linked daily log | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
dispatch_deductions | Management manages dispatch deductions | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlement_charge_verdicts | Management manages dispatch charge verdicts | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlement_line_items | Management manages dispatch settlement line items | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlement_load_contributions | Management manages dispatch settlement contributions | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlement_rates | Management manages dispatch settlement rates | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlement_rates_history | Management reads dispatch rate history | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
dispatch_settlement_rates_history | Management writes dispatch rate history | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_settlements | Management manages dispatch settlements | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
dispatch_status_history | Operators can view their own dispatch history | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = dispatch_status_history.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
dispatch_status_history | Staff can insert dispatch history | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
dispatch_status_history | Staff can view dispatch history | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
document_acknowledgments | Staff can view all acknowledgments | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
document_acknowledgments | Users can insert own acknowledgments | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
document_acknowledgments | Users can view own acknowledgments | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
document_exceptions | document_exceptions_onboarding_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
document_exceptions | document_exceptions_operator_insert_own | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = document_exceptions.load_id) AND (o.user_id = auth.uid()))))
document_exceptions | document_exceptions_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = document_exceptions.load_id) AND (o.user_id = auth.uid())))) | CHECK -
document_exceptions | document_exceptions_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
document_send_log | document_send_log_delete_mgmt | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
document_send_log | document_send_log_insert_staff | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
document_send_log | document_send_log_select_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
document_send_log | document_send_log_update_mgmt | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
document_version_history | Staff can insert version history | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
document_version_history | Staff can view version history | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
documents | Operators can upload their own documents | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = documents.operator_id) AND (operators.user_id = auth.uid()))))
documents | Operators can view their own documents | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = documents.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
documents | Staff can update documents | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
documents | Staff can view all documents | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
dot_consultant_email_settings | Staff can read dot consultant email settings | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
dot_consultant_email_settings | Staff can update dot consultant email settings | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
driver_staff_contact_suppressions | dscs_admin_delete | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
driver_staff_contact_suppressions | dscs_admin_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
driver_staff_contact_suppressions | dscs_admin_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
driver_staff_contact_suppressions | dscs_driver_select_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (driver_id = auth.uid()) | CHECK -
driver_staff_contact_suppressions | dscs_staff_delete_self | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (staff_id = auth.uid()) | CHECK -
driver_staff_contact_suppressions | dscs_staff_insert_self | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (staff_id = auth.uid())
driver_staff_contact_suppressions | dscs_staff_select_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (staff_id = auth.uid()) | CHECK -
driver_staff_contacts | dsc_admin_delete | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
driver_staff_contacts | dsc_admin_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
driver_staff_contacts | dsc_admin_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
driver_staff_contacts | dsc_driver_select_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (driver_id = auth.uid()) | CHECK -
driver_staff_contacts | dsc_staff_delete_self | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (staff_id = auth.uid()) | CHECK -
driver_staff_contacts | dsc_staff_insert_self | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (staff_id = auth.uid())
driver_staff_contacts | dsc_staff_select_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (staff_id = auth.uid()) | CHECK -
driver_uploads | Drivers can insert own uploads | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = driver_id)
driver_uploads | Drivers can view own uploads | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = driver_id) | CHECK -
driver_uploads | Staff can manage driver uploads | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
driver_vault_documents | Operators can view their own vault documents | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = driver_vault_documents.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
driver_vault_documents | Staff can manage vault documents | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
driver_vault_documents | Truck owner can view linked vault | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
eld_devices | eld_devices_manage_management | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
eld_devices | eld_devices_select_own_or_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_devices.operator_id) AND (o.user_id = auth.uid()))))) | CHECK -
eld_extension_requests | eld_extension_requests_insert_management | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
eld_extension_requests | eld_extension_requests_select_staff_or_own | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR ((status <> 'draft'::text) AND (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_extension_requests.operator_id) AND (o.user_id = auth.uid())))))) | CHECK -
eld_extension_requests | eld_extension_requests_update_management | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
eld_malfunction_events | eld_events_insert_own | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_malfunction_events.operator_id) AND (o.user_id = auth.uid()))))
eld_malfunction_events | eld_events_select_own_or_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_malfunction_events.operator_id) AND (o.user_id = auth.uid()))))) | CHECK -
eld_malfunction_events | eld_events_staff_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
eld_malfunction_events | eld_events_update_own_notes | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_malfunction_events.operator_id) AND (o.user_id = auth.uid())))) | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = eld_malfunction_events.operator_id) AND (o.user_id = auth.uid()))))
eld_malfunction_notifications | eld_notifications_select_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR (recipient_user_id = auth.uid())) | CHECK -
eld_sync_alerts | Staff can acknowledge eld sync alerts | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
eld_sync_alerts | Staff can view eld sync alerts | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_assignments | Management can delete equipment assignments | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK -
equipment_assignments | Staff can insert equipment assignments | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
equipment_assignments | Staff can update equipment assignments | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_assignments | Staff can view equipment assignments | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_assignments | Truck owner can view linked equipment | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
equipment_items | Management can delete equipment items | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK -
equipment_items | Staff can insert equipment items | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
equipment_items | Staff can update equipment items | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_items | Staff can view equipment items | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_receipts | Driver inserts own equipment receipts | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK ((uploader_role = 'driver'::text) AND (uploaded_by = auth.uid()) AND (direction = 'return'::text) AND (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = equipment_receipts.operator_id) AND (o.user_id = auth.uid())))) AND (operator_awaiting_return(operator_id) OR operator_return_requested(operator_id)))
equipment_receipts | Driver reads own equipment receipts | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = equipment_receipts.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
equipment_receipts | Staff deletes equipment receipts | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
equipment_receipts | Staff inserts equipment receipts | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK ((uploader_role = 'management'::text) AND (uploaded_by = auth.uid()) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)))
equipment_receipts | Staff reads all equipment receipts | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK -
equipment_receipts | Staff updates equipment receipts | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
equipment_serial_conflict_dismissals | Staff can create conflict dismissals | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
equipment_serial_conflict_dismissals | Staff can delete conflict dismissals | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
equipment_serial_conflict_dismissals | Staff can view conflict dismissals | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
facilities | facilities_delete_management | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
facilities | facilities_insert_staff | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
facilities | facilities_select_staff_and_operators | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'operator'::app_role)) | CHECK -
facilities | facilities_update_staff | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
factoring_remittances | factoring_remittances management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
fleet_settings | Management can insert fleet settings | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
fleet_settings | Management can update fleet settings | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
fleet_settings | Staff can view fleet settings | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
forecast_deductions | Operators delete own forecast deductions | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_deductions.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_deductions | Operators insert own forecast deductions | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_deductions.operator_id) AND (o.user_id = auth.uid()))))
forecast_deductions | Operators update own forecast deductions | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_deductions.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_deductions | Operators view own forecast deductions | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING ((EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_deductions.operator_id) AND (o.user_id = auth.uid())))) OR is_staff(auth.uid())) | CHECK -
forecast_expenses | Operators delete own forecast expenses | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_expenses.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_expenses | Operators insert own forecast expenses | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_expenses.operator_id) AND (o.user_id = auth.uid()))))
forecast_expenses | Operators update own forecast expenses | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_expenses.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_expenses | Operators view own forecast expenses | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING ((EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_expenses.operator_id) AND (o.user_id = auth.uid())))) OR is_staff(auth.uid())) | CHECK -
forecast_loads | Operators delete own forecast loads | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_loads.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_loads | Operators insert own forecast loads | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_loads.operator_id) AND (o.user_id = auth.uid()))))
forecast_loads | Operators update own forecast loads | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_loads.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
forecast_loads | Operators view own forecast loads | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING ((EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = forecast_loads.operator_id) AND (o.user_id = auth.uid())))) OR is_staff(auth.uid())) | CHECK -
ica_amendment_units | Operators can view their own amendment units | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (ica_amendments a
     JOIN operators o ON ((o.id = a.operator_id)))
  WHERE ((a.id = ica_amendment_units.amendment_id) AND (o.user_id = auth.uid())))) | CHECK -
ica_amendment_units | Staff can manage amendment units | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
ica_amendment_units | Staff can view all amendment units | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_amendments | Operators can sign their own amendment | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING ((EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = ica_amendments.operator_id) AND (o.user_id = auth.uid())))) AND (status = ANY (ARRAY['sent_to_operator'::text, 'operator_signed'::text]))) | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = ica_amendments.operator_id) AND (o.user_id = auth.uid()))))
ica_amendments | Operators can view their own amendments | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = ica_amendments.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
ica_amendments | Staff can delete draft amendments | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) AND (status = 'draft'::text)) | CHECK -
ica_amendments | Staff can insert amendments | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
ica_amendments | Staff can update amendments | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
ica_amendments | Staff can view all amendments | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_contracts | Operators can sign their own ICA contracts | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = ica_contracts.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
ica_contracts | Operators can view their own ICA contracts | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = ica_contracts.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
ica_contracts | Staff can delete ICA contracts | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_contracts | Staff can insert ICA contracts | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
ica_contracts | Staff can update ICA contracts | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_contracts | Staff can view all ICA contracts | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_contracts | Truck owner can sign linked ICA | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK is_truck_owner_for_operator(auth.uid(), operator_id)
ica_contracts | Truck owner can view linked ICA | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
ica_driver_acknowledgments | Driver can insert own ack | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK ((driver_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (ica_contracts c
     JOIN operators o ON ((o.id = c.operator_id)))
  WHERE ((c.id = ica_driver_acknowledgments.contract_id) AND (o.user_id = auth.uid()) AND (c.status = 'fully_executed'::text)))))
ica_driver_acknowledgments | Driver can view own ack | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (driver_user_id = auth.uid()) | CHECK -
ica_driver_acknowledgments | Staff can view all driver ack | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
ica_driver_acknowledgments | Truck owner can view linked ack | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (ica_contracts c
     JOIN truck_owners t ON ((t.operator_id = c.operator_id)))
  WHERE ((c.id = ica_driver_acknowledgments.contract_id) AND (t.user_id = auth.uid())))) | CHECK -
ica_review_links | Creator or management can revoke ICA review links | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK ((created_by = auth.uid()) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
ica_review_links | Staff can create ICA review links | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (is_staff(auth.uid()) AND (created_by = auth.uid()))
ica_review_links | Staff can view ICA review links | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
inspection_binder_order | Authenticated users can read binder order | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() IS NOT NULL) | CHECK -
inspection_binder_order | Staff can manage binder order | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
inspection_cycles | operators read own inspection cycles | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = inspection_cycles.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
inspection_cycles | staff manage inspection cycles | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
inspection_document_versions | Operators can view their own document versions | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM inspection_documents d
  WHERE ((d.id = inspection_document_versions.document_id) AND ((d.scope = 'company_wide'::inspection_doc_scope) OR ((d.scope = 'per_driver'::inspection_doc_scope) AND (d.driver_id = auth.uid())))))) | CHECK -
inspection_document_versions | Staff can manage inspection document versions | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
inspection_documents | Operators can insert own per-driver inspection docs | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK ((scope = 'per_driver'::inspection_doc_scope) AND (driver_id = auth.uid()) AND (uploaded_by = auth.uid()) AND (shared_with_fleet IS NOT TRUE))
inspection_documents | Operators can view their inspection docs | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING ((auth.uid() IS NOT NULL) AND ((scope = 'company_wide'::inspection_doc_scope) OR ((scope = 'per_driver'::inspection_doc_scope) AND (driver_id = auth.uid())))) | CHECK -
inspection_documents | Staff can manage inspection documents | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
inspection_program_payments | operators read own inspection payments | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = inspection_program_payments.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
inspection_program_payments | staff manage inspection payments | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
inspection_program_settings | management writes program settings | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
inspection_program_settings | staff read program settings | SELECT | PERMISSIVE | {authenticated} | OTHER | USING true | CHECK -
insurance_email_settings | Staff can read insurance email settings | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
insurance_email_settings | Staff can update insurance email settings | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
invoice_batches | invoice_batches management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
invoice_line_items | invoice_line_items management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
invoice_number_config | Management and owner read invoice numbering | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
invoices | invoices management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
lease_terminations | Operators view own terminations | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = lease_terminations.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
lease_terminations | Staff manage lease terminations | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
load_change_history | load_change_history_staff_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
load_charges | load_charges_onboarding_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
load_charges | load_charges_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_charges.load_id) AND (o.user_id = auth.uid())))) | CHECK -
load_charges | load_charges_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
load_documents | load_documents_onboarding_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
load_documents | load_documents_operator_insert_own | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_documents.load_id) AND (o.user_id = auth.uid()))))
load_documents | load_documents_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_documents.load_id) AND (o.user_id = auth.uid())))) | CHECK -
load_documents | load_documents_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
load_number_config | load_number_config_select_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK -
load_number_config | load_number_config_update_management | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
load_reference_citations | Dispatch staff manage reference citations | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
load_reference_citations | Operators read citations on their own loads | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (load_references r
     JOIN loads l ON ((l.id = r.load_id)))
  WHERE ((r.id = load_reference_citations.reference_id) AND (l.operator_id IN ( SELECT o.id
           FROM operators o
          WHERE (o.user_id = auth.uid())))))) | CHECK -
load_references | Dispatch staff manage load references | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
load_references | Operators read references on their own loads | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM loads l
  WHERE ((l.id = load_references.load_id) AND (l.operator_id IN ( SELECT o.id
           FROM operators o
          WHERE (o.user_id = auth.uid())))))) | CHECK -
load_status_history | load_status_history_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_status_history.load_id) AND (o.user_id = auth.uid())))) | CHECK -
load_status_history | load_status_history_staff_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
load_stops | load_stops_onboarding_staff_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
load_stops | load_stops_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_stops.load_id) AND (o.user_id = auth.uid())))) | CHECK -
load_stops | load_stops_operator_update_own | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_stops.load_id) AND (o.user_id = auth.uid())))) | CHECK (EXISTS ( SELECT 1
   FROM (loads l
     JOIN operators o ON ((o.id = l.operator_id)))
  WHERE ((l.id = load_stops.load_id) AND (o.user_id = auth.uid()))))
load_stops | load_stops_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
loads | loads_onboarding_staff_read | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING has_role(auth.uid(), 'onboarding_staff'::app_role) | CHECK -
loads | loads_operator_read_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = loads.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
loads | loads_operator_update_own | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = loads.operator_id) AND (o.user_id = auth.uid())))) | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = loads.operator_id) AND (o.user_id = auth.uid()))))
loads | loads_staff_manage | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
message_reactions | Add own reactions | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.id = message_reactions.message_id) AND ((auth.uid() = m.sender_id) OR (auth.uid() = m.recipient_id))))))
message_reactions | Remove own reactions | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
message_reactions | View reactions on visible messages | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.id = message_reactions.message_id) AND ((auth.uid() = m.sender_id) OR (auth.uid() = m.recipient_id))))) | CHECK -
message_threads | mt_admin_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
message_threads | mt_authenticated_insert | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (created_by = auth.uid())
message_threads | mt_participant_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_thread_participant(id, auth.uid()) | CHECK -
message_threads | mt_participant_update | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_thread_participant(id, auth.uid()) | CHECK -
messages | Group participants can send messages | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK ((auth.uid() = sender_id) AND (thread_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM message_threads mt
  WHERE ((mt.id = messages.thread_id) AND (mt.is_group = true)))) AND is_thread_participant(thread_id, auth.uid()))
messages | Group participants can view messages | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING ((thread_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM message_threads mt
  WHERE ((mt.id = messages.thread_id) AND (mt.is_group = true)))) AND is_thread_participant(thread_id, auth.uid())) | CHECK -
messages | Recipient can mark as read | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = recipient_id) | CHECK (auth.uid() = recipient_id)
messages | Sender can edit or delete own messages | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = sender_id) | CHECK (auth.uid() = sender_id)
messages | Staff can pin messages | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
messages | Users can send messages | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = sender_id)
messages | Users can view their own messages | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING ((auth.uid() = sender_id) OR (auth.uid() = recipient_id)) | CHECK -
mo_plate_assignments | Management can delete mo_plate_assignments | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK -
mo_plate_assignments | Staff can insert mo_plate_assignments | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
mo_plate_assignments | Staff can update mo_plate_assignments | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
mo_plate_assignments | Staff can view mo_plate_assignments | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
mo_plates | Management can delete mo_plates | DELETE | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK -
mo_plates | Staff can insert mo_plates | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
mo_plates | Staff can update mo_plates | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
mo_plates | Staff can view mo_plates | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
notification_preferences | Users can delete own notification preferences | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
notification_preferences | Users can insert own notification preferences | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
notification_preferences | Users can update own notification preferences | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
notification_preferences | Users can view own notification preferences | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
notification_role_defaults | Owner and management manage role defaults | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
notification_role_defaults | Staff can view role defaults | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
notifications | Assignee can update notification triage | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (assigned_to = auth.uid()) | CHECK ((assigned_to = auth.uid()) OR (user_id = auth.uid()))
notifications | Assignees can view notifications assigned to them | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (assigned_to = auth.uid()) | CHECK -
notifications | Staff can insert notifications | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
notifications | Users can mark own notifications read | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
notifications | Users can view their own notifications | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
officer_packet_links | Drivers can view their own officer packet links | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = officer_packet_links.operator_id) AND (o.user_id = auth.uid())))) OR is_staff(auth.uid())) | CHECK -
onboard_assignment_sheet_items | osas_items_operator_confirm | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (onboard_assignment_sheets s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE ((s.id = onboard_assignment_sheet_items.sheet_id) AND (o.user_id = auth.uid()) AND (s.status = 'sent'::osas_status)))) | CHECK (EXISTS ( SELECT 1
   FROM (onboard_assignment_sheets s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE ((s.id = onboard_assignment_sheet_items.sheet_id) AND (o.user_id = auth.uid()))))
onboard_assignment_sheet_items | osas_items_operator_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM (onboard_assignment_sheets s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE ((s.id = onboard_assignment_sheet_items.sheet_id) AND (o.user_id = auth.uid())))) | CHECK -
onboard_assignment_sheet_items | osas_items_staff_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
onboard_assignment_sheets | osas_operator_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = onboard_assignment_sheets.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
onboard_assignment_sheets | osas_operator_sign | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING ((status = ANY (ARRAY['sent'::osas_status, 'signed'::osas_status])) AND (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = onboard_assignment_sheets.operator_id) AND (o.user_id = auth.uid()))))) | CHECK ((status = ANY (ARRAY['sent'::osas_status, 'signed'::osas_status])) AND (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = onboard_assignment_sheets.operator_id) AND (o.user_id = auth.uid())))))
onboard_assignment_sheets | osas_staff_all | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
onboarding_status | Operators can update their own decal photos | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = onboarding_status.operator_id) AND (operators.user_id = auth.uid())))) | CHECK (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = onboarding_status.operator_id) AND (operators.user_id = auth.uid()))))
onboarding_status | Operators can view their own status | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = onboarding_status.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
onboarding_status | Staff can insert onboarding status | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
onboarding_status | Staff can update onboarding status | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
onboarding_status | Staff can view all onboarding status | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
onboarding_status | Truck owner can update linked onboarding decals | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK is_truck_owner_for_operator(auth.uid(), operator_id)
onboarding_status | Truck owner can view linked onboarding | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
operator_broadcast_recipients | Mgmt can insert broadcast recipients | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
operator_broadcast_recipients | Mgmt can update broadcast recipients | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_broadcast_recipients | Mgmt can view broadcast recipients | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
operator_broadcast_recipients | Operators can mark own broadcast read or acknowledged | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (operator_id IN ( SELECT operators.id
   FROM operators
  WHERE (operators.user_id = auth.uid()))) | CHECK (operator_id IN ( SELECT operators.id
   FROM operators
  WHERE (operators.user_id = auth.uid())))
operator_broadcast_recipients | Operators can view own broadcast recipient rows | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (operator_id IN ( SELECT operators.id
   FROM operators
  WHERE (operators.user_id = auth.uid()))) | CHECK -
operator_documents | Operators can insert their own documents | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = operator_documents.operator_id) AND (operators.user_id = auth.uid()))))
operator_documents | Operators can view their own live operator docs | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING ((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = operator_documents.operator_id) AND (o.user_id = auth.uid()))))) | CHECK -
operator_documents | Staff can manage operator docs | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
operator_documents | Staff can view all operator docs | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
operator_documents | Truck owner can insert linked operator docs | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK is_truck_owner_for_operator(auth.uid(), operator_id)
operator_documents | Truck owner can view linked operator docs | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING ((deleted_at IS NULL) AND is_truck_owner_for_operator(auth.uid(), operator_id)) | CHECK -
operator_offboarding_steps | Service role can manage all offboarding steps | ALL | PERMISSIVE | {service_role} | SERVICE | USING true | CHECK true
operator_offboarding_steps | Staff can manage offboarding steps for operators | ALL | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = operator_offboarding_steps.operator_id) AND ((o.assigned_onboarding_staff = auth.uid()) OR (o.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['management'::app_role, 'owner'::app_role, 'onboarding_staff'::app_role]))))))))) | CHECK (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = operator_offboarding_steps.operator_id) AND ((o.assigned_onboarding_staff = auth.uid()) OR (EXISTS ( SELECT 1
           FROM user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['management'::app_role, 'owner'::app_role, 'onboarding_staff'::app_role])))))))))
operators | Management can deactivate operators | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK has_role(auth.uid(), 'management'::app_role)
operators | Operators can view their own record | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
operators | Staff can insert operators | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
operators | Staff can update operators | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
operators | Staff can view all operators | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
operators | Truck owner can view linked operator | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), id) | CHECK -
owner_transfers | Management can view owner transfers | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
owner_transfers | Parties can view their own owner transfers | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING ((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)) | CHECK -
pandadoc_documents | Operators can view their own pandadoc docs | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = pandadoc_documents.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
pandadoc_documents | Staff can insert pandadoc docs | INSERT | PERMISSIVE | {public} | ROLE-ONLY | USING - | CHECK is_staff(auth.uid())
pandadoc_documents | Staff can update pandadoc docs | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
pandadoc_documents | Staff can view all pandadoc docs | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
parser_diagnostics | Dispatch staff read parser diagnostics | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
parser_diagnostics | Dispatch staff resolve parser diagnostics | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
passenger_authorizations | Driver reads own passenger authorizations | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (operator_id IN ( SELECT operators.id
   FROM operators
  WHERE (operators.user_id = auth.uid()))) | CHECK -
passenger_authorizations | Staff manage passenger authorizations | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
pay_policies | pay_policies_delete_management | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
pay_policies | pay_policies_insert_management | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
pay_policies | pay_policies_read_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
pay_policies | pay_policies_update_management | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
pay_policy_assignments | pay_policy_assignments_delete_management | DELETE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
pay_policy_assignments | pay_policy_assignments_insert_management | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
pay_policy_assignments | pay_policy_assignments_read_staff | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = pay_policy_assignments.operator_id) AND (o.user_id = auth.uid()))))) | CHECK -
pay_policy_assignments | pay_policy_assignments_update_management | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
payments | payments management and owner only | ALL | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
pei_cadence_settings | staff read pei cadence settings | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
preview_sessions | No client access to preview sessions | ALL | PERMISSIVE | {public} | OTHER | USING false | CHECK false
rate_con_ingest_queue | Dispatch staff read ingest queue | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
rate_con_ingest_queue | Dispatch staff update ingest queue | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
rm_deposit_transactions | Management manages rm deposit transactions | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
rm_deposits | Management manages rm deposits | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
roadside_stop_documents | Roadside documents follow the stop | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (EXISTS ( SELECT 1
   FROM roadside_stops s
  WHERE ((s.id = roadside_stop_documents.stop_id) AND (is_staff(auth.uid()) OR is_own_operator(s.operator_id))))) | CHECK (EXISTS ( SELECT 1
   FROM roadside_stops s
  WHERE ((s.id = roadside_stop_documents.stop_id) AND (is_staff(auth.uid()) OR is_own_operator(s.operator_id)))))
roadside_stop_violations | Roadside violations follow the stop | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (EXISTS ( SELECT 1
   FROM roadside_stops s
  WHERE ((s.id = roadside_stop_violations.stop_id) AND (is_staff(auth.uid()) OR is_own_operator(s.operator_id))))) | CHECK (EXISTS ( SELECT 1
   FROM roadside_stops s
  WHERE ((s.id = roadside_stop_violations.stop_id) AND (is_staff(auth.uid()) OR is_own_operator(s.operator_id)))))
roadside_stops | Operators correct their recent roadside stops | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (is_own_operator(operator_id) AND (created_by = auth.uid()) AND (created_at > (now() - '24:00:00'::interval))) | CHECK is_own_operator(operator_id)
roadside_stops | Operators log their own roadside stops | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (is_own_operator(operator_id) AND (created_by = auth.uid()))
roadside_stops | Operators view their own roadside stops | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_operator(operator_id) | CHECK -
roadside_stops | Staff manage roadside stops | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
rods_amendments | Drivers read own rods amendments | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_rods_operator(operator_id) | CHECK -
rods_amendments | Staff read all rods amendments | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
rods_correction_requests | Drivers read own correction requests | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_rods_operator(operator_id) | CHECK -
rods_correction_requests | Drivers respond to own correction requests | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_rods_operator(operator_id) | CHECK is_own_rods_operator(operator_id)
rods_correction_requests | Staff raise correction requests | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (is_staff(auth.uid()) AND (requested_by = auth.uid()))
rods_correction_requests | Staff read all correction requests | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
rods_days | Drivers delete own unlocked rods days | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (is_own_rods_operator(operator_id) AND (locked = false)) | CHECK -
rods_days | Drivers insert own rods days | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (is_own_rods_operator(operator_id) AND (locked = false))
rods_days | Drivers read own rods days | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_rods_operator(operator_id) | CHECK -
rods_days | Drivers update own unlocked rods days | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (is_own_rods_operator(operator_id) AND (locked = false)) | CHECK is_own_rods_operator(operator_id)
rods_days | Staff read all rods days | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
rods_divergences | Drivers read their own divergences | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_own_rods_operator(operator_id) | CHECK -
rods_divergences | Staff read all divergences | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
rods_events | Drivers delete own unlocked rods events | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM rods_days d
  WHERE ((d.id = rods_events.rods_day_id) AND is_own_rods_operator(d.operator_id) AND (d.locked = false)))) | CHECK -
rods_events | Drivers read own rods events | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM rods_days d
  WHERE ((d.id = rods_events.rods_day_id) AND is_own_rods_operator(d.operator_id)))) | CHECK -
rods_events | Drivers update own unlocked rods events | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM rods_days d
  WHERE ((d.id = rods_events.rods_day_id) AND is_own_rods_operator(d.operator_id) AND (d.locked = false)))) | CHECK (EXISTS ( SELECT 1
   FROM rods_days d
  WHERE ((d.id = rods_events.rods_day_id) AND is_own_rods_operator(d.operator_id) AND (d.locked = false))))
rods_events | Drivers write own unlocked rods events | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (EXISTS ( SELECT 1
   FROM rods_days d
  WHERE ((d.id = rods_events.rods_day_id) AND is_own_rods_operator(d.operator_id) AND (d.locked = false))))
rods_events | Staff read all rods events | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
rods_unlock_events | Drivers read their own unlocks | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING COALESCE(is_own_rods_operator(operator_id), false) | CHECK -
rods_unlock_events | Drivers record their own unlocks | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK COALESCE(is_own_rods_operator(operator_id), false)
rods_unlock_events | Management reads all unlocks | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (COALESCE(has_role(auth.uid(), 'management'::app_role), false) OR COALESCE(has_role(auth.uid(), 'owner'::app_role), false)) | CHECK -
service_help_requests | Staff can update help request status | UPDATE | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
service_help_requests | Staff can view all help requests | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
service_help_requests | Users can insert own help requests | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
service_help_requests | Users can view own help requests | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_bookmarks | Staff can view all bookmarks | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
service_resource_bookmarks | Users can delete own bookmarks | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_bookmarks | Users can insert own bookmarks | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
service_resource_bookmarks | Users can view own bookmarks | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_completions | Staff can view all completions | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
service_resource_completions | Users can delete own completions | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_completions | Users can insert own completions | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
service_resource_completions | Users can view own completions | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_views | Staff can view all resource views | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK -
service_resource_views | Users can delete own views | DELETE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_views | Users can insert own views | INSERT | PERMISSIVE | {public} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
service_resource_views | Users can update own views | UPDATE | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
service_resource_views | Users can view own views | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
settlement_line_items | Management manages settlement line items | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
settlement_line_items | Operators read their own settlement line items | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (settlement_id IN ( SELECT s.id
   FROM (settlements s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE (o.user_id = auth.uid()))) | CHECK -
settlement_settings | Management can create settlement settings | INSERT | PERMISSIVE | {authenticated} | COMPANY | USING - | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
settlement_settings | Management can update settlement settings | UPDATE | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
settlement_settings | Staff can read settlement settings | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
settlement_settings_history | Management can read settlement settings history | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK -
settlement_withheld_loads | Management manages settlement withheld loads | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
settlement_withheld_loads | Operators read their own withheld loads | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (settlement_id IN ( SELECT s.id
   FROM (settlements s
     JOIN operators o ON ((o.id = s.operator_id)))
  WHERE (o.user_id = auth.uid()))) | CHECK -
settlements | Management manages settlements | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
settlements | Operators read their own settlements | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (operator_id IN ( SELECT o.id
   FROM operators o
  WHERE (o.user_id = auth.uid()))) | CHECK -
share_tokens | Management can update share tokens | UPDATE | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
share_tokens | Staff can create share tokens | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
share_tokens | Staff can view share tokens | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))) | CHECK -
staff_email_overrides | Staff manage own or admins manage all overrides | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
staff_email_overrides | Staff view own or admins view all overrides | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
staff_help_messages | staff_help_messages_own_delete | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
staff_help_messages | staff_help_messages_own_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK ((user_id = auth.uid()) AND is_staff(auth.uid()))
staff_help_messages | staff_help_messages_own_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
staff_help_threads | staff_help_threads_own_delete | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
staff_help_threads | staff_help_threads_own_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK ((user_id = auth.uid()) AND is_staff(auth.uid()))
staff_help_threads | staff_help_threads_own_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING ((user_id = auth.uid()) AND is_staff(auth.uid())) | CHECK -
staff_help_threads | staff_help_threads_own_update | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK (user_id = auth.uid())
staff_messaging_settings | sms_admin_insert | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
staff_messaging_settings | sms_admin_update | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role))
staff_messaging_settings | sms_read_staff_or_self | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (is_staff(auth.uid()) OR (staff_id = auth.uid())) | CHECK -
staff_messaging_settings | sms_self_insert | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (staff_id = auth.uid())
staff_messaging_settings | sms_self_update | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (staff_id = auth.uid()) | CHECK (staff_id = auth.uid())
staff_ui_preferences | Users can delete their own UI preferences | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
staff_ui_preferences | Users can insert their own UI preferences | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (auth.uid() = user_id)
staff_ui_preferences | Users can update their own UI preferences | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK (auth.uid() = user_id)
staff_ui_preferences | Users can view their own UI preferences | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
thread_participants | tp_admin_select | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'management'::app_role)) | CHECK -
thread_participants | tp_participant_insert | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (is_thread_participant(thread_id, auth.uid()) OR (EXISTS ( SELECT 1
   FROM message_threads mt
  WHERE ((mt.id = thread_participants.thread_id) AND (mt.created_by = auth.uid())))))
thread_participants | tp_participant_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING is_thread_participant(thread_id, auth.uid()) | CHECK -
thread_participants | tp_self_select | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
thread_participants | tp_self_update | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK (user_id = auth.uid())
truck_dot_inspections | Operators can view own DOT inspections | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = truck_dot_inspections.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
truck_dot_inspections | Staff can manage DOT inspections | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
truck_dot_inspections | Truck owner can view linked DOT inspections | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
truck_maintenance_records | Operators can view own maintenance records | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators
  WHERE ((operators.id = truck_maintenance_records.operator_id) AND (operators.user_id = auth.uid())))) | CHECK -
truck_maintenance_records | Staff can manage maintenance records | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
truck_maintenance_records | Truck owner can view linked maintenance | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING is_truck_owner_for_operator(auth.uid(), operator_id) | CHECK -
truck_owners | Drivers can view their truck owner | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = truck_owners.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
truck_owners | Staff can manage truck owners | ALL | PERMISSIVE | {public} | ROLE-ONLY | USING is_staff(auth.uid()) | CHECK is_staff(auth.uid())
truck_owners | Truck owners can view own record | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
truck_plate_history | Staff can view plate history | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK -
truck_state_permits | Drivers can view their own truck state permits | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (EXISTS ( SELECT 1
   FROM operators o
  WHERE ((o.id = truck_state_permits.operator_id) AND (o.user_id = auth.uid())))) | CHECK -
truck_state_permits | Staff can manage truck state permits | ALL | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
truck_state_permits | Staff can view truck state permits | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK -
unit_number_config | Management changes unit number config | UPDATE | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role)))
unit_number_config | Onboarding staff and management read unit number config | SELECT | PERMISSIVE | {authenticated} | COMPANY | USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role))) | CHECK -
user_roles | Management can view all roles | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'management'::app_role) | CHECK -
user_roles | Owner can view all roles | SELECT | PERMISSIVE | {public} | ROLE-ONLY | USING has_role(auth.uid(), 'owner'::app_role) | CHECK -
user_roles | Users can view their own roles | SELECT | PERMISSIVE | {public} | OWNERSHIP | USING (auth.uid() = user_id) | CHECK -
user_view_preferences | user_view_preferences_delete_own | DELETE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
user_view_preferences | user_view_preferences_insert_own | INSERT | PERMISSIVE | {authenticated} | OWNERSHIP | USING - | CHECK (user_id = auth.uid())
user_view_preferences | user_view_preferences_select_own | SELECT | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK -
user_view_preferences | user_view_preferences_update_own | UPDATE | PERMISSIVE | {authenticated} | OWNERSHIP | USING (user_id = auth.uid()) | CHECK (user_id = auth.uid())
vacant_units | Staff can hold vacant units | INSERT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING - | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
vacant_units | Staff can update vacant units | UPDATE | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role)) | CHECK (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role))
vacant_units | Staff can view vacant units | SELECT | PERMISSIVE | {authenticated} | ROLE-ONLY | USING (has_role(auth.uid(), 'management'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'onboarding_staff'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)) | CHECK -
```
