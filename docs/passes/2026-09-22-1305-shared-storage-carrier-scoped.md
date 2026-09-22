# Pass report — 2026-09-22 13:05 UTC

## Scope

The three error-level scanner findings on `storage.objects`, closed on the owner's
instruction of 2026-09-22: scope the two shared folders **by company**, the way the
tenancy rules do, and prove nothing that legitimately uses those files breaks.

Not in scope, unchanged: P31 pay-policy versioning remains BLOCKED on the two owner
answers recorded in `docs/passes/2026-09-22-1230-pay-policy-history.md`.

## The defect, confirmed live before the fix

Three SELECT policies each carried a branch with **no binding at all**:

| bucket | prefix | policies |
|---|---|---|
| `inspection-documents` | `company/` | Drivers can view company and own inspection docs |
| `ica-signatures` | `carrier-default/` | Truck owners can view contractor signature; Operators can view their own ICA signatures |

Measured in a raising transaction, as the real accounts, with the pre-fix policies
restored inside it:

```text
BEFORE driver    -> shared inspection docs: 7
BEFORE applicant -> shared inspection docs: 7   (the hole)
BEFORE applicant -> carrier signature: 1        (the hole)
```

The applicant (`b6e096f0`) holds no `company_members`, `operators` or `truck_owners`
row at all. Any signed-in account could read the carrier's authority, IFTA licence,
insurance certificate, UCR, state permits, ELD procedures and the owner's signature
image.

## The fix

**Migration 0035** — each object is bound to ITS company through the row that
records it, not through a membership test:

- `public.inspection_documents(file_path, company_id)` for `company/`
- `public.carrier_signature_settings(signature_url, company_id)` for `carrier-default/`

compared with `public.current_company_id()` — the same resolver the tenant policies
use, which returns NULL unless exactly one company resolves, so an applicant fails
closed. Wrapped in `(SELECT ...)` so it evaluates once per statement, the defect
0028 had to fix on the pay-policy policies. The per-driver
(`driver/<auth.uid()>/`) and per-truck-owner branches were already bound correctly
and are unchanged.

**Migration 0036 — a regression of my own, caught by the proof.** 0035's first
measurement showed drivers and truck owners going from 1 to **0** carrier
signatures. A policy subquery runs as the CALLER, and
`carrier_signature_settings` is staff-only with a restrictive `tenant_isolation`
over it, so the `EXISTS` could never be true for a driver however right his company
was — the agreement screen would have shown a broken signature image. Resolved the
way this database already solves it: two `SECURITY DEFINER` helpers with pinned
search paths, `public.is_company_inspection_doc_of_caller(text)` and
`public.is_carrier_default_signature_of_caller(text)`, EXECUTE to `authenticated`
and `service_role` only, revoked from PUBLIC and `anon`. Each answers one boolean
about one path, and only ever about the caller's own carrier.

`inspection_documents` got the same treatment although it happened to work — it only
worked because its own SELECT policy lets any signed-in user read `company_wide`
rows, i.e. by leaning on a permission broader than it should be.

This is the second time in two days that a fix of mine was caught by its own proof
(the first was 0032's PUBLIC grant). Both were caught because the proof asserts who
must STILL be able to do the thing, not only who must not.

## Proof after 0036, one raising transaction, rolled back

```text
driver 1   shared inspection docs : 6
driver 1   carrier signature      : 1
driver 1   ANOTHER driver's files : 0   (expected 0)
driver 2   shared inspection docs : 6
driver 2   carrier signature      : 1
truckowner carrier signature      : 1
truckowner own contractor sig     : 1
applicant  shared inspection docs : 0   (expected 0)
applicant  carrier signature      : 0   (expected 0)
```

## The 7 -> 6, stated plainly

`company/accident-packet/1774527172990.pdf` has **no `inspection_documents` row**,
so the company-bound branch does not match it. It is not lost and no screen breaks:
it is served by `public.resource_documents` as a stored **signed** URL valid to
2031, and a signed URL does not consult RLS at all. The drivers' Resources screen is
unaffected. The signed-out `/inspect` share link is likewise unaffected — it reads
the `file_url` signed at upload time and never SELECTs `storage.objects` as a
client.

## Recorded limit, not hidden

Neither shared prefix carries a company segment (`company/...`,
`carrier-default/...`). The binding works because the owning ROW does. **If a second
carrier is ever onboarded, new shared uploads must be pathed
`company/<company_id>/...`** so the object is self-describing without its row. In
the migration comment and asserted by the test.

## Tests

`src/test/shared-storage-carrier-scoped.test.ts`, new — 9 checks: migration text
(all three policies named, resolver used, both helpers definer with pinned
search_path, never granted to PUBLIC/anon, undo comment, the path limit recorded)
and three live checks against `pg_policies` (no shared branch left unbound, both
helpers definer and not anon-executable, the per-person branches still bound to
`auth.uid()`).

`definer-live-catalog.test.ts` refused the two new helpers until they were declared:
`KNOWN_AUTHENTICATED_EXECUTABLE` gained both entries with the reason beside them, and
the ceiling went 135 -> 137, raised by exactly two. Not allowlisted silently.

```text
 Test Files  3 passed (3)
      Tests  26 passed (26)
```

(`shared-storage-carrier-scoped` 9, `definer-live-catalog` 13, `function-reachability`
4 — the last matters because it proves the two helpers ARE called: it searches
policies, not just application code.)

## Files this pass authored

- `drizzle/migrations/0035_shared_storage_reads_scoped_to_carrier.sql`
- `drizzle/migrations/0036_shared_storage_scoping_via_definer_helpers.sql`
- `src/test/shared-storage-carrier-scoped.test.ts`
- `src/test/definer-live-catalog.test.ts` (two entries + ceiling 135 -> 137)
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- `docs/passes/2026-09-22-1305-shared-storage-carrier-scoped.md` (this file)

## Still open

- P31 pay-policy versioning — BLOCKED on the two owner answers (which columns are
  versioned; whether the single-company-default index is re-scoped to current
  versions).
- Idle-operator dedup reading — was before 15:05 UTC at the time of the 12:30 pass.
