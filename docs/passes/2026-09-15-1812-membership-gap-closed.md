# Pass — closing the membership gap (2026-09-15 18:12 UTC)

Mode: BUILD. Immutable record per the standing pass-report rule. Written after the LAST
change (migration, three edge functions, four guards) and after the typecheck and suites.

## 1. Contradictions

**None.** The record's description of the three paths matched the live state exactly:
`assign_user_role` wrote a role and nothing else; `bootstrap_assign_owner` seeded the
`owner` role with no membership; `invite-staff` resolved `inviteCompanyId` from the
caller's `company_members` row and wrote only the role.

One thing the record does NOT name, found while reading: **a fourth minting path.**
`get-staff-list` `action: 'add'` (~line 426) upserts a staff role with
`companyIdForUser(caller)` and no membership — the same gap as `invite-staff`, reached
from the Staff Directory role toggles rather than from an invite. It is in the same class
and was fixed in the same way. Recorded here rather than left for a later pass.

## 2. The tenancy-semantics reach — established before doing it

Adding a `company_members` row for an invitee changes what
`current_company_id()` returns for him, and that value is read by:

- `aa_stamp_tenant_company_id` on every tenant table — his inserts now stamp that
  company instead of raising 42501.
- every `company_id = current_company_id()` policy — he can now see that company's rows
  *where his role also admits him*.
- `has_role` / `is_staff` — his role row's company now matches, so his role works.
- `carrier_profile` SELECT, scoped to the resolver on 2026-09-15.

It reaches no further. Membership grants no privilege by itself: `company_members` has
one policy (`SELECT` where `user_id = auth.uid()`), no user-writable policy and no write
grant to `authenticated`. Every capability still passes through his role. So the reach is
exactly "his staff role starts working, for one company" — which is the intent, not an
overshoot. No STOP was warranted.

## 3. The changes

**`invite-staff`** — upserts `company_members` with the already-resolved
`inviteCompanyId` BEFORE the role, error fatal (500, no invitation sent). Order chosen so
we never email access that resolves to no company.

**`get-staff-list` `action: 'add'`** — same: resolve once into `addCompanyId`, membership
upsert, then the role. Both writes now check their error; the role write previously did
not.

**`bootstrap-admin`** — the non-owner branch resolves `soleCompanyId()` once, upserts
membership, then the `management` role, both fatal.

**`bootstrap_assign_owner`** (migration) — inserts `company_members (p_user_id, v_company)`
`ON CONFLICT DO NOTHING` alongside the owner role, inside the same function and therefore
the same transaction as the role and the audit row. Without it the FIRST OWNER of a new
system resolves NULL and his own `owner` role passes for no company — the whole system
would come up inert.

**`assign_user_role`** (migration) — **REFUSES** rather than minting membership. Chosen
because: this RPC grants a role to an EXISTING user, membership is deliberately not
something an application RPC asserts (step 1 gave the table no user-writable policy), and
the invite path is the one that legitimately creates members. It now resolves the caller's
company, refuses when that is NULL, and for `management` / `dispatcher` /
`onboarding_staff` requires a `company_members` row for the SUBJECT in the CALLER's
company. `operator` is deliberately outside the gate — an operator holds no membership by
design and resolves his company through his `operators` row.

## 4. Removing a role — PROPOSAL, not done

- `get-staff-list` `delete_user` and `delete-user-account` both call
  `auth.admin.deleteUser`. `company_members_user_id_fkey` is **ON DELETE CASCADE** to
  `auth.users` (confirmed from `pg_constraint`: `confdeltype = 'c'`). Membership is
  therefore already removed with the account. Nothing to do on those two paths.
- The gap is role removal WITHOUT account deletion: `get-staff-list` `action: 'remove'`
  and `remove_user_role`. Removing a person's last staff role leaves a membership row, so
  he resolves to a company he has no role for. Harmless today — every policy also keys on
  a role — but it is the mirror of the gap just closed.
