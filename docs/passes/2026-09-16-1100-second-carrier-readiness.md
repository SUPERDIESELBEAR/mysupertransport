# Pass report — 2026-09-16 ~11:00 UTC — second-carrier readiness audit

READ-ONLY. No migrations, no function edits, no data changes.
**No file outside docs/ was modified.**

Baseline read live: `SELECT count(*) FROM public.carrier_profile` → `1`.
48 public base tables still lack `company_id` (query in Q4).

---

## 0. Contradictions found

1. **A live RLS-visibility demonstration is IMPOSSIBLE from this pass.** The sandbox
   database identity is `sandbox_exec` (`SELECT current_user, session_user` →
   `sandbox_exec|sandbox_exec`). Its grants are read+insert only:
   `company_members|{... sandbox_exec=ar/postgres}` (`pg_class.relacl`), and role
   impersonation is refused:
   ```
   BEGIN;
   SET LOCAL ROLE authenticated;
   ERROR:  permission denied to set role "authenticated"
   ```
   `public.bootstrap_assign_owner` is likewise not executable here:
   ```
   NOTICE:  bootstrap_assign_owner -> SQLSTATE 42501 : permission denied for function bootstrap_assign_owner
   ```
   Earlier passes' "real session" probes were done over REST with a real JWT, which
   cannot be wrapped in an aborting transaction. So Q2's demonstration requirement
   (scratch carrier + scratch staff + count visible applications, rolled back) cannot
   be satisfied under this pass's constraints. **Q2 is answered from live policy text,
   which is decisive, and the demonstration is recorded as NOT PERFORMED.** It is not
   claimed as passed.
2. **Deployed-vs-repo parity for edge functions is NOT confirmed.** Nothing in this
   pass read deployed function source. Every edge-function claim below is a claim about
   the repository file named, not about the deployed artifact.
3. `carrier_profile` has more NOT NULL columns than the reviewer's earlier probe
   assumed; two scratch inserts failed before reaching any probe:
   ```
   ERROR:  null value in column "mc_number" of relation "carrier_profile" violates not-null constraint
   ERROR:  null value in column "main_office_address" of relation "carrier_profile" violates not-null constraint
   ```
   Required set (`information_schema.columns`): `legal_name, usdot_number, mc_number,
   main_office_address, home_terminal_address, home_terminal_timezone`
   (`fmcsa_division_state` defaults `'MO'`). Recorded so the next pass that creates
   carrier #2 does not repeat it.

No contradiction was found with the 2026-09-13 `applications`-stays-GLOBAL decision,
the fictitious-company-by-hand-onboarding decision, or the B8 entry. The 18 GLOBAL /
8 DEFERRED lists in the record match live: `notification_role_defaults` HAS
`company_id` (per-carrier, as decided 2026-09-14) and `email_templates` has none
(DEFERRED). No stale-declaration break.

---

## Q1 — What breaks or goes silently wrong the moment a second `carrier_profile` row exists

Ranked as instructed: **by whether a wrong result is detectable by the person receiving
it**, not by likelihood. Class A = prints a plausible wrong answer on a document.
Class B = raises, visible. Class C = safe / fail-closed.

