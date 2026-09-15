# Read-only report — does the NULL-company escape in `has_role` / `is_staff` cover a third case?

Everything below was read from the live database and the live function bodies in this pass. No change was made.

## The escape, as it stands live

Both `public.has_role` and `public.is_staff` carry `AND (public.current_company_id() IS NULL OR ur.company_id = public.current_company_id())`. `current_company_id()` is membership-first (`company_members`), then the caller's own `operators` row, no fallback.

## 1. The third case exists, and it has exactly two members today

`user_roles.user_id` values present in neither `company_members` nor `operators`: **2**.

| user | role held | role row's company |
| --- | --- | --- |
| `22ec8422-11d5-45a2-91da-38f296b94de7` | `truck_owner` | `6b54d0e6-…b093dd` |
| `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0` | `truck_owner` | `6b54d0e6-…b093dd` |

Both do hold a `truck_owners` row (5 exist in total; the other three owners are also drivers, so they resolve through `operators`). Neither is a member nor an operator, so both resolve to NULL and both hit the escape.

Whether each has a live auth account could **not** be established: `auth.users` is not readable from this session (`permission denied for schema auth`). Their presence in `truck_owners` with an invite flow that creates the auth user first is strong indirect evidence, not proof. Stated as unverified.

So the escape is **not** unreachable by signed-in users. It is, however, harmless for these two — see 2.

## 2. What they can reach through the unscoped role

Nothing extra today.

- `is_staff` does not list `truck_owner`, so it returns false for them regardless of the escape.
- No policy anywhere keys on `has_role(..., 'truck_owner')`. Truck-owner access runs entirely through `is_truck_owner_for_operator(auth.uid(), operator_id)`, which matches on their own `truck_owners` row — 16 policies across `operators`, `onboarding_status`, `ica_contracts`, `contractor_pay_setup`, `driver_vault_documents`, `operator_documents`, `active_dispatch`, `equipment_assignments`, `truck_dot_inspections`, `truck_maintenance_records`, `dispatch_daily_log`, `ica_driver_acknowledgments`, `truck_owners`.
- Their own role rows already carry the single real company, so even the scoped arm would pass.

The exposure is conditional, not present: if a user in this set ever held `management`, `owner`, `dispatcher` or `onboarding_staff`, the escape would make that role pass for **every** company. 359 policies key on `has_role`/`is_staff`. The most consequential are the `settlements` and `invoices` management policies — an unscoped `management` would read and write another carrier's driver pay and A/R. `contractor_pay_setup` (SSN/EIN, pay percentages) is the worst read.

## 3. Whether the set can grow

`user_roles.company_id` is NOT NULL, 0 null rows, and the insert trigger `aa_stamp_tenant_company_id` → `stamp_tenant_company_id()` either stamps the caller's resolved company or, for `service_role`, requires an explicit `company_id`, else raises 42501. So a role row cannot be created company-less. But it can still be created for a user with no membership and no operator row.

Per-function, of the role-writing service-role paths:

| function | names a company | creates membership / operator |
| --- | --- | --- |
| `bootstrap-admin` | yes (`soleCompanyId`) | **no membership** — grants `management` with no `company_members` row |
| `invite-staff` | **no** | **no membership** |
| `invite-truck-owner` | **no** | writes `truck_owners`, never `company_members` — this is how the two above appeared |
| `invite-operator` | **no** | yes, `operators` |
| `provision-demo-driver` | yes | yes, `operators` |
| `provision-test-driver` | yes | yes, `operators` |
| `create-preview-session`, `delete-user-account` | read / delete only | n/a |
| `assign_user_role` RPC | stamped from the management caller | **no** — role only |

Two separate defects fall out of that table:

1. **`bootstrap-admin`, `invite-staff` and `assign_user_role` are the growth path.** Each can mint `management`/`dispatcher`/`onboarding_staff` for a user with no `company_members` row. That user resolves NULL, hits the escape, and his staff role is then valid for every company. `bootstrap-admin` does it today and is the concrete route to the case described in 2.
2. **Three invites now fail silently.** `invite-staff` (role upsert, ~line 243), `invite-truck-owner` (~line 108) and `invite-operator` (~line 134) upsert `user_roles` with no `company_id` from a service-role client, so the stamp trigger raises 42501 — and none of the three checks the returned error. The auth user, profile, and email all proceed; the role is never written. Not a tenancy hole, a broken invite. Unverified against a real invite run in this pass, inferred from the trigger body plus the unchecked `await`.

## 4. A narrower escape

Yes, it can name its case. `auth.role() = 'service_role'` is available (the stamp trigger already tests exactly that), so the predicate could read `(auth.role() = 'service_role' OR ur.company_id = public.current_company_id())`. That fires for the case the comment claims to cover and for nothing else; the current form fires whenever a lookup fails, which is the broader set established in 1 and 3.

If the escape were removed entirely, and nothing else changed:

- The two truck owners keep working — their role rows carry the real company, and their access does not run through `has_role` anyway.
- **Unauthenticated callers**: no change. No `user_roles` row, so the EXISTS was already false.
- **`service_role`**: `auth.uid()` is NULL, so `current_company_id()` is NULL and every `has_role`/`is_staff` call inside a definer function invoked by a service-role client would return false. Any edge function or cron path that calls such an RPC as service role rather than as a user would start failing its own role gate. That is the real cost, and it is why the case should be named explicitly rather than removed.
- **Any user granted a staff role without a membership** (the `bootstrap-admin` path) would lose staff access entirely until a `company_members` row is added — which is the correct outcome, but it is a live-access change, not a no-op.

## 5. Caller's company vs. subject's role row

Checked live, all 359 policy expressions and every function body that names `has_role`/`is_staff`.

- **Policies: no risk.** The only first arguments that occur in any policy are `has_role(auth.uid(), …)` and `is_staff(auth.uid())`. Subject and caller are always the same person.
- **Functions: 33 use a local alias, and every one of those aliases is `auth.uid()`** (verified declaration by declaration — `v_uid`, `v_actor`, `uid`, `_uid`). `v_actor` in the accessorial functions is `current_profile_id()`, but it is never the argument to a role check.
- **Five places genuinely pass a subject other than the caller.** In each the mismatch is benign or intended, because both parties are meant to be in the caller's company:
  - `initiate_owner_transfer` — `has_role(p_to_user_id, 'management')`; caller must be `owner`. Now requires the transferee's `management` row to be in the caller's company. Correct.
  - `transfer_owner` — `has_role(v_row.to_user_id, 'management')`, and the caller is asserted to be `to_user_id`, so subject = caller.
  - `set_load_dispatcher` — `has_role(v_target_user, 'dispatcher')`, caller management. Correct scoping.
  - `get_staff_contact_info` — `is_staff(p.user_id)` as a subject-side filter; now restricts results to staff of the caller's company. A tightening, not a break.
  - `is_retention_admin(_user_id)` — passes its own parameter through; used in no policy, so its callers determine the subject.

The predicate does compare one person's role against another person's company in those five, but in all five the intended relationship is same-company, so the comparison is what you want. There is no case where a legitimately cross-company subject is checked.

## Contradictions and limits

- The escape's stated justification ("unauthenticated and service-role contexts, which hold no `user_roles` rows") is **incomplete**: two signed-in users with role rows reach it today, and `bootstrap-admin` plus `assign_user_role` can add staff-roled ones.
- The two current members of the set are harmless. The risk is structural, not realised.
- `auth.users` liveness for the two users is unverified (schema not readable here).
- The silent-invite failure in 3 is inferred from the trigger and the unchecked error, not from an executed invite.
