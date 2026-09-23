# Pass report — 2026-09-23 21:20 UTC — demo carrier, stage 4, part 2b

The carrier creation path, the load-number fix (D1), and a platform-only screen.
**No carrier B created.** The prompt arrived complete (last line: "END OF PROMPT…").
Nothing below contradicted the live system. Two things are worth recording (see "Notes on the live system").

## Step 1 — owner answers recorded (P44–P47)

Recorded word for word in `docs/tms-build-status.md` (entry 2026-09-23 21:20 UTC).

## Step 2 — D1, `generate_load_number()`

It now reads `load_number_config WHERE company_id = current_company_id()`. It refuses with
42501 when the caller has no carrier, and with P0002 when the carrier has no numbering row.
It no longer falls back to "the first row".

Proof, in a transaction that raises, with a throwaway carrier made by `create_carrier`:

```text
ST next load before: ST26070, next invoice before: ST26-0002
Owner first load number: PC26001
Owner carrier first invoice number: PCI26-0001
ST next load after: ST26070, next invoice after: ST26-0002
carrier with no load numbering: P0002 This carrier has no load numbering configured; ...
```

The invoice change from 2a gives the new carrier its own prefix. Its row is written by
`create_carrier`, so `allocate_invoice_number` never has to create a row with a default prefix.

## Step 3 — `create_carrier(p_inputs jsonb, p_owner uuid, p_actor uuid)`

Migration `0058_create_carrier_and_load_number_d1.sql`. It is SECURITY DEFINER with search
path pinned to `public, extensions`. EXECUTE is granted to service_role only; PUBLIC, anon and
authenticated are revoked. It re-checks `is_platform_admin(p_actor)` (42501).

- **Refusals:** a missing required input is refused with 22023 and the field named in HINT.
  Wrong formats are refused too: slug, USDOT digits, two-letter state, a known time zone,
  emails, and percentages from 0 to 100. A USDOT, slug or ingest address already in use is
  refused with 23505. **P47:** in a dry run, the owner email must not exist in `auth.users`. In a
  real run, the owner account must match the email and hold no membership, role, operator row or
  truck-owner row.
