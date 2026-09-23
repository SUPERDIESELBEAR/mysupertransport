# Pass report — 2026-09-23 18:42 UTC — demo carrier, stage 4, part 1

Platform role (built) and the full list of what a new carrier needs (read only).
No second carrier committed; no real row changed. Prompt received complete (last
line: "END OF PROMPT…").

## P43 — owner decision, 2026-09-23 (recorded verbatim)

> "Creating a carrier is a SUPERDRIVE platform power, not a carrier power. It belongs
> to a platform role held only by the platform operator (today, Marcus Mueller). No
> carrier's owner holds it by default, and nothing a carrier does can grant it."

## PART A — the platform role (BUILT, migration 0056_platform_admins.sql)

- `platform_admins(user_id pk, granted_at, granted_by, reason NOT NULL non-blank)` —
  **no company_id**. RLS on. One policy: SELECT `TO authenticated USING (user_id =
  auth.uid())`. Grants: SELECT to authenticated, ALL to service_role; PUBLIC/anon/
  authenticated otherwise revoked. No INSERT/UPDATE/DELETE policy or grant for any client.
- `is_platform_admin(_user_id uuid) RETURNS boolean` — SECURITY DEFINER, STABLE, pinned
  `public, extensions`; EXECUTE to authenticated and service_role only (revoked PUBLIC, anon).
  NULL → false. Returns a boolean only (same shape as `has_role(uuid, …)`).
- Seeded exactly one row: Marcus Mueller `5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`,
  granted_by `migration`, reason citing P43.

### Why NOT the three obvious homes

- **Not an `app_role` value.** `user_roles` rows carry `company_id` and are stamped to
  the caller's carrier by `stamp_tenant_company_id`; an app_role is by construction a
  role *within a carrier*. A carrier's owner already assigns roles (`assign_user_role`),
  so a platform value in that enum would sit one bug away from being grantable by a carrier.
- **Not a `permission_actions` entry.** `permission_actions` is granted per carrier via
  `role_permissions` (company_id) and `user_permission_exceptions` — both written by the
  carrier's owner. Anything in that catalogue is, by design, something a carrier decides
  who holds. That is exactly what P43 forbids.
- **Not in `has_permission`'s owner short-circuit.** P1 makes a carrier's owner hold every
  carrier action. If that short-circuit granted the platform power, *every* carrier's owner
  — including carrier B's — could create carriers. P43 says no owner holds it by default.

### Guards registered

- `src/test/tenancy-resolver.test.ts` — `platform_admins` added to `GLOBAL_TABLES` with P43
  as the reason; count 12 → 13.
- `src/test/definer-live-catalog.test.ts` — `public.is_platform_admin(uuid)` added to the
  authenticated-executable inventory with its reason; `KNOWN_AUTHENTICATED_EXECUTABLE_MAX`
  141 → 142. Not in the anon list (anon has no EXECUTE — proven below).
- Grant parity: `grant_parity_report()` covers the new table automatically (SELECT policy
  ↔ SELECT grant for authenticated; no write policy, no write grant). Full suite result below.

### Proofs (one raising transaction, run as the real user ids via JWT claims + `SET ROLE authenticated`)

```text
Marcus=true rows_visible=1; Mae=false rows_visible=0; Leo=false rows_visible=0;
OnboardingOnly=false rows_visible=0; SteveFigueroa=false rows_visible=0;
SteveMaxwell=false rows_visible=0; DonaldBrown=false rows_visible=0;
DonaldAlleyne=false rows_visible=0; Marcus insert refused 42501; update refused 42501;
delete refused 42501; anon exec refused;
ScratchOwner has_role(owner)=true own_company=true is_platform_admin=false
```

Both "Steve"s and both "Donald"s were tested because the names are ambiguous in the
profiles table. The scratch carrier's owner was made through `bootstrap_assign_owner`
(the approved ownership path) as service_role. Residue after rollback: carriers 1,
platform_admins 1, owners 1, scratch carrier 0, scratch auth users 0.

### Two findings from the proofs (they shape Part D)

1. **The stamp silently re-files carrier B's rows under the caller's carrier.**
   `stamp_tenant_company_id()` does `NEW.company_id := current_company_id()` whenever the
   caller resolves a company. My first probe ran with Marcus's claims set; the scratch
   owner's `user_roles` row was rewritten to SUPERTRANSPORT and hit
   `user_roles_single_owner` (23505). Marcus is a SUPERTRANSPORT member, so **a creation
   function called in Marcus's session would file carrier B's owner, settings and
   membership rows under SUPERTRANSPORT**. The creation must run with no resolvable caller
   company (service_role, explicit company_id) — see Part D.
2. `enforce_owner_role_writes` refuses a direct `user_roles` owner insert (42501); only
   `bootstrap_assign_owner(user, company)` may seed the owner. Good; the creation function
   must call it.

## PART B — what a carrier needs (READ ONLY, live)

