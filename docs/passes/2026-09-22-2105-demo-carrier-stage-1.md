# Pass report — 2026-09-22 21:05 UTC — demo carrier, stage 1 of 6: what still assumes one carrier

READ-ONLY. No migration, no code, no function, no data change. Only this report,
`docs/tms-build-status.md` and `docs/tms-wish-list.md` were written.
**Full suite deliberately SKIPPED — this pass is docs only.**

Read first: `docs/passes/2026-09-16-1100-second-carrier-readiness.md` (the original four
prerequisites), `docs/passes/2026-09-16-1840-read-enforcement-census.md` (the
read-enforcement decision), and the 2026-09-13 decision to create a fictitious company
and hand-onboard demo drivers.

Live baseline, measured this pass:

```
SELECT count(*) FROM public.carrier_profile;                        -> 1
SELECT id, legal_name, usdot_number FROM public.carrier_profile;
  6b54d0e6-8743-4284-b55b-8cd094b093dd | SUPERTRANSPORT, LLC | 2309365
public base tables                                                 -> 201
base tables WITH company_id                                        -> 164
   of those carrying a RESTRICTIVE tenant_isolation policy          -> 163
   without one                                                      -> 1  (company_members)
base tables WITHOUT company_id                                     -> 37
policies in public                                                  -> 735
```

## CONTRADICTIONS WITH THE LIVE SYSTEM — read this first

1. **"cross-carrier read enforcement (159 tables)" is stale in BOTH directions.** 159 was
   the count of RESTRICTIVE policies on 2026-09-18, not a count of unenforced tables.
   Live today: **164** company-bearing tables, **163** of them carry the restrictive
   `tenant_isolation` policy (`company_id = (SELECT current_company_id())` FOR ALL TO
   authenticated). The one exemption is `company_members`, permanently exempt because the
   resolver reads it; its only policy is `SELECT … (user_id = auth.uid())`, so it is
   self-scoped anyway. **Cross-carrier read enforcement on company-bearing tables is
   structurally CLOSED, not open.** What remains open is the **37 tables with no
   `company_id` at all** (Step 4).
2. `company_pay_policy_on(date)` — built since the survey — carries **no company filter**
   and is called from four SECURITY DEFINER functions. This is a NEW prerequisite of the
   same class as A1–A3 and did not exist on 2026-09-16 (Step 2).
3. `cron.job` is not readable from this connection (`ERROR: permission denied for schema
   cron`). The cron statements are therefore taken from
   `docs/passes/2026-09-21-1135-scheduled-jobs-verified.md` and
   `docs/passes/2026-09-21-0105-cron-secret-repair.md`, not re-read live. Stated, not
   claimed as verified.
4. Everything below about edge functions is a claim about the **repository file** named.
   Deployed-vs-repo parity was not read. Same boundary as the 2026-09-16 report.

---

## STEP 1 — THE ORIGINAL FOUR, RE-CHECKED LIVE

### (a) The three arbitrary carrier readers — ALL THREE STILL TRUE, unchanged

| site | live text | the moment carrier B exists |
| --- | --- | --- |
| `supabase/functions/generate-application-pdf/index.ts:110-113` | `.from('carrier_profile').select('legal_name, usdot_number, mc_number').limit(1).maybeSingle()`, service-role client | the applicant's signed application PDF is stamped with an **arbitrary** carrier's name, USDOT and MC. No `ORDER BY`, no filter. Undetectable by anyone in the chain. |
| `supabase/functions/send-officer-packet/index.ts:248` | `.from('carrier_profile').select('legal_name, usdot_number').limit(1).maybeSingle()` | a roadside officer receives a federal packet naming a plausible wrong carrier. Mitigated only by the 2026-09-17 ELD/RODS HIDE decision — the path is intact, the ways in were removed. |
| `supabase/functions/process-eld-escalations/index.ts:251-254` | `.select('home_terminal_timezone').limit(1).maybeSingle()` | one arbitrary carrier's timezone drives every carrier's repair clock. Same ELD-hidden mitigation; its two cron jobs were removed on 2026-09-17. |

