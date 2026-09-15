# Pass — narrowing the `has_role` / `is_staff` escape to name its case (2026-09-15 17:35 UTC)

Mode: BUILD. Immutable record per the standing pass-report rule. Written after the last
change (migrations, test guard, typecheck, suites), not after the migration.

## 1. The live bodies before the change — both carried the same escape

Read from `pg_get_functiondef`, not from a migration file:

- `public.has_role(uuid, app_role)` — SQL, STABLE, SECURITY DEFINER, `search_path TO 'public','extensions'`
- `public.is_staff(uuid)` — same shape, role list `onboarding_staff, dispatcher, management, owner`

Both ended with:

```sql
AND (public.current_company_id() IS NULL
     OR ur.company_id = public.current_company_id())
```

Confirmed: identical escape, identical treatment needed. Nothing in the live state
contradicted the record.

## 2. Step 3 — who loses staff access. THE LIST IS EMPTY.

```sql
SELECT ur.user_id, ur.role, ur.company_id, pr.first_name, pr.last_name
FROM user_roles ur LEFT JOIN profiles pr ON pr.user_id = ur.user_id
WHERE ur.role IN ('management','owner','dispatcher','onboarding_staff')
  AND NOT EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = ur.user_id);
```

**0 rows.** For context from the same read: 23 staff role rows across 15 distinct users
(`dispatcher` 7, `management` 10, `onboarding_staff` 5, `owner` 1) — every one of the 15
holds a `company_members` row. `operator` 154, `truck_owner` 5.

So nobody loses staff access when this ships, and no membership rows needed to be written
alongside the fix. Proceeded on that basis. The two `truck_owner` users named in the
investigation remain the only signed-in users who resolve NULL; `is_staff` does not list
`truck_owner` and no policy keys on `has_role(..., 'truck_owner')`.

## 3. The change

Migration 1 — `CREATE OR REPLACE` on both functions, body otherwise byte-identical
(same volatility, definer flag and pinned search path):

```sql
AND (auth.role() = 'service_role'
     OR ur.company_id = public.current_company_id())
```

with a comment recording why the escape names its case. `auth.role()` is the same test
`stamp_tenant_company_id()` already makes, so this is an established pattern here.

Migration 2 — an unrelated red found while running the named suites (see 6):
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on the four stamp trigger functions
created by the 2026-09-14 federal-breaks pass
(`stamp_eld_sync_alert_company_id`, `stamp_eld_malfunction_notification_company_id`,
`stamp_inspection_document_company_id`, `stamp_inspection_document_version_company_id`).
Linter total 180 → **172**; the four had been client-executable since 2026-09-14.

Guard — `src/test/tenancy-resolver.test.ts`, one new `itLive` per function: the body must
contain `auth.role() = 'service_role'` and must NOT match `current_company_id() IS NULL`.
Regressing to the old form fails.

## 4. Verification — both arms, with a real driver session

Session minted for Steve Figueroa (`stevefigueroa2026@gmail.com`,
`878be880-396a-4dd6-9ae1-787df2a5e749`, operator `2c24ca65-…ee109`, company
`6b54d0e6-8743-4284-b55b-8cd094b093dd`) and used over REST as `authenticated`.
Note: his auth id in the record was mistyped in a first mint attempt
(`user_not_found`); the id above was read from `auth.users` by email.

Scratch fixtures: carrier `00000000-0000-4000-8000-00000000ffff`
("SCRATCH TENANCY PROBE LLC", USDOT 9999901) and ONE scratch `user_roles` row —
Steve, `dispatcher`. The stamp trigger refused the insert until the statement set
`request.jwt.claims` to `{"role":"service_role"}` and named the company explicitly:
the trigger behaved exactly as recorded.

| probe | role row on the SCRATCH carrier | same row moved to HIS carrier |
| --- | --- | --- |
| `rpc/has_role(dispatcher)` as Steve | **false** | **true** |
| `rpc/is_staff` as Steve | **false** | **true** |
| `rpc/has_role(operator)` as Steve | true | true |
| `GET /settlements` as Steve | `[]` | `[]` |