Sources: every unique index naming company_id (`pg_index`), every function body reading a
settings table, and the SUPERTRANSPORT row in each. "Required input" = person creating
the carrier must supply; "SUPERDRIVE default" = a platform value, not SUPERTRANSPORT's.

| # | Table (constraint) | SUPERTRANSPORT today | New carrier gets | If missing |
|---|---|---|---|---|
| 1 | `carrier_profile` | legal_name, usdot 2309365, mc 788425, both addresses, tz America/Chicago, fmcsa_division_state MO, applicant_locality, apply_slug `supertransport`, rate_con_ingest_address | **Required input** (all) | nothing exists |
| 2 | `company_members` (unique user,company) | 16 | owner's row (**input: owner**) | `current_company_id()` NULL for the owner → every stamped write refused 42501, every tenant policy hides everything |
| 3 | `user_roles` owner (`user_roles_single_owner`) | 1 | via `bootstrap_assign_owner` | no one holds P1; nobody can grant roles |
| 4 | `role_permissions` (unique company,role,action) | 15 | `seed_role_permissions(id)` — 15 rows: lease_termination.view ×3 roles, .change mgmt; company_document.view ×3, .send mgmt+dispatch; settlement.view mgmt+dispatch; invoice.view mgmt+dispatch; driver.deactivate mgmt; staff_account.suspend mgmt. Owner appears nowhere (P1). **SUPERDRIVE default** | every non-owner refused every gated action |
| 5 | `pay_policies` current company default (`pay_policies_single_company_default`) | "SUPERTRANSPORT Standard": linehaul/fsc/tonu/stopoff/loadout/per_ton/other 72, detention/layover/lumper 100, fuel passthrough false | **one version, effective_from 2000-01-01** — percentages: see question below | `company_pay_policy_on(company,date)` returns no row → accessorial adjustments, driver pay estimate, fuel view, linehaul mirror and settlement pricing find no rate |
| 6 | `settlement_settings` (pk company_id) | min net 100, R&M target 2000 / 200 wk, hold buffer 500, equipment value 1200, work week Wed (3) | **SUPERDRIVE default** = the platform defaults in project knowledge (100 / 2000 / 200 / Wed); hold buffer and equipment value arguably input | `my_rm_deposit` target NULL; settlement engine has no cycle/min-pay |
| 7 | `dispatch_settlement_rates` | dispatch 5%, factoring 2%, from 2026-01-01 | **Required input** (these are SUPERTRANSPORT's commercial terms) | `compute_dispatch_settlement` cannot price |
| 8 | `load_number_config` | prefix `ST`, year, next 70 | **Required input: prefix**; sequence starts 1 | see defect D1 below |
| 9 | `invoice_number_config` (unique company,year) | prefix `ST`, next 2 | **Required input: prefix**; row self-creates on first invoice | `allocate_invoice_number` auto-inserts with the column default prefix — must not be `ST` for carrier B |
| 10 | `unit_number_config` (one per company) | min 190, max 999, excluded 000/1900/1901 | **SUPERDRIVE default** (e.g. min 1, max 999, none excluded) or input | `unit_number_pool` raises "No unit number configuration" — onboarding unit picker errors |
| 11 | `carrier_signature_settings` (one per company) | typed "Marc Mueller", Owner, signature image | **Required input** (owner's name/title; image uploaded later) | ICA carrier signature absent; `is_carrier_default_signature_of_caller` false |
| 12 | `notification_role_defaults` (unique company,role,category) | 35 rows | **SUPERDRIVE default** — a platform matrix, not SUPERTRANSPORT data (they are role→category switches) | notifications fall back to per-user prefs only / nothing routed by role |
| 13 | `carrier_notification_settings` (unique company,email) | 2 addresses | **Required input** (recipient emails) or empty | carrier-wide notice emails go nowhere |
| 14 | `company_settings` (unique company,key) | `auto_cover_on_assignment=true` | **SUPERDRIVE default** true | readers default when absent (verify in part 2) |
| 15 | `fleet_settings` | DOT reminder 360 days | **SUPERDRIVE default** 360 | DOT due dates not computed |
| 16 | `inspection_program_settings` | bonuses 100/50/25, groups, grace, cap 150, submission_email inspections@mysupertransport.com | **program numbers: input or off; submission_email: required input** | grace requests / bonus flows find no config |
| 17 | `insurance_email_settings`, `dot_consultant_email_settings` | 1 each | **Required input** (third-party addresses) or empty | those sends have no recipient |
| 18 | `pei_cadence_settings` | follow-up 10d, GFE 30d, auto on | **SUPERDRIVE default** (10/30/on) | PEI cadence job skips carrier |
| 19 | `inspection_binder_order` (unique company,scope) | 2 | **SUPERDRIVE default** order | binder falls back / empty ordering |
| 20 | `staff_messaging_settings` | 0 rows | nothing | already works with none |
| 21 | Content still GLOBAL/DEFERRED: `pipeline_config` (9), `email_templates` (3), `message_templates` (5), faq, services, resources | shared | decision owed (stage 1 item) | carrier B sees SUPERTRANSPORT's content |
| 22 | Storage | no per-carrier bucket or folder; only `inspection-documents/company/` and `ica-signatures/carrier-default/` are carrier-bound (migration 0036, through the recording row) | nothing to create; the ~50 role-only storage policies remain the known debt | — |

### Defect found, not fixed (read-only part) — D1

`generate_load_number()` reads `load_number_config ORDER BY updated_at NULLS LAST LIMIT 1`
with **no company predicate** — the same class as stage 2's items, missed by stage 1 and
stage 2's search (it has no `carrier_profile` read, it picks a config row). At two carriers,
carrier B's loads would be numbered from SUPERTRANSPORT's `ST` sequence and advance it (the
per-company unique index prevents a collision, not the wrong prefix). Must be fixed before
carrier B dispatches a load: filter by `current_company_id()` and raise if no row.
Named here; not changed in this read-only part.

### The STOP question (asked, not assumed)

No default *requires* copying SUPERTRANSPORT's business data, so the pass did not stop.
But three values are borderline and the owner should say which they are:
- the **pay percentages** (72/100): project knowledge calls them the Pay Policy Engine
  *defaults*, which reads as a SUPERDRIVE default — or are they SUPERTRANSPORT's terms,
  making them a required input?
- **dispatch 5% / factoring 2%** — treated as required input above.
- the **inspection bonus programme** (100/50/25, cap 150) — treated as input-or-off.

## PART C — the inputs

**Must supply:** legal name; USDOT; MC; main office address; home terminal address;
home terminal timezone; FMCSA division state; applicant locality (city, state for
disclosures); apply slug; rate-con ingest address (or none — then inbound rate-cons for B
are dropped as unroutable, the stage 2 behaviour); load-number prefix; invoice-number
prefix; owner's first name, last name, email; carrier signature typed name and title;
dispatch % and factoring % (if they use dispatch settlements); inspection submission email;
notification / insurance / DOT-consultant recipient emails (may be blank).

**Defaults:** role permissions (seed), notification role matrix, settlement settings
(100 / 2000 / 200 / Wed), unit-number range, fleet 360-day DOT reminder, PEI cadence
10/30/on, binder order, `auto_cover_on_assignment`, company pay policy (pending the STOP question).

## PART D — the creation function (PROPOSED, not built)

```text
platform screen (is_platform_admin) --> edge function create-carrier
   1. getClaims(token); is_platform_admin(caller) else 403
   2. validate inputs (slug format, USDOT/slug/ingest-address uniqueness)
   3. AUTH STEP FIRST: auth.admin.createUser/inviteUserByEmail(owner email)
        -> owner_user_id   (or look up an existing user by email)
   4. DB STEP: service_role rpc create_carrier(p_inputs jsonb, p_owner uuid)
        one transaction: carrier_profile -> bootstrap_assign_owner(owner, id)
        [owner role + company_members] -> seed_role_permissions(id) -> pay_policies v1
        -> settlement_settings -> load/invoice/unit number configs -> signature settings
        -> notification_role_defaults -> fleet/pei/inspection/binder/company_settings
        -> audit_log 'carrier_created' (actor = the platform admin)
   5. on DB failure: delete the auth user created in step 3 (only if step 3 created it)
```

- `create_carrier` is SECURITY DEFINER, pinned, **EXECUTE service_role only**, takes the
  company id it generates and writes every row with an explicit `company_id`. Called only
  from the edge function, so `current_company_id()` is NULL and `stamp_tenant_company_id`
  keeps the explicit carrier (finding 1). It re-checks `is_platform_admin(p_actor)` inside,
  so a leaked service path still needs a platform actor.
- **Why auth first:** the auth account cannot join the DB transaction, and
  `bootstrap_assign_owner` requires the user to exist in `auth.users`. Doing the DB step
  first would leave a carrier with no owner.
- **Auth succeeds, DB fails:** the transaction rolled back entirely (no half carrier); the
  edge function deletes the just-created auth user. If that delete fails, an orphan login
  exists with no roles, no membership, no company — it can sign in to nothing; logged and
  surfaced to the platform admin to retry (the retry reuses the existing user by email).
- **DB succeeds, invite email fails:** the carrier is complete; the owner simply hasn't
  received his link. Resend from the platform screen. Never roll the carrier back for an
  email failure.
- **Owner email already a SUPERDRIVE user** (e.g. a driver at SUPERTRANSPORT): refuse by
  default — `current_company_id()` returns NULL for anyone resolving to two companies, so
  making him carrier B's owner would lock him out of both. Decision owed.
- Idempotency: unique slug/USDOT means a double-submit fails cleanly on the second call.

## Tests, typecheck

See the summary lines appended below.

## Files authored by this pass

- `drizzle/migrations/0056_platform_admins.sql` (+ drizzle meta journal/snapshot; `src/integrations/supabase/types.ts` regenerated automatically)
- `src/test/tenancy-resolver.test.ts`
- `src/test/definer-live-catalog.test.ts`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-1842-demo-carrier-stage-4-part-1.md`

No edge functions changed; no deploys.