`src/lib/application/identity.ts` (browser) is unchanged too: `/apply` is anonymous,
`carrier_profile`'s SELECT policy is `id = current_company_id()`, so the read returns zero
rows and the page falls back to the hard-coded `SUPERTRANSPORT, LLC / 2309365 / 788425` in
`supabase/functions/_shared/application/identity.ts`.

### (b) `receive-rate-con-email` through `soleCompanyId` — STILL TRUE

`supabase/functions/receive-rate-con-email/index.ts:323` — `company_id: await
soleCompanyId(admin)`. `soleCompanyId` (`_shared/tenancy.ts:102`) raises
`Expected exactly one carrier_profile row, found 2`. **The moment the second row is
COMMITTED, SUPERTRANSPORT's inbound rate-con email ingestion stops** — the queue insert
never runs and the broker who sent the mail is told nothing. This is the single loudest
day-one break and it belongs to carrier A, not carrier B.

Same helper, tools only, all still present: `bootstrap-admin:97`,
`create-test-operator:104`, `provision-test-driver:87,107`.

### (c) No path creates carrier #2 with an owner and a membership — STILL TRUE

`public.bootstrap_assign_owner` is unchanged, live `prosrc`:

```sql
-- Bare scalar subquery: raises 21000 rather than picking a carrier once a
-- second company exists. At that point this tool must be told which one.
v_company uuid := (SELECT id FROM public.carrier_profile);
```

So: 21000 the moment two rows exist, by design. There is still **no function, no edge
function and no screen** that creates a `carrier_profile` row, its owner `user_roles` row,
its `company_members` row and (new since the survey) its `role_permissions` grants. Carrier
B has to be created by hand, and the required NOT NULL set is still `legal_name,
usdot_number, mc_number, main_office_address, home_terminal_address,
home_terminal_timezone` (`fmcsa_division_state` defaults `'MO'`).

Only three live functions reference `carrier_profile` at all: `bootstrap_assign_owner`
(bare scalar), `recompute_eld_extension_projection` (filtered by the USDOT snapshotted on
the event — safe) and `seed_role_permissions` (takes `_company_id`, validates it — safe).

### (d) Cross-carrier read enforcement — SUPERSEDED, see contradiction 1

163 of 164 company-bearing tables are hard-isolated. On day one, carrier B's staff read
**none** of SUPERTRANSPORT's loads, settlements, invoices, operators, fuel, documents,
messages, equipment, compliance or pay rows. The exposure moved entirely to the 37
columnless tables and to `storage.objects`.

---

## STEP 2 — WHAT HAS BEEN ADDED SINCE 2026-09-16

