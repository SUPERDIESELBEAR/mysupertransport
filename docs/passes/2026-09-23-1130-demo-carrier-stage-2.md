# Demo carrier, stage 2 of 6 — the five day-one breaks, fixed

Date: 2026-09-23 11:30 UTC
Scope: BUILD. One migration (`0042_carrier_scoped_pay_resolver_and_bootstrap.sql`), two
edge functions, four test/helper files, one new test file. **No second
`carrier_profile` row was committed.** Both proofs ran inside transactions that
end in `RAISE EXCEPTION`, so the scratch carrier never survived the statement.
Live carrier count before and after: **1** (SUPERTRANSPORT, LLC, USDOT 2309365).

Nothing in stage 1's Step 5 first list contradicted the live system.

---

## ITEM 1 — `company_pay_policy_on` had no company predicate

**Before.** One resolver answered for everybody: `is_company_default AND is_active`
inside the date window, `ORDER BY effective_from DESC … LIMIT 1`. Four SECURITY
DEFINER callers ran it with RLS not applied, so a second rate sheet would have
priced SUPERTRANSPORT's work.

**After.** `company_pay_policy_on(_company uuid, _as_of date)`. The old one-argument
form is **dropped** — no client, edge function or other routine called it, so no
no-argument form was kept. A NULL company resolves to **no row**, never to a carrier.

Where each caller gets its company:

| caller | company from |
| --- | --- |
| `create_accessorial_adjustment` | the adjustment's `loads.company_id` |
| `driver_load_pay_estimate` | the signed-in driver's `operators.company_id` |
| `my_fuel_transactions` | the fuel row's `fuel_transactions.company_id` |
| `sync_operator_linehaul_pct_mirror` | each driver's own `operators.company_id`, in a LATERAL per row |

**Proof** (scratch carrier B with a rate sheet at 41% starting today, so an
unfiltered resolver prefers it; transaction raised, nothing committed):

```
BEFORE (unfiltered, one answer for everybody): SCRATCH CARRIER B / SCRATCH B DEFAULT / 41%
AFTER company_pay_policy_on(company, date):
   SUPERTRANSPORT, LLC (USDOT 2309365) -> SUPERTRANSPORT Standard / 72.00%
   SCRATCH CARRIER B (USDOT 9999999) -> SCRATCH B DEFAULT / 41%
AFTER, NULL company -> 0 rows
CALLER 1 create_accessorial_adjustment, company from the LOAD:
   load ST26069 -> SUPERTRANSPORT, LLC -> 72.00%
   load ST26064 -> SUPERTRANSPORT, LLC -> 72.00%
CALLER 2 driver_load_pay_estimate, company from operators: 159 drivers, pct min 72.00 max 72.00
CALLER 3 my_fuel_transactions, company from the fuel row: 69 rows, distinct passthrough answers 1
CALLER 4 mirror: the OLD single scalar would have written 41% to 159 drivers
CALLER 4 mirror now moves 0 operators; distinct pay_percentage after: 72
```

The mirror line is the sharpest one: the old body would have rewritten every one of
the 159 drivers to the other carrier's 41%.

---

## ITEM 2 — `receive-rate-con-email`'s `soleCompanyId`

**How the mail identifies its carrier.** The Resend `email.received` payload carries
the sender (a broker — identifies nothing), the subject (free text), the attachments
and the **recipient list**. The recipient is the only signal that can name a carrier,
and each carrier needs its own parse mailbox anyway, so the recipient is the routing
key: new column `carrier_profile.rate_con_ingest_address`, unique on
`lower(address)` where not null.

Backfilled to `rates@parse.mysupertransport.com` for USDOT 2309365 — confirmed from
the five existing `rate_con_ingest_queue` rows, which were all delivered there.

`companyIdForIngestRecipient` (in `_shared/tenancy.ts`) normalises case, a display
name and any `+tag`, refuses to choose when two carriers claim one address, and
returns null when nobody claims it. The function then falls back to `soleCompanyId`
**only while one carrier exists**, logging a warning; with two carriers an unclaimed
recipient is dropped as `unroutable_recipient` rather than filed under a guess.

**Proof** (same raising transaction, plus `src/test/ingest-recipient-routing.test.ts`,
7 tests):

```
ITEM 2 recipient -> carrier:
   rates@parse.scratch-b.test -> SCRATCH CARRIER B
   rates@parse.mysupertransport.com -> SUPERTRANSPORT, LLC
   unknown@example.com -> 0 carriers
```

---

## ITEM 3 — `bootstrap_assign_owner`'s bare scalar subquery

Now `bootstrap_assign_owner(p_user_id uuid, p_company_id uuid DEFAULT NULL)`.
EXECUTE is service_role only — it is a setup tool, reachable from the
`bootstrap-admin` function, never from a browser. With the company omitted it counts
the carriers and **refuses** unless there is exactly one; a named company must exist.