| # | Site (source) | Runs as | On 2 carriers | Detectable? | Class |
| --- | --- | --- | --- | --- | --- |
| A1 | `supabase/functions/generate-application-pdf/index.ts:110` — `.from('carrier_profile').select('legal_name, usdot_number, mc_number').limit(1).maybeSingle()` then `identityFromProfile(profile)`; client built with `SUPABASE_SERVICE_ROLE_KEY` (line 71) | service_role, sees every carrier, RLS bypassed | returns an ARBITRARY carrier (no `ORDER BY`) | **NO.** The applicant's signed application PDF carries a real, correctly formatted carrier name / USDOT / MC that may be the wrong carrier's. Nobody in the chain can tell. | A |
| A2 | `supabase/functions/send-officer-packet/index.ts:248` — `.from('carrier_profile').select('legal_name, usdot_number').limit(1).maybeSingle()` | service_role | arbitrary carrier | **NO.** A roadside officer receives a packet naming a plausible carrier and USDOT. Federal document, wrong identity, silent. | A |
| A3 | `supabase/functions/process-eld-escalations/index.ts:251` — `.from('carrier_profile').select('home_terminal_timezone').limit(1).maybeSingle()`, `timeZone = carrier?.home_terminal_timezone \|\| DEFAULT_TZ` | service_role | arbitrary carrier's timezone applied to EVERY carrier's malfunction clock | **NO.** Deadlines/dates shift silently; the ledger and emails look normal. | A |
| A4 | `src/lib/application/identity.ts:33` — `.from('carrier_profile').select(...).limit(1).maybeSingle()`, falling back to `DEFAULT_COMPANY_IDENTITY` (hard-coded `SUPERTRANSPORT, LLC / 2309365 / 788425`, `supabase/functions/_shared/application/identity.ts:21`) | browser, under RLS | live SELECT policy is `Callers read only their own carrier profile` `USING (id = current_company_id())` (`pg_policies`), and `/apply` is anonymous → **0 rows → hard-coded SUPERTRANSPORT letterhead** | **NO.** Carrier B's applicant signs a disclosure carrying SUPERTRANSPORT's name and DOT number. | A |
| B1 | `supabase/functions/receive-rate-con-email/index.ts:323` — `company_id: await soleCompanyId(admin)` | service_role | `soleCompanyId` throws (`Expected exactly one carrier_profile row, found 2 …`) → queue insert never runs → **inbound rate-con email ingestion stops for SUPERTRANSPORT** | YES — raises; but silent to the broker who sent the mail | B (production path) |
| B2 | `supabase/functions/bootstrap-admin/index.ts:97` (non-owner branch) | service_role, tool | throws → cannot bootstrap staff | YES | B (tool) |
| B3 | `supabase/functions/create-test-operator/index.ts:104` | service_role, tool | throws | YES | B (tool) |
| B4 | `supabase/functions/provision-test-driver/index.ts:87,107` | service_role, tool | throws | YES | B (tool) |
| B5 | LIVE `public.bootstrap_assign_owner` — `v_company uuid := (SELECT id FROM public.carrier_profile);` (bare scalar, `pg_proc.prosrc`) | SECURITY DEFINER, pinned `public, extensions` | raises. **Probed** with a scratch second carrier in an aborting transaction: `NOTICE: bare scalar (bootstrap_assign_owner shape) -> SQLSTATE 21000 : more than one row returned by a subquery used as an expression` | YES, loudly | B (deliberate, per its own comment) |
| C1 | LIVE `public.recompute_eld_extension_projection` — filters `carrier_profile` by `usdot_number` (`prosrc`), backed by `carrier_profile_usdot_unique` on `(usdot_number)` (`pg_indexes`) | SECURITY DEFINER | probed same transaction: `NOTICE: usdot-filtered (…) -> America/Chicago` — correct, unaffected | n/a | C |
| C2 | `src/lib/eld/offline/hydrate.ts:113` — `.maybeSingle()` with no filter | browser, under RLS | policy scopes to own carrier → 0 or 1 row; incomplete snapshot is treated as a failed fetch (fail-closed) | n/a | C |
| C3 | `src/components/management/eld/ELDExtensionRequests.tsx:83` — `.limit(1).maybeSingle()` | browser, under RLS | own carrier only | n/a | C |

Only two LIVE database functions reference `carrier_profile` (`pg_proc.prosrc` search):
`bootstrap_assign_owner` (B5, bare scalar) and `recompute_eld_extension_projection`
(C1, filtered). `supabase/functions/_shared/tenancy.ts:69` `soleCompanyId` is the
deliberate refuse-on-second-carrier helper, not a silent reader.

### Q1(d) — other one-carrier assumptions found