| thing | carrier-ready on day one? | what must be created or changed first |
| --- | --- | --- |
| `permission_actions` | **shared, and correctly so** — no `company_id`; it is the catalogue of action keys, product-level | nothing |
| `role_permissions`, `user_permission_exceptions` | tables yes — both have `company_id`, restrictive `tenant_isolation`, owner-only writes | **`seed_role_permissions(<carrier B id>)` MUST be run in the same transaction that creates the carrier.** It raises on a NULL or unknown company. Until it runs, `has_permission` finds no `role_permissions` row for that company and returns **false for every action for every non-owner** — carrier B's management and dispatchers are refused everything gated. The owner is unaffected (P1 short-circuits before any table is read). |
| `has_permission` | yes | it resolves `current_company_id()` and returns false when that is NULL — fail-closed, correct |
| `user_roles.company_id` | yes | carrier B's role rows must carry ITS company id; `has_role`/`is_staff` compare the role row to the caller's company |
| `pay_policies` + versioning | table yes: `company_id`, restrictive isolation, and the single-default index is **already per carrier** — `UNIQUE (company_id, is_company_default) WHERE (is_company_default AND effective_to IS NULL)` | **carrier B has no rate sheet.** One company-default version must be inserted for it, or every percentage-priced line resolves to nothing |
| `company_pay_policy_on(date)` | **NO — NEW CLASS A DEFECT** | live body selects `WHERE pp.is_company_default AND pp.is_active AND <date window> … LIMIT 1` with **no `company_id` predicate**. Under a normal session the restrictive policy saves it. But it is called from four SECURITY DEFINER functions — `create_accessorial_adjustment`, `driver_load_pay_estimate`, `my_fuel_transactions`, `sync_operator_linehaul_pct_mirror` — which run as the function owner with RLS not applied. Day one with two rate sheets: an **arbitrary** carrier's linehaul percentage silently prices accessorial adjustments, the driver-facing earnings estimate and the nightly mirror. Must take a company argument. |
| `operator_linehaul_pct_versions` | yes | `company_id`, restrictive isolation, one-current-per-operator index is per operator (safe across carriers); `set_operator_linehaul_pct` derives the company from the driver's `operators` row, not from a carrier lookup |
| `settlement_line_items.resolved_pct / pct_source / pct_version_id` | yes | company-bearing and isolated; provenance is per row |
| `settlement_settings`, `dispatch_settlement_rates` | yes | carrier B needs its own rows; the read policies already test `company_id = current_company_id()` |
| cron jobs | **statement-level, not verified live** (contradiction 3) | each job calls one edge function with no company argument; the function resolves per row. The two that would misbehave are the ones named above: anything reaching `company_pay_policy_on` through a definer function (the 05:10 UTC mirror) and anything reaching `soleCompanyId`. `process-eld-escalations`' two jobs were removed 2026-09-17. |
| storage rules | **partly** | migration 0035 bound only `inspection-documents/company/` and `ica-signatures/carrier-default/` to their company. Of 83 `storage.objects` policies, **~50 test a role alone** — `operator-documents/company-docs`, `application-documents`, `application-revision-replies`, `broker-documents`, `load-documents`, `fleet-documents`, `driver-uploads`, `signatures`, `pei-documents`, `rods-logs`, `rate-con-ingest`, `resource-library`, `service-logos`, `eld-notices`, `dot-consultant-attachments`. Day one, carrier B's staff can read and in most cases DELETE carrier A's files even where the table rows are hidden. |
| release notes / auto-drafted announcements | **shared** | `release_notes` has no `company_id`; read policy is `is_staff(auth.uid()) AND (approved OR author OR management/owner)`. Carrier B's staff see SUPERTRANSPORT's announcement feed. `release_note_reads` IS per carrier. Arguably correct (product announcements) — **decision owed**. |
| archived applicants | **shared** | it is a state on `applications`, which has no `company_id`. It inherits exactly the `applications` exposure in Step 4. |

---

## STEP 3 — EVERY TEST AND FIXTURE THAT ASSUMES ONE CARRIER

| file | what it assumes | on the day carrier B exists |
| --- | --- | --- |
| `src/test/dispatch-settlement-schema.test.ts:337-347` | `carrier_profile` holds **exactly one** row for USDOT 2309365 (`expect(rows).toHaveLength(1)`); every fixture writes as `CO = (SELECT id FROM carrier_profile WHERE usdot_number='2309365')` | the count assertion still PASSES (it is filtered by USDOT, which is globally unique) — this file was already repaired. Safe. |
| `src/test/tenancy-resolver.test.ts` — **9 occurrences** of bare `(SELECT id FROM public.carrier_profile)` (lines 502, 577, 707, 862, 998, 1085, 1184, 1270, 1885), plus `:414` `ORDER BY created_at LIMIT 1` | every one is a bare scalar subquery used as an expression | **9 assertions raise `21000 more than one row returned by a subquery`.** The file goes red and the whole tenancy safety net stops reporting. This is the biggest test-side item. |
| `src/test/tenancy-resolver.test.ts:768-783` | `carrier_profile` SELECT policy count `toHaveLength(1)` | that is a POLICY count, not a row count — unaffected |
| `src/test/helpers/tenancy.ts` (`AS_COMPANY_MEMBER`) | adopts `(SELECT user_id FROM company_members ORDER BY created_at LIMIT 1)` | still resolves — it silently keeps picking the OLDEST member, i.e. SUPERTRANSPORT. No failure, no coverage of carrier B. Deliberate row-picking in a test helper; should be made explicit. |
| `src/test/invoice-dispatch-reconciliation.test.ts:118` | `… where p.is_company_default order by p.created_at limit 1` — no company filter | silently reads whichever rate sheet is older. Green, wrong. |
| `src/test/billing-schema.test.ts:192-197`, `src/test/accessorial-adjustment-schema.test.ts:227` | `company_id` FK points at `carrier_profile` with `ON DELETE RESTRICT` | catalogue assertions, unaffected |
| `src/test/definer-live-catalog.test.ts:689` | comment only, on a definer that reads `carrier_profile` | unaffected |
| `src/test/onboarding-test-login.test.ts:62` | `count(*) FROM company_members WHERE user_id = <test user>` | unaffected unless the test user is given a second membership — at which point `current_company_id()` returns NULL by owner decision C and the login test fails loudly. Correct behaviour. |
| `src/lib/__tests__/settlementRun.test.ts:45`, `src/test/settlement-adjustment-seam.test.ts:63` | in-memory `pay_policies` stub with one company-default row | unit fixtures, unaffected; they also will not catch the `company_pay_policy_on` defect |
| `src/test/pay-policy-dated-readers.test.ts` | one policy version alive at a time; scans source for `.eq('is_company_default', true)` shapes | unaffected by a second carrier; already the right shape |