```
ITEM 3 unnamed company -> SQLSTATE 42501 — bootstrap_assign_owner must be given p_company_id:
        2 carrier_profile rows exist, so the company cannot be inferred.
ITEM 3 named company B: owner assigned, user_roles rows for B = 1, membership = 1
ITEM 3 unknown company -> SQLSTATE 23503 — No such company 78743bef-…; an owner cannot be bootstrapped for it.
```

---

## ITEM 4 — the tests that assumed one carrier

Nine bare `(SELECT id FROM public.carrier_profile)` scalars in
`src/test/tenancy-resolver.test.ts`, the `ORDER BY created_at LIMIT 1` member pick at
:411/:414/:420, `src/test/helpers/tenancy.ts`'s `AS_COMPANY_MEMBER`, and
`src/test/invoice-dispatch-reconciliation.test.ts:118` now all name SUPERTRANSPORT
explicitly by USDOT 2309365, which is unique.

With scratch carrier B present in the same transaction:

```
two carriers now visible: 2
OLD bare scalar: SQLSTATE 21000 — more than one row returned by a subquery used as an expression
NEW USDOT-named scalar -> 6b54d0e6-8743-4284-b55b-8cd094b093dd (SUPERTRANSPORT: SUPERTRANSPORT, LLC)
NEW member pick -> company 6b54d0e6-8743-4284-b55b-8cd094b093dd
NEW rate-sheet pick -> SUPERTRANSPORT Standard / 72.00%
```

The old shape errors out; the new shape answers SUPERTRANSPORT. Targeted run of the
three affected files: **3 files, 138 tests, all passed.**

---

## ITEM 5 — `generate-application-pdf`'s arbitrary carrier read

It read `carrier_profile` with `.limit(1)`. It now resolves the company from the
application it is rendering — `applications.company_id` when present, otherwise
`companyIdForUser(admin, userId)` — and reads `carrier_profile` by `id`. If the
identity cannot be resolved it returns a 500 with a plain sentence and generates
nothing, rather than printing another carrier's name and DOT on a signed document.

Once applications are per-carrier (stage 3) `applications.company_id` becomes the
only source; in the meantime the membership of the requesting staff member is the
fallback, which is SUPERTRANSPORT for every current user.

---

## Other unfiltered `carrier_profile` reads found

| place | verdict |
| --- | --- |
| `_shared/tenancy.ts:103` `soleCompanyId` | kept deliberately — it **refuses** on a second row; it is the fail-closed helper, not a guess |
| `process-eld-escalations:251`, `send-officer-packet:248` | **left, named here.** Same class, but they print the DOT identity on ELD paperwork and belong with the ELD carrier-identity work; stage 1 ordered them after the day-one five |
| `src/lib/application/identity.ts`, `src/lib/eld/offline/hydrate.ts`, `ELDExtensionRequests.tsx` | client reads under RLS — a browser only ever sees its own carrier's row, so `.limit(1)` is already correct |
| `recompute_eld_extension_projection`, `seed_role_permissions` | already carrier-safe (USDOT-filtered / takes and validates `_company_id`) |

---

## Verification

- Typecheck `bunx tsgo --noEmit`: clean, exit 0.
- Full suite `bunx vitest run --maxWorkers=2`, verbatim:

  ```
   Test Files  2 failed | 217 passed | 2 skipped (221)
        Tests  2 failed | 2210 passed | 16 skipped (2228)
       Errors  2 errors
      Start at  11:16:50
      Duration  596.13s
  ```

  Both failures are the familiar transient pooler failure
  (`FATAL: (EAUTHQUERY) auth_query secret check timed out`) in
  `dispatch-settlement-schema` and `payments-schema`, neither touched by this pass.
  Re-run of exactly those two files: **2 files, 48 tests, all passed.**
- Deploys: `receive-rate-con-email` and `generate-application-pdf` both deployed and
  probed live — the first answers `401 Invalid signature` to an unsigned webhook, the
  second `401 Unauthorized` to an anonymous call, so both boot and both still refuse
  in the right order.
- Live state after the pass: 1 carrier, 1 current company rate sheet at 72.00,
  159 drivers at 72, settlement f77911b0 untouched.

## Files this pass authored

- `drizzle/migrations/0042_carrier_scoped_pay_resolver_and_bootstrap.sql`
- `supabase/functions/_shared/tenancy.ts`
- `supabase/functions/receive-rate-con-email/index.ts`
- `supabase/functions/generate-application-pdf/index.ts`
- `src/test/ingest-recipient-routing.test.ts` (new)
- `src/test/tenancy-resolver.test.ts`
- `src/test/invoice-dispatch-reconciliation.test.ts`
- `src/test/helpers/tenancy.ts`
- `docs/passes/2026-09-23-1130-demo-carrier-stage-2.md`
- `roadmap.md`