| Finding | Source | Effect on 2 carriers | Class |
| --- | --- | --- | --- |
| `driver_documents` read policy `Drivers can view visible documents` `USING ((is_visible = true) AND (auth.uid() IS NOT NULL))` — no company, no ownership test | `pg_policies` | ANY signed-in user of ANY carrier reads every visible driver document row | A (cross-carrier read, invisible to the victim) |
| `profiles` staff read `Staff can view all profiles USING is_staff(auth.uid())`; `profiles` is declared GLOBAL and has no `company_id` | `pg_policies`, `information_schema.columns` | carrier B staff see every person's name in the system | A |
| The whole `applications` family is role-only (Q2) | `pg_policies` | see Q2 | A |
| `DEFAULT_COMPANY_IDENTITY` hard-codes SUPERTRANSPORT as the fallback for both browser and edge identity paths | `supabase/functions/_shared/application/identity.ts:21` | any read failure prints SUPERTRANSPORT's letterhead for carrier B | A |

### Proposed fixes (NOT done — one line each)

- A1/A2/A3: pass the resolved company id in and `.eq('id', companyId)` instead of
  `.limit(1)`. **Prerequisite** — these produce wrong federal/applicant documents.
- A4: resolve the carrier from the apply link / invite rather than falling back to a
  hard-coded identity, and make the fallback refuse instead of printing.
  **Prerequisite** before any non-SUPERTRANSPORT apply link exists; the record already
  defers per-carrier apply links, so it can wait for the demo if the demo never opens
  an apply link for carrier B.
- B1: give the ingest address a company (per-address mapping) instead of
  `soleCompanyId`. **Prerequisite** — creating carrier #2 breaks SUPERTRANSPORT's
  inbound rate-con ingestion the moment the row exists.
- B2–B4: pass an explicit `company_id`. Tools only — **can wait**, but B2 is the path
  used to add staff, so carrier B's owner cannot be bootstrapped by it.
- B5: parameterise the company. **Prerequisite** for creating carrier #2 with an owner.
- `driver_documents` policy: scope by company (and by driver). **Prerequisite.**
- `profiles`: leave GLOBAL per the record, but scope staff reads through
  `company_members` / `operators`. **Prerequisite** for the demo not to show
  SUPERTRANSPORT people to carrier B.

---

## Q2 — The applications path

Live policies (`pg_policies`, verbatim):

```
applications|Staff can view all applications|SELECT|is_staff(auth.uid())||{public}
applications|Staff can update applications|UPDATE|is_staff(auth.uid())||{public}
applications|Staff can delete applications|DELETE|is_staff(auth.uid())||{authenticated}
applications|Owner can view own application|SELECT|(auth.uid() = user_id)||{public}
applications|Owner can update draft application|UPDATE|((auth.uid() = user_id) AND (is_draft = true))|…|{public}
applications|Public can submit application with email|INSERT||((email IS NOT NULL) AND (email <> ''::text) AND (user_id IS NULL) AND (review_status = 'pending') AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (reviewer_notes IS NULL) AND (background_verification_notes IS NULL) AND (mvr_status = 'not_started') AND (ch_status = 'not_started') AND (pei_status = 'not_started') AND (COALESCE(submitted_by_staff, false) = false))|{anon,authenticated}
```

Every pre-`operators` table the onboarding flow writes has the same shape (31 policy
rows read; abbreviated):

```
application_invites            : staff SELECT/INSERT/UPDATE/DELETE via is_staff
application_document_history   : staff SELECT/INSERT via is_staff
application_correction_requests: staff SELECT via is_staff
application_correction_fields  : staff SELECT via is_staff
application_interview_notes    : role / author predicates only
application_revision_attachments: staff SELECT/INSERT/DELETE via is_staff
driver_documents               : staff ALL via is_staff; drivers SELECT (is_visible AND auth.uid() IS NOT NULL)
driver_uploads                 : staff ALL via is_staff; drivers own driver_id
```

`is_staff` (LIVE `prosrc`):