The only difference between the two columns is the role row's `company_id`. The company
predicate is what decides.

- **Service-role caller still passes its role gates.** With
  `request.jwt.claims = {"role":"service_role"}` and `current_company_id()` NULL:
  `has_role('5cca4f77-…','owner')` **true**, `is_staff('5cca4f77-…')` **true**, and the
  definer RPC `public.is_retention_admin('5cca4f77-…')` returned **true** — a function
  that gates on a SUBJECT uuid rather than `auth.uid()`, which is the shape the four
  edge functions use (`decrypt-ssn`, `resend-invite`, `send-passenger-auth`,
  `revoke-passenger-auth` all call `has_role`/`is_staff` on an admin client with an
  explicit user id). Those are the callers the escape exists for, and they still pass.
  `search_audit_log` was tried first and is NOT a valid demonstration: it gates on
  `has_role(auth.uid(), 'management')`, and `auth.uid()` is NULL for service role, so it
  returns 0 rows either way. Said plainly rather than counted as a pass.
- **Unauthenticated caller unaffected.** `rpc/is_staff` → `false`; `rpc/has_role` → 401 /
  `42501 permission denied for function has_role` — the pre-existing anon ACL, unchanged.
- **Owner unaffected.** Real injected owner session (`5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`):
  `has_role(owner)` true, `is_staff` true, and reads returned rows on `settlements`,
  `contractor_pay_setup` and `loads`.
- **The two `truck_owner` users unaffected.** `has_role(..., 'truck_owner')` still true
  for both; their access runs through `is_truck_owner_for_operator`, not `has_role`, and
  the client reads `user_roles` directly for the truck-owner flag (no `has_role` RPC).

**Rollback:** both scratch rows deleted. Final state: `carrier_profile` count **1**;
Steve's roles: `operator` only. Nothing of the probe remains.

**Did this demonstration grant a driver anything, as the last one did?** For a few
seconds Steve held `dispatcher` on his own carrier, so anything a dispatcher may read he
could have read in that window. He did NOT gain settlement access: `GET /settlements`
returned `[]` in both arms — the settlements policies key on `management`/`owner`, not
`dispatcher`. Stated plainly, unlike a claim of "no exposure".

## 5. Not done, deliberately

The growth path is untouched: `bootstrap-admin`, `invite-staff` and `assign_user_role`
can still mint a staff role for a user with no `company_members` row. After this pass
such a user resolves NULL, no longer hits the escape, and now correctly has **no** staff
access anywhere — the hole is closed, but the invite is then silently useless. Writing
the membership row is the follow-up, and for `invite-staff` it is a tenancy-semantics
change. TRIGGER: before any further staff invite is issued.

## 6. Suites and typecheck

- `npx tsgo --noEmit` — clean.
- `src/test/tenancy-resolver.test.ts` — **78 passed / 78**, including the two new escape
  guards. One `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled error was
  reported alongside the green run (the known pooler slowness in this suite; 287s).
- `src/test/definer-live-catalog.test.ts`, `grant-parity-live.test.ts`,
  `policy-grant-parity.test.ts`, `operator-settlement-isolation.test.ts`,
  `operator-fuel-isolation.test.ts`, `notification-isolation.test.ts` —
  **49 passed / 49** on the final run.

Honest sequence on that last set: the FIRST run was **2 failed / 47**, both failures
naming the four un-revoked stamp trigger functions from 2026-09-14 — a red that predates
this pass and is unrelated to the escape. After migration 2 an intermediate run reported
**5 failed / 44** whose detail could not be captured (two attempts to re-print the
failures produced a fully green run instead); the final captured run is 49/49 with every
test named. The intermediate run is recorded rather than dropped.

## 7. Contradictions

None between the record and the live state. Two corrections to the record's incidentals,
not to its substance: Steve's auth uuid as previously written did not resolve and was
re-read from `auth.users`; and `search_audit_log` cannot serve as a service-role gate
demonstration for the reason in section 4.