- **Write order:** every row gets the explicit new company_id, in this order:
  1. carrier_profile (apply_slug, applicant_locality, fmcsa_division_state, rate_con_ingest_address)
  2. bootstrap_assign_owner
  3. seed_role_permissions (15 rows)
  4. pay policy v1 (P44 values or those supplied; effective_from 2000-01-01)
  5. settlement_settings (100 / 500 / 1200 / 2000 / 200 / Wed)
  6. **dispatch_settlement_rates (P45, required input)**
  7. load, invoice and unit number configs with the carrier's own prefixes (units 1–999, none excluded)
  8. carrier_signature_settings
  9. notification_role_defaults (the 35-row SUPERDRIVE matrix)
  10. fleet_settings (360)
  11. pei_cadence_settings (10 / 30 / on)
  12. inspection_binder_order (2 rows)
  13. company_settings (auto_cover_on_assignment true)
  14. inspection_program_settings (**programme_enabled false**, the carrier's own submission email)
  15. audit_log `carrier_created` (actor = the platform operator)
- **Added to the prompt's order:** dispatch_settlement_rates. P45 makes those percentages
  required, and this table is where they live.
- **audit_log has no company_id column.** The company is recorded in `entity_id` and `metadata.company_id`.
- **Billing stamp:** `stamp_billing_company_id` needed one narrow exception. The rule is:
  service_role, no resolvable caller company, and a company equal to the transaction-local
  `app.creating_carrier` that only `create_carrier` sets. Without it, `invoice_number_config`
  would be stamped NULL and refused. Every other caller is unchanged.
  Migration `0059` adds COALESCE around both session sources, because the definer fail-open
  guard caught the first version.
- **Not written:** carrier_notification_settings, insurance and DOT-consultant recipients. Part C
  allows these to be blank, and the prompt's order leaves them out. The carrier sets them later
  on its own settings screens.

## Step 4 — `create-carrier` edge function

1. getClaims(token) → sub. No token → 401. `is_platform_admin(sub)` false → 403.
2. zod validates the body shape.
3. **The full database step always runs first as a dry run.** Every input rule, including P47,
   is checked before any login exists. `dry_run: true` stops here and returns the plan.
4. It creates the owner's login.
5. It calls `create_carrier` for real.
6. If the database step fails, it deletes the login it just created. If that delete fails, it
   reports the orphan id.
7. On success it generates an invite link and emails the owner. If the email fails, the
   carrier is kept and `invite_sent: false` is returned.

**How the owner step is proved without an auth account in a dry run:** the dry run checks P47
and records the two owner rows it would write, but does not call `bootstrap_assign_owner`.
That call needs a real `auth.users` row. The real owner step was proved separately, inside a
raising transaction with a throwaway `auth.users` row (Step 6).

**Deploy confirmation:** the function was deployed and then called for real:
- no token → 401
- Mae, Leo and the onboarding-only login → 403
- Marcus's check-only run → 200 with the plan

## Step 5 — platform screen

- **Route:** hidden route `/platform/carriers/new`, with no menu entry. The page asks
  `is_platform_admin` and shows Not Found to anyone else. The function and the database are the
  real gates.
- **Form:** the form covers Part C's inputs, with the P44 percentages pre-filled.
- **Buttons:** "Check only" runs the dry run. A separate "Create carrier" button opens a
  confirmation that names the carrier: "Create Proof Carrier LLC? This creates Proof Carrier LLC
  as a new carrier on SUPERDRIVE, makes … its owner and emails them a sign-in link."
- **Reachability test:** the AWAITING entry for `is_platform_admin` was removed from
  `function-reachability.test.ts` (KNOWN_NO_CALLER_MAX 3 → 2).

## Step 6 — proofs (nothing committed)

**Check only from the screen as Marcus** (Playwright, real session):
- missing factoring % → "Missing required input: factoring_pct (field: factoring_pct)"
- slug `supertransport` → "The apply link name "supertransport" is already taken."
- valid inputs → all 17 row groups listed: carrier_profile 1, owner 2, role_permissions 15,
  pay_policies 1 (72/100 values), settlement_settings 1, dispatch rates 1, load/invoice/unit
  configs 1 each (PC26001, PCI26-0001), signature 1, notification defaults 35, fleet 1, PEI 1,
  binder 2, company_settings 1, inspection programme 1 (OFF), audit 1
- the confirmation dialog names the carrier; it was cancelled

**Mae, Leo, onboarding-only:** for each, the screen was not reachable (Not Found) and the function returned 403.

**Database refusals** (raising transaction, service_role):

```text
missing legal_name: 22023 Missing required input: legal_name [field legal_name]
missing factoring_pct: 22023 ... [field factoring_pct]
dup slug: 23505 The apply link name "supertransport" is already taken. [field apply_slug]
dup usdot: 23505 A carrier with USDOT 2309365 already exists. [field usdot_number]
bad slug: 22023 ... [field apply_slug]
existing email (Mae): 23505 ... already belongs to a SUPERDRIVE user ... [field owner_email]
actor Mae: 42501 Only a SUPERDRIVE platform operator can create a carrier.
Marcus signed-in direct call: 42501 permission denied for function create_carrier
```

**Real run with a throwaway owner** (raising transaction):

```text
filed under new carrier: roles=1 members=1 perms=15 pay=1 settle=1 dsr=1 lnc=1 inc=1 unc=1
  sig=1 nrd=35 fleet=1 pei=1 binder=2 cs=1 insp=1 enabled=false audit=1 actor=Marcus Mueller; ST owners=1
Owner: resolves to new carrier=true owner_role=true pay_policy.change=true settlement.view=true
  platform_admin=false | sees loads=0 operators=0 applications=0 settlements=0
  dispatch_settlements=0 pei_requests=0 | own pay policies visible=1
Marcus / Mae / Leo see new carrier: pay=0 perms=0 roles=0 settle=0 lnc=0 inc=0 insp=0 pei=0
```

**Residue after the pass:**
- carriers 1; proof auth users 0; `carrier_created` audits 0
- ST next load ST26070; next invoice ST26-0002
- owners 1, members 16, pay policies 1, role_permissions 15

The throwaway auth row existed only inside the rolled-back transaction. No session files were kept.

## Notes on the live system

- Applications went from 347 to 349 during the day. These are real applicants; this pass did not touch them.
- The owner invite email is sent from `onboarding@mysupertransport.com`, the shared sending
  domain. This is still an open owner decision (7).

## Tests, typecheck

Full suite, `npx vitest run --maxWorkers=2`, verbatim:

```text
 Test Files  5 failed | 217 passed | 2 skipped (224)
      Tests  5 failed | 2221 passed | 16 skipped (2242)
   Start at  21:16:31
   Duration  572.77s (transform 5.99s, setup 37.05s, collect 33.90s, tests 832.50s, environment 159.77s, prepare 24.16s)
```

- **One real failure: `definer-fail-open`.** The new billing-stamp guard had no COALESCE around
  its session sources. Fixed in migration 0059.
- **Four were the familiar pooler timeout, `EAUTHQUERY auth_query secret check timed out`:**
  billing-schema, share-token-throttle, operator-pay-exposure, operator-settlement-isolation.
- **Rerun** of those five plus function-reachability, definer-live-catalog and
  accessorial-adjustment-schema: `Tests 1 failed | 133 passed (134)`. The one failure was a
  fresh EAUTHQUERY in accessorial-adjustment-schema; that file alone gave `Tests 57 passed (57)`.
- Typecheck (`npx tsgo --noEmit -p tsconfig.app.json`): clean.

## Files authored by this pass

- `drizzle/migrations/0058_create_carrier_and_load_number_d1.sql`, `0059_billing_stamp_coalesce_session_sources.sql` (+ drizzle meta; `src/integrations/supabase/types.ts` regenerated)
- `supabase/functions/create-carrier/index.ts`, `supabase/config.toml` (function entry)
- `src/pages/platform/CreateCarrierPage.tsx`, `src/App.tsx` (hidden route)
- `src/test/function-reachability.test.ts`
- `docs/tms-build-status.md`, `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-2120-demo-carrier-stage-4-part-2b.md`

Stage 4 is complete. **Next: stage 5 — create carrier B for real, from the screen.**
