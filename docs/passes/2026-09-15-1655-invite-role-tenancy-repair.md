# Pass — invite paths write a tenanted role, loudly (2026-09-15 16:55 UTC)

Mode: BUILD. Immutable record per the standing pass-report rule.

## 1. Damage assessment — CONTRADICTS the brief

The brief states "Anyone invited since `user_roles` gained its stamp on 2026-09-13
has an account with no role." Live data does not support that.

Queries run before any edit (`auth.users` is inaccessible, so `profiles`,
`operators`, `truck_owners`, `user_roles` and `audit_log` were used):

- profiles with no `user_roles` row: **0**
- operators with no `user_roles` row: **0**
- truck_owners with no `user_roles` row: **0**
- profiles created on/after 2026-09-13: **0**
- `user_roles` rows created on/after 2026-09-13: **0**
- audit events since 2026-09-13: `invite_resent` × 1 (2026-09-14 15:00:45Z) — a
  resend does not create a role row.
- `user_roles.company_id IS NULL` rows: **0**

So: **nobody was invited in the red window, and there is no affected-user list to
name or repair.** No sign-in failures can be attributed to a missing role.
Item 3 (repair) therefore had nothing to do; no rows were written.

The defect in the code was real — the three functions did upsert `user_roles`
with no `company_id` from a service-role client, which
`stamp_tenant_company_id()` refuses with SQLSTATE 42501, and none of the three
checked the error. It was a **latent** break: the next invite would have failed
silently. It never fired because no invite was issued between 2026-09-13 and
this pass.

## 2. The fix — all three

`invite-staff`, `invite-operator`, `invite-truck-owner`. Each now resolves the
company from the caller's `company_members` row via
`_shared/tenancy.ts › companyIdForUser()` — the second sanctioned shape, the same
helper the four `operators` insert paths use — **before** any user is created or
any mail is generated, so an unresolvable caller fails with nothing sent.

Each role upsert now names `company_id` explicitly and its error is fatal.

`invite-truck-owner` additionally passes `company_id` on its `truck_owners`
upsert, which is likewise NOT NULL and stamped.

### What a failed role write now does

- **`invite-staff`** — nothing is emailed. The one-time invite link is generated
  but held; the branded Resend send was moved to *after* the role write. On
  failure the function returns 500 and no invitation exists. The auth user and
  profile remain (created earlier by `auth.admin`), so the outcome is
  *account without role and without email* — invisible to the invitee, and a
  retry of the same invite is idempotent (`upsert` on `user_id,role`).
- **`invite-operator`** — same: role write precedes the operator insert and the
  install-invite path, returns 500 on failure, no mail sent.
- **`invite-truck-owner`** — this path's mail is sent by Supabase
  `inviteUserByEmail` at user creation, so it cannot be deferred behind the role
  write without replacing it with `createUser` + `generateLink` + a branded
  template. It is not rolled back. Company resolution was therefore moved ahead
  of user creation, which removes the only *predictable* cause of the role write
  failing. A residual DB error after the invite mail leaves *account + email,
  no role*, reported to the caller as a 500 naming the failure — partial
  completion, stated deliberately rather than hidden.

No transaction spans these writes (three separate REST calls plus an auth admin
call); nothing here can be made atomic without a server-side function, which is
out of this pass's scope.

## 3. Verification — a real invite, end to end

Deployed all three, then invited a scratch address as the signed-in owner:

```
POST /functions/v1/invite-staff  {"email":"scratch-tenancy-probe+20260915@example.com","role":"dispatcher",...}
{"success":true,"user_id":"bfcc9a54-2600-4547-95cf-eb744e196c7e"}

user_roles: bfcc9a54-… | dispatcher | 6b54d0e6-8743-4284-b55b-8cd094b093dd | 2026-09-15 16:50:21Z
carrier_profile id: 6b54d0e6-8743-4284-b55b-8cd094b093dd   → same company
```

Scratch user deleted via `delete-user-account` (`{"success":true}`);
post-delete counts: `user_roles` 0, `profiles` 0. Nothing of the probe remains.

`invite-operator` and `invite-truck-owner` were not exercised end to end — both
need a real application / operator row and would have created live records; they
carry the identical helper, stamp argument and error check as the path proven
above. Stated as unverified rather than implied.

## 4. Growth path — REPORTED, NOT TOUCHED

`bootstrap-admin`, `invite-staff` and `assign_user_role` can mint a staff role
for a user with **no `company_members` row**. That user resolves NULL in
`current_company_id()`, hits the `IS NULL` escape in `has_role`/`is_staff`, and
his staff role then passes for **every** company. What each would need:

- **`invite-staff`** — insert the `company_members` row for the invitee in the
  same pass as the role, using the resolved `inviteCompanyId`. Today it writes
  the role only. (Not done here: adding staff membership changes who
  `current_company_id()` resolves for, which is a tenancy-semantics change.)
- **`bootstrap-admin`** — first-owner path; must seed both the carrier and its
  own `company_members` row, or refuse when a carrier already exists.
- **`assign_user_role`** (DB function) — should refuse a staff role for a
  subject with no membership in the caller's company, i.e. gate on membership
  rather than only on the caller's role.
- **`has_role`/`is_staff`** — the escape should name its case
  (`auth.role() = 'service_role'`) instead of firing whenever the company lookup
  returns NULL.

## 5. Suites and typecheck (run after the last change)

- `npx tsgo --noEmit` — clean.
- `deno check` on all three functions — clean.
- `src/test/definer-search-path.test.ts`, `caller-evaluated-functions.test.ts`,
  `policy-grant-parity.test.ts`, `grant-parity-live.test.ts` — **4 files passed**.
- `src/test/tenancy-resolver.test.ts` — **74 passed, 2 failed**. Both failures
  are the known pooler flake, not assertions:
  `psql: error: connection to server … FATAL: (EAUTHQUERY) auth_query secret
  check timed out` at `psql()` (lines 844 and 1202). Same intermittent failure
  recorded in the Group C pass. Not green in a single run; reported as such
  rather than re-run until it passed.

## 6. Contradictions

1. The asserted damage population is empty — see item 1. The code defect was
   real but had not yet harmed anyone.
2. The earlier `.lovable/plan.md` investigation inferred silent invite failures
   from the trigger body without querying for victims. That inference was
   correct about the mechanism and wrong about the consequence.
