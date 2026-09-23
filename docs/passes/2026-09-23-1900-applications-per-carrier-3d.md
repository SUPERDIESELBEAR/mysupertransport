# Demo carrier — stage 3, pass 3d of 5: the per-carrier apply link, and the right carrier's identity on the applicant's paperwork

2026-09-23, ~19:00 UTC. BUILD MODE. Four migrations, one new test file, two edge-function deploys.
No second carrier committed. Every two-carrier proof ran inside a transaction that raised.

---

## STEP 0 — the contradiction, settled live

3b said `anon` held **no** privilege on `applications`; 3c said it held an unused `INSERT`.
**3c was right about the grant, 3b was right about the outcome.** Live `pg_class.relacl` before
this pass contained `anon=a/postgres` — a real INSERT grant. The 42501 that 3b observed came from
**RLS**, not from the grant: `applications` has no permissive INSERT policy admitting `anon`, so
the privilege was unreachable and unused.

Migration `0048` revokes it. The ACL now reads:

```
{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,
 sandbox_exec_qgxpkcudwjmacrdcyvhj=ar/postgres,sandbox_exec=ar/postgres}
```

No `anon` at all, on any privilege. The public form still works, because it never used the grant —
it goes through `save_application_draft` and `submit_application_draft`, both SECURITY DEFINER.
Proven after the revoke: two throwaway drafts saved by a genuine anonymous caller holding only the
publishable key (Step 4).

## STEP 1 — the link

`carrier_profile.apply_slug`, nullable, with:

- `CHECK carrier_profile_apply_slug_format` — lowercase letters, digits and hyphens, 1–32 chars.
- `UNIQUE INDEX carrier_profile_apply_slug_unique ON (lower(apply_slug)) WHERE apply_slug IS NOT NULL`.

**SUPERTRANSPORT's slug: `supertransport`** — its own registered name, lower-cased. No new
public-facing name was invented. The link is:

```
https://gosuperdrive.com/apply/supertransport
```

Also added: `carrier_profile.applicant_locality` (`'Pleasant Hill, Missouri'`), so the locality on
applicant paperwork comes from the carrier record instead of a constant in the page. Street address
is deliberately NOT in the public reader — applicant documents print locality only, as before.

Routes, `src/App.tsx`:

| route | behaviour |
|---|---|
| `/apply` | **unchanged while one carrier exists** — the sole carrier answers. Once two exist the public reader returns NO ROW and the page asks the applicant to use his carrier's own link. It never guesses. |
| `/apply/:slug` | that carrier, resolved server-side from the slug. |
| unknown slug | *"This application link is not valid — we do not recognise this link, so nothing has been started or saved. Check the link the recruiter sent you, or ask them for a fresh one."* Nothing is written. |

## STEP 2 — how the carrier reaches the database

The browser sends `carrier_slug`, **never a carrier id**. `save_application_draft` resolves it
itself against `carrier_profile` and raises `unknown_carrier` on a miss.

One defect was found and fixed by the two-carrier proof, which is exactly what it is for. The 3b
stamp trigger could not tell a carrier **resolved from a slug** apart from one a browser had typed
into the payload, so it discarded it and fell back to "the sole carrier, or refuse" — and refused
every linked application the moment a second carrier existed. The first proof run failed on it:

```
ERROR: 42501: Cannot decide which carrier this public.applications row belongs to:
2 carriers exist and the caller resolves to none.
```

Fix, migrations `0050` + `0051`: `save_application_draft` announces the carrier it resolved in a
**transaction-local** setting (`app.apply_link_company`), and the trigger trusts `NEW.company_id`
only on an **exact match** with that announcement. The browser cannot set it — the definer RPC is
its only writer and it dies with the transaction. Precedence is now:

1. signed-in staff → their own carrier; a disagreeing supplied carrier is REFUSED
2. `service_role` naming a carrier explicitly → trusted
3. the carrier this transaction resolved from an apply slug → trusted on exact match
4. anonymous with no link → the sole carrier while there is one, **refuse** at two or more

`submit_application_draft` is untouched: it keeps the draft's carrier. A returning applicant's
carrier comes from his **draft**, not the URL — `carrier_identity_for_draft(p_draft_token)` — so a
resumed application always shows the carrier it was filed under.

## STEP 3 — the letterhead

`DEFAULT_COMPANY_IDENTITY` is **deleted**. There is no longer any hard-coded carrier identity
anywhere in the application documents.