No fixture hard-codes `6b54d0e6…`. That is worth stating: the only hard-coded carrier
identity anywhere in the suite is the USDOT string, and it is used as a filter, not an
assumption of uniqueness.

---

## STEP 4 — THE SHARED-DATA QUESTIONS, STATED NOT ANSWERED

The 37 tables with no `company_id`, live:

```
applications, application_invites, application_correction_requests,
application_correction_fields, application_document_history,
application_interview_notes, application_resume_tokens,
application_revision_attachments, pei_requests, pei_request_events, pei_responses,
pei_accidents, profiles, driver_documents, faq, faq_history, services,
service_resources, resource_documents, resource_history, message_templates,
email_templates, email_send_log, email_send_state, email_unsubscribe_tokens,
suppressed_emails, release_notes, permission_actions, pipeline_config,
revert_courtesy_email_defaults, staff_help_knowledge, audit_log, eld_cron_runs,
eld_device_models, eld_revoked_list_checks, share_token_access_log, carrier_profile
```

**The applications family.** Every policy on it is `is_staff(auth.uid())` — verbatim,
read live this pass, with no company predicate and no column to carry one. Carrier B's
onboarding staff would, on day one, **SELECT, UPDATE and DELETE** SUPERTRANSPORT's
applications and their invites, correction requests and fields, document history,
interview notes, resume tokens and revision attachments. `applications` carries the
applicant's **SSN**, date of birth, address, licence and employment history. The PEI
family hangs off those rows and inherits it. The application-documents,
application-revision-replies and pei-documents buckets are role-only in storage, so the
FILES are exposed with the rows. This follows directly from the 2026-09-13
applications-stays-GLOBAL decision and the unresolved tension recorded on 2026-09-16:
hand-onboarding demo drivers puts carrier B's applicants in the same table.

**`profiles`.** Staff read is `is_staff(auth.uid())`. Carrier B's staff see the name,
phone and email of **every person in the system** — SUPERTRANSPORT's 157 drivers, its
staff and its applicants — and `Staff can update profiles` means they can edit them.

**The nine content tables.** `faq`, `faq_history`, `services`, `service_resources`,
`resource_documents`, `resource_history`, `message_templates`, `email_templates`,
`driver_documents` (the Document Hub library, per the 2026-09-16 correction). Day one:
carrier B sees SUPERTRANSPORT's FAQ, its services directory, its resource library, its
message and email templates, and its Document Hub library — and `Staff can manage` gives
write on most of them. `driver_documents` is worse than role-only: its read policy is
`is_visible = true AND auth.uid() IS NOT NULL`, so **any signed-in account of any
carrier**, including an applicant, reads every visible library document.

**`/apply`.** Anonymous, so `carrier_profile` returns zero rows and the page prints the
hard-coded `SUPERTRANSPORT, LLC`, USDOT 2309365, MC 788425 on the disclosures the
applicant signs. A carrier-B applicant would sign SUPERTRANSPORT's letterhead. There is
no per-carrier apply link.