```
SELECT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.role IN ('onboarding_staff','dispatcher','management','owner')
    AND (auth.role() = 'service_role' OR ur.company_id = public.current_company_id())
)
```

**Answer from the policy text: YES.** `is_staff` only establishes that the caller holds
a staff role *within their own company*. It returns the same boolean for carrier B's
onboarding_staff as for SUPERTRANSPORT's, and none of the row policies above carry a
company predicate — there is no `company_id` on these tables to test. Carrier B's
onboarding staff would SELECT, UPDATE and DELETE SUPERTRANSPORT's applications, their
invites, correction requests, interview notes, revision attachments, driver documents
and driver uploads. This is the direct consequence of the recorded
`applications`-stays-GLOBAL decision, not a deviation from it.

**Demonstration: NOT PERFORMED.** See contradiction 1 — this connection cannot
`SET ROLE authenticated` and cannot UPDATE `company_members` (insert-only grant), and
a REST probe would require a committed second carrier, which this pass forbids. The
claim above rests on policy text alone and is labelled accordingly.

**Can a demo driver reach an `operators` row without passing through `applications`?**
Not on the sanctioned onboarding path, and yes on the tool path:
`supabase/functions/provision-test-driver/index.ts` requires `application_id`
(`{ error: 'application_id required' }`) and reads that application, so it goes through
`applications`. `supabase/functions/create-test-operator/index.ts` and the staff
"add driver" path also carry an application. So carrier B's demo drivers WILL create
rows in the GLOBAL `applications` family, visible to SUPERTRANSPORT staff and vice
versa. That is the demo's most visible cross-carrier surface.

---

## Q3 — How is carrier #2 created?

Every candidate path, and what it does today:

| Path | Source | Result |
| --- | --- | --- |
| Client insert by management/owner | live policy `Management can insert the carrier profile` INSERT `WITH CHECK (has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'))` | The ROW can be inserted (no UI calls it — `rg` found no `from('carrier_profile').insert` in `src/`), but no owner and no membership come with it. |
| `bootstrap_assign_owner` | live `prosrc` | Refuses: bare scalar → `SQLSTATE 21000 more than one row returned by a subquery used as an expression` (probed). Cannot name carrier B. |
| `bootstrap-admin` non-owner branch | `supabase/functions/bootstrap-admin/index.ts:97` | `soleCompanyId` throws with 2 carriers. |
| `assign_user_role` | record + live | refuses a staff role without a `company_members` row. |
| `company_members` direct write | `pg_class.relacl` — protected; grants to `authenticated` exist but the table is fail-closed by policy, and the sandbox role has insert only | no client path creates a membership for a new carrier. |
| Migration / privileged SQL | `supabase/migrations/20260730132021_…sql:47` is the only `INSERT INTO public.carrier_profile` in the repo | the only route that can create the carrier + its owner role + its membership together. |

**Plainly: no application, edge-function or DB-function path can create carrier #2 with
an owner and a membership while SUPERTRANSPORT's owner exists.** It has to be a
migration, or `bootstrap_assign_owner` has to take the company as an argument first.
Nothing was built.

---

## Q4 — What SUPERTRANSPORT content the demo will show

Live query:
`SELECT table_name FROM information_schema.tables t WHERE table_schema='public' AND
table_type='BASE TABLE' AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='company_id')`
→ 48 rows.

Of the 8 DEFERRED content tables and 18 GLOBAL tables, these are read by a company-B
staff member or driver during onboarding:

| Table | Group | Read by, source | What carrier B sees |
| --- | --- | --- | --- |
| `applications` + 7 children | GLOBAL | staff review screens; `is_staff` policies | SUPERTRANSPORT's applicants, editable |
| `profiles` | GLOBAL | staff directory / every name lookup | every SUPERTRANSPORT person's name |
| `pipeline_config` | DEFERRED | `src/pages/staff/PipelineDashboard.tsx:838`, `src/components/management/PipelineConfigEditor.tsx:351` | SUPERTRANSPORT's pipeline stages |
| `faq`, `faq_history` | DEFERRED | `src/lib/staffHelp/buildKnowledgeDocs.ts:69`; driver FAQ panel | SUPERTRANSPORT's FAQ answers |
| `services`, `service_resources` | DEFERRED | `src/components/service-library/ServiceLibraryManager.tsx:136,146`; `buildKnowledgeDocs.ts:106` | SUPERTRANSPORT's service library |
| `staff_help_knowledge` | DEFERRED | `supabase/functions/staff-help-ingest/index.ts:117` | SUPERTRANSPORT's internal help corpus answers carrier B's staff questions |
| `message_templates`, `email_templates` | DEFERRED | `src/components/staff/BulkMessageModal.tsx:361`; `notify-onboarding-update/index.ts:165`, `send-application-correction-email/index.ts:94`, `notify-application-moved-to-pending/index.ts:58` | SUPERTRANSPORT's wording is sent to carrier B's drivers |
| `resource_documents`, `resource_history` | GLOBAL | `src/components/operator/OperatorResourcesAndFAQ.tsx:58`, `src/pages/operator/OperatorPortal.tsx:369` | SUPERTRANSPORT's driver documents in carrier B's driver portal |
| `release_notes` | GLOBAL | `src/components/management/ReleaseNotesManager.tsx:47` | SUPERDRIVE's own changelog — correct as-is |
| `eld_device_models`, `eld_revoked_list_checks` | GLOBAL | ELD screens | federal reference data — correct as-is |
| `revert_courtesy_email_defaults`, `email_unsubscribe_tokens`, `suppressed_emails` | GLOBAL | email paths | product/mailbox-level, per the recorded decisions |
| `carrier_profile` | GLOBAL (it IS the company) | everywhere | now scoped by `id = current_company_id()` |

Proposed fix for the content group: the nullable product-default shape already decided
2026-09-14 (row starts null `company_id`, becomes the carrier's on edit). **Can wait**
for the demo if the owner accepts that carrier B initially displays SUPERTRANSPORT's
FAQ, services, resources and email wording — but `staff_help_knowledge` and
`email_templates` are the two that will look wrong to a demo audience.

---

## Every query and probe run in this pass

1. `SELECT current_user, session_user;`
2. `SELECT rolname, pg_has_role(session_user, oid,'MEMBER') FROM pg_roles WHERE rolname IN (…)` → all `f`.
3. `SELECT relname, relacl::text FROM pg_class WHERE relname IN ('company_members','carrier_profile','applications')`.
4. `SELECT count(*) FROM public.carrier_profile` → 1.
5. `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='carrier_profile'`.
6. `SELECT prosrc FROM pg_proc … WHERE proname IN ('current_company_id','is_staff','bootstrap_assign_owner','recompute_eld_extension_projection')`.
7. `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies` for `carrier_profile`, `profiles`, `driver_documents`, `applications` + the pre-operator family (31 rows), `preview_sessions`.
8. `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='carrier_profile'`.
9. The 48-table no-`company_id` inventory (query quoted in Q4).
10. Aborting-transaction probes (all rolled back; `ROLLBACK` confirmed in output):
    - scratch carrier insert ×2 → the two NOT NULL failures quoted in contradiction 3;
    - scratch carrier + bare-scalar `(SELECT id FROM public.carrier_profile)` → `SQLSTATE 21000`;
    - scratch carrier + usdot-filtered read → `America/Chicago`;
    - `SET LOCAL ROLE authenticated` → `permission denied to set role "authenticated"`;
    - `PERFORM public.bootstrap_assign_owner(...)` → `SQLSTATE 42501 permission denied for function`;
    - `UPDATE public.company_members …` → `ERROR: permission denied for table company_members`.
11. Repo searches (`rg`): `soleCompanyId`, `carrier_profile`, `from('<table>')` for each
    content table, `carrier_profile` inserts in `supabase/migrations/`.

Nothing was committed to the database. No file outside docs/ was modified.