`carrier_public_identity(p_slug text DEFAULT NULL)` — SECURITY DEFINER, STABLE, EXECUTE to `anon`,
`authenticated`, `service_role` — returns **exactly five fields and nothing else**:

`legal_name`, `applicant_locality`, `usdot_number`, `mc_number`, `apply_slug`

No internal ids, no street address, no phone, no bank or insurance data. `carrier_identity_for_draft`
returns the same five, joined from the draft's carrier.

`identityFromProfile()` now returns `CompanyIdentity | null` and **refuses** when any of legal name,
locality, USDOT or MC is missing. All five documents that print carrier identity — FCRA
Authorization, Pre-Employment Authorizations, DOT Drug & Alcohol Questions, Company Testing Policy
Certificate, and the staff-side Application Print Document — render
`<CarrierIdentityUnavailable>` instead of printing anyone's details.
`generate-application-pdf` returns 500 with a plain sentence and generates nothing.

Regression caught and fixed in the same pass: `/pei-release/:token`, the applicant's tokenized FCRA
viewer, is anonymous and cannot read `carrier_profile` directly. `pei-release-fcra` now returns the
carrier with the release, and the sample path resolves the sole carrier.

## STEP 4 — the proofs

**Both routes, in a real browser, after the change:**

| route | rendered |
|---|---|
| `/apply` | SUPERTRANSPORT, LLC ✓ · Pleasant Hill ✓ · USDOT 2309365 ✓ · MC 788425 ✓ |
| `/apply/supertransport` | SUPERTRANSPORT, LLC ✓ · Pleasant Hill ✓ · USDOT 2309365 ✓ · MC 788425 ✓ |
| `/apply/no-such-carrier` | the not-found message, no form, nothing saved |

Those are the carrier's exact current values and match what the page printed before this pass, when
they were constants in the code. No page errors on any route.

**Throwaway applicants**, as a genuine anonymous caller with only the publishable key: a draft
through `/apply/supertransport` (with the slug) and a draft through the bare route (no slug). Both
landed on SUPERTRANSPORT, and `carrier_identity_for_draft` returned SUPERTRANSPORT for each token.
Both deleted afterwards.

**With a scratch carrier, inside a transaction that raised:**

```
ours   = {legal_name: SUPERTRANSPORT, LLC,      usdot 2309365, mc 788425, slug supertransport}
theirs = {legal_name: SCRATCH DEMO CARRIER, LLC, usdot 9999999, mc 999999, slug scratch-demo}
bare identity rows with two carriers = 0 (expected 0)
linked draft landed on = 9372dda3… = the scratch carrier
bare save   = REFUSED (42501): Cannot decide which carrier this row belongs to…
unknown slug = REFUSED (P0001): unknown_carrier
ERROR: P0001 ROLLED BACK ON PURPOSE
```

**Residue, live, afterwards:** 1 carrier, 347 applications, **0** with no carrier, **0** probe or
throwaway rows, 0 unexpired resume tokens. (347, not 346 — one ordinary application arrived through
normal staff work since 3c.)

## STEP 5 — where staff find the link

In **Invite Someone to Apply**, directly above the invite form — the place staff already go when
they want someone to apply. `src/components/management/ApplyLinkCopyField.tsx` shows the full link
with a **Copy** button and one line of plain guidance. The slug is read from `carrier_profile`
under RLS, so a staff member only ever sees their own carrier's link.

## Guards

New `src/test/apply-link-identity.test.ts` (7 live checks): the two public readers return **exactly**
the five fields (a sixth fails the test — it would be a public leak out of `carrier_profile`);
`anon` can call both; `anon` holds **no** privilege on `applications`; the stamp trigger trusts only
an exact match on the transaction-local announcement; `save_application_draft` resolves the slug
itself, refuses an unknown one, and never reads a carrier id from the payload; the slug index is
unique on `lower(apply_slug)` and the format check exists; SUPERTRANSPORT's slug resolves to
SUPERTRANSPORT and an unknown slug returns no row.

Migration `0049` grants EXECUTE on the two readers to the `sandbox_exec` harness role only
(0047 precedent), re-revoking nothing that was public.

`src/test/resume-gate-ui.test.tsx`'s identity stub was updated to the new module shape rather than
loosened — it now supplies a resolved carrier so the resume gates still render.

## Owed later, not now

`applications_email_non_draft_unique` still carries no carrier: **one live application per email
holds across all carriers**. The owner's call before a second carrier recruits.

## Files this pass authored