**Also shared, worth naming:** `pipeline_config` (carrier B's pipeline stages would be
SUPERTRANSPORT's, and editable by either), `audit_log` (one ledger; attribution survives,
scoping does not), `email_templates` + the shared sending domain, and
`revert_courtesy_email_defaults`.

---

## STEP 5 — THE ORDER OF WORK, PROPOSED

### Would break SUPERTRANSPORT's LIVE operation if carrier B were created today

1. **`receive-rate-con-email` / `soleCompanyId`** — inbound rate-con ingestion STOPS at
   commit. Give the ingest address a company mapping. **Hard break, carrier A.**
2. **`company_pay_policy_on` has no company filter, and four definer functions call it**
   — accessorial adjustments, the driver earnings estimate and the 05:10 mirror would
   price from an arbitrary rate sheet, silently. **Hard break, money, silent.**
3. **`bootstrap_assign_owner`'s bare scalar** — raises 21000, so staff/owner bootstrap
   stops for both carriers. Parameterise the company.
4. **`tenancy-resolver.test.ts`'s 9 bare scalars** — the suite that guards all of this
   goes red on the same day. Fix before, not after.
5. **`generate-application-pdf`** — every application PDF, both carriers, may carry the
   wrong legal identity. Pass the resolved company in.

### Must exist before the carrier row is useful (same transaction as creating it)

6. A creation path that writes, atomically: `carrier_profile` → owner `user_roles` →
   `company_members` → `seed_role_permissions(id)` → one company-default `pay_policies`
   version → `settlement_settings` / `dispatch_settlement_rates`. Without
   `seed_role_permissions`, every non-owner at carrier B is refused everything gated.

### Can follow, in this order

7. `driver_documents` read policy (`is_visible AND signed in`) — the widest single hole
   left, and it is a hole TODAY for applicants, not only for carrier B.
8. `storage.objects` — the ~50 role-only policies, bound to their company through the row
   that records each file, the way migration 0035 did for the two folders.
9. `profiles` staff read scoped through `company_members` / `operators`.
10. `/apply` per-carrier identity, and a fallback that REFUSES rather than printing
    SUPERTRANSPORT.
11. `send-officer-packet` and `process-eld-escalations` — real Class A defects held at bay
    only by the ELD/RODS HIDE decision. Must be fixed before ELD/RODS is unhidden.
12. `pipeline_config`, `email_templates`, `message_templates` and the rest of the content
    group, per the owner's product-versus-carrier answers.

### The owner must decide first

- **`applications` and the PEI family: GLOBAL or per-carrier?** This is the decision the
  whole demo turns on. Hand-onboarding demo drivers puts carrier B's applicants — with
  SSNs — into a table carrier A's staff read, and vice versa.
- **`profiles`: stay GLOBAL with scoped staff reads, or per-carrier?**
- **The nine content tables: product-level (shared) or carrier-level (copied per
  carrier)?** `faq`, `services`, `resource_documents` and `email_templates` are the four a
  demo audience would notice.
- **`release_notes`: product-wide, or per carrier?** Today shared.
- **Does the demo carrier get its own `/apply` link?** If no, item 10 can wait.
- **Does the demo carrier share the sending domain and email templates?**
- **Is the demo carrier allowed to see nothing at all of SUPERTRANSPORT, or is a shared
  content library acceptable for a demo?** The answer collapses or expands items 7-12.

---

## Verification boundary

Live catalogue reads only: `pg_policies`, `pg_proc.prosrc`, `pg_get_functiondef`,
`pg_indexes`, `information_schema`. No RLS visibility was demonstrated as a real session —
that still requires a committed second carrier, which this pass forbids. Every claim about
what carrier B "would see" rests on policy text, and is labelled as such. `cron.job` was
not readable. Edge-function claims are about repository files.

## Files this pass authored

- `docs/passes/2026-09-22-2105-demo-carrier-stage-1.md` (this report)
- `docs/tms-build-status.md` — the dated record entry
- `docs/tms-wish-list.md` — stage 1 done, decisions owed