- **Proposed, for the owner to decide:** on removal, delete the membership row when the
  user retains no `management` / `dispatcher` / `onboarding_staff` role AND holds no
  `operators` row. NOT implemented in this pass, because it is the same
  tenancy-semantics class of change and deserves its own decision. TRIGGER: before staff
  roles are removed in bulk, or before a second carrier exists.

## 5. Verification

**`invite-staff`, real, end to end.** Invited `scratch-memb-probe@example.com` as
`dispatcher` from the signed-in owner's session → `{"success":true,"user_id":
"d494791c-cb26-406d-8746-90495f417fc3"}`. Live read:

| row | value |
| --- | --- |
| `user_roles` | `dispatcher`, company `6b54d0e6-8743-4284-b55b-8cd094b093dd` |
| `company_members` | company `6b54d0e6-8743-4284-b55b-8cd094b093dd` |

Same company, both rows.

**The invitee resolves to that company — demonstrated, not inferred.** With
`request.jwt.claims` set to his `sub` as `authenticated`, `public.current_company_id()`
returned `6b54d0e6-8743-4284-b55b-8cd094b093dd`. Transaction rolled back.

**`assign_user_role`, both arms**, as the signed-in owner
(`5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`), both inside transactions:

- Non-member subject (`22ec8422-…`, `truck_owner`, no membership), role `dispatcher` —
  verbatim:
  ```
  ERROR:  42501: That person is not a member of your company, so a staff role would work for no company. Invite them as staff instead.
  HINT:  company_members row required before granting management, dispatcher or onboarding_staff.
  CONTEXT:  PL/pgSQL function assign_user_role(uuid,app_role) line 28 at RAISE
  ```
  A refusal needs no rollback; the transaction was rolled back anyway.
- Member subject (the scratch invitee), role `onboarding_staff` — accepted; both role rows
  read back with the right company. **ROLLED BACK** (a probe expected to succeed must
  abort — the rule recorded after the `DETENTION` incident).

**`bootstrap-admin` — STRUCTURAL, NOT EXERCISED.** `bootstrap_assign_owner` raises 23505
while an owner exists for the company, and one does. It therefore cannot be run against
this live system, and no probe can create the "no carrier, no owner" state it is for
without destroying the carrier. Its behaviour was established by reading the live function
definition after the migration: the `INSERT INTO public.company_members` sits between the
role insert and the audit insert, inside the same function, after the same two refusals
(no company → 42501, owner exists → 23505). Stated plainly as structural.

**Cleanup and unchanged state.** Scratch user deleted via `delete-user-account`. After:
`user_roles` 0, `company_members` 0, `profiles` 0 for that id. Fleet totals
`company_members` **15**, staff role rows **23**, owners **1**, carriers **1**, public
policies **560** — all unchanged. The owner still resolves as sole owner: company
`6b54d0e6-…`, `has_role(owner)` **true**, `is_staff` **true**.

Migration linter: **172**, the baseline set by the previous pass. No new issue.

## 6. Guards

`src/test/tenancy-resolver.test.ts`, new describe "a staff role is never minted without a
company membership" — four tests: `assign_user_role`'s live body gates on
`company_members` for the three staff roles; `bootstrap_assign_owner`'s live body inserts
the membership row; zero staff role rows lack a matching membership; and all three
role-minting edge function sources upsert `company_members`.

## 7. Suites and typecheck

- `npx tsgo --noEmit` — clean.
- `src/test/tenancy-resolver.test.ts` — the full-file run reported **80 passed / 2
  failed (82)** plus one `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled
  error. The two named failures were
  `no stamp defaults to a carrier: each refuses when it cannot derive one` and
  `every constant-default row agrees with the company of the driver who owns it` — both
  re-run individually and **passed** (4.2s and 6.3s), as did the B5 sibling. Both are the
  known pooler slowness in this 280-second file, not a regression; a later full run of the
  same file went green. Recorded rather than dropped. All four NEW guards pass, plus the
  ten membership/resolver tests, run explicitly.
- `definer-live-catalog`, `grant-parity-live`, `policy-grant-parity`,
  `operator-settlement-isolation`, `definer-search-path` — **31 passed / 31**.