- `drizzle/migrations/0048_apply_slug_public_identity.sql`
- `drizzle/migrations/0049_public_identity_execute_to_sandbox_exec.sql`
- `drizzle/migrations/0050_apply_link_company_trusted_by_stamp.sql`
- `drizzle/migrations/0051_save_draft_announces_link_carrier.sql`
- `supabase/functions/_shared/application/identity.ts`
- `supabase/functions/generate-application-pdf/index.ts`
- `supabase/functions/pei-release-fcra/index.ts`
- `src/lib/application/identity.tsx` (replaces the deleted `identity.ts`)
- `src/components/application/documents/CarrierIdentityUnavailable.tsx`
- `src/components/application/documents/FCRAAuthorizationDoc.tsx`
- `src/components/application/documents/PreEmploymentAuthorizationsDoc.tsx`
- `src/components/application/documents/DOTDrugAlcoholQuestionsDoc.tsx`
- `src/components/application/documents/CompanyTestingPolicyCertDoc.tsx`
- `src/components/management/ApplicationPrintDocument.tsx`
- `src/components/management/ApplyLinkCopyField.tsx`
- `src/components/management/InviteApplicantModal.tsx`
- `src/pages/ApplicationForm.tsx`
- `src/pages/PEIRelease.tsx`
- `src/App.tsx`
- `src/integrations/supabase/types.ts` (regenerated)
- `src/test/apply-link-identity.test.ts`
- `src/test/resume-gate-ui.test.tsx`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-1900-applications-per-carrier-3d.md`

## Deploys

`generate-application-pdf` and `pei-release-fcra` deployed and confirmed live.

Next: **3e — `company_id` NOT NULL, and the fixtures.**

---

## Checks

Full suite, `--maxWorkers=2`, verbatim:

```
 Test Files  7 failed | 213 passed | 2 skipped (222)
      Tests  11 failed | 2209 passed | 16 skipped (2236)
     Errors  2 errors
   Duration  851.89s (transform 11.55s, setup 118.87s, collect 72.91s, tests 842.07s, environment 463.64s, prepare 72.23s)
```

**Ten of the eleven were real, caused by this pass, and are fixed — not silenced.**
They were the standing security guards doing their job:

1. **`definer-search-path` — the pin.** `carrier_public_identity`, `carrier_identity_for_draft`
   and the re-authored `save_application_draft` were pinned to `'public'` alone; the convention
   requires `public, extensions`. Migration **`0052`** pins all three (settings only, no body
   change). The stale legacy-allowlist entry for `save_application_draft` was **deleted** and
   `LEGACY_MAX` lowered 72 → 71, which is the only direction that list may move.
2. **`definer-live-catalog` — the two new anon-callable readers** were not in the inventory.
   Registered in `KNOWN_ANON_EXECUTABLE_ENTRIES` and `KNOWN_AUTHENTICATED_EXECUTABLE`, each with
   the route it serves and the five fields it is limited to; `KNOWN_ANON_EXECUTABLE_MAX` 31 → 33
   and `KNOWN_AUTHENTICATED_EXECUTABLE_MAX` 139 → 141, each raised by exactly the number added.
3. **`definer-live-catalog` — `anon` table privileges.** The guard still expected
   `applications: INSERT`. That expectation is now **`faq: SELECT` alone** — the list shrank,
   which is the whole point of Step 0.
4. **`grant-parity-live` — a dead policy.** With the grant revoked, the permissive policy
   `"Public can submit application with email"` named `anon` while `anon` held no INSERT grant.
   Migration **`0053`** re-declares it as `"Signed-in applicant can submit application with email"`
   `TO authenticated` — the identical predicate, no widening, and nothing anonymous loses anything
   it could reach.
5. **`resume-token-reuse`** asserts the newest migration must not redefine
   `save_application_draft`. `0053` is now the newest and does not.

The eleventh failure, `billing-schema`, was the familiar pooler `EAUTHQUERY` timeout — untouched
by this pass and green on re-run.

Re-run of exactly the affected files after the fixes:

```
 Test Files  5 passed (5)
      Tests  38 passed (38)
```

plus `billing-schema` + `resume-gate-ui`: `2 passed (2) / 41 passed (41)`. Type check clean.

Two further migrations authored by these fixes:

- `drizzle/migrations/0052_pin_apply_identity_search_path.sql`
- `drizzle/migrations/0053_applications_public_insert_authenticated_only.sql`

and two further test files touched:

- `src/test/definer-live-catalog.test.ts`
- `src/test/helpers/legacyPublicOnlyPins.ts`
