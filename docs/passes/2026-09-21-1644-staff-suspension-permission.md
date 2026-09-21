# Staff account suspension through the permissions table — 2026-09-21 16:44 UTC

Slice item 5 of `docs/passes/2026-09-21-0132-permissions-design.md`, owner decisions P16-P19
(2026-09-21). The last of the first-slice actions. Probe rule as tightened 2026-09-21 1550: no
real staff account was suspended, even briefly — every acceptance landed on a throwaway account
created and removed in this pass.

## Step 1 — every path that suspends or reinstates a staff login

| Path | Gate before this pass | What it does | Who could reach it | Client |
| --- | --- | --- | --- | --- |
| `get-staff-list` action `deactivate_user` (lines 147-182) | Bearer + `user_roles` in (`management`,`owner`); refused self | `profiles.account_status = 'inactive'` **and** `auth.admin.updateUserById(ban_duration: '876000h')`, then `audit_log` `staff_deactivated` | management, owner | service role |
| `get-staff-list` action `reactivate_user` (lines 184-…) | same, but **no** self check | `'active'` + `ban_duration: 'none'` + `audit_log` | management, owner | service role |
| Direct PostgREST `UPDATE profiles.account_status` | `"Staff can update profiles"` (`is_staff`) + `enforce_profiles_self_update` | flips the flag only; no auth ban | **any staff role** — dispatcher and onboarding staff included | signed-in user |

Nothing else writes the column: no definer function sets `account_status`, no trigger, no
scheduled job. `delete_user` (owner-only since 2026-09-18) removes the account instead of
suspending it. The only screen path is `StaffMemberPanel.handleToggleStatus`.

Could a caller suspend the **owner**? Yes — `deactivate_user` had no owner check, and the direct
path had none either. Himself? The function refused it for deactivate only; the direct path
allowed it. Both now closed.

Carve-out, deliberate: `useAuth.activatePendingProfile` writes the same column for a person's own
`pending → active` on first sign-in. Refusing it would break every first login, so the trigger
admits exactly that transition on your own row.

Nothing ambiguous; no stop condition hit.

## Step 2 — the rule

`drizzle/migrations/0020_staff_suspension_permission.sql`:

- `permission_actions` row `staff_account.suspend`, category `access`, **kind `change`**,
  covering both suspending and reinstating.
- Granted to `management` only. The owner appears in **no** row: P1 lives in `has_permission`'s
  short-circuit.
- `seed_role_permissions(company_id)` rewritten to 15 grants so a new carrier receives it.
- `enforce_staff_suspension_permission()` — SECURITY DEFINER, `search_path` pinned to
  `public, extensions`, EXECUTE revoked from PUBLIC/`anon`/`authenticated`.
- Trigger `aa_enforce_staff_suspension_permission` BEFORE UPDATE ON `profiles`, firing **only**
  when `account_status IS DISTINCT FROM` its old value. Named `aa_` so it sorts first among the
  four `profiles` triggers and judges what the caller asked for.
- The `profiles` UPDATE policies were **not** narrowed — they serve name, phone, avatar and
  birthday edits for every staff member.
- UNDO in a comment at the top of the file.

**Check order, identical in the trigger and in the edge function, every check before any write:**

1. P19 — `auth.uid() = OLD.user_id` → "You cannot change your own account status."
2. P18 — target holds `owner` and caller does not → "Only the owner can suspend or reinstate the
   owner account."
3. P17 — `NOT has_permission(auth.uid(), 'staff_account.suspend')` → "Not authorized to change a
   staff account status. Suspending or reinstating a staff login is limited to management and the
   owner."

Service-role writers (`auth.uid()` NULL) pass the trigger, because the one that exists asks the
permission about its caller first.

### One defect caught before this shipped

The first deployment asked `has_permission` through the **service-role** client.
`has_permission` resolves the company with `current_company_id()`, which is NULL without a JWT,
so it answered `false` for everyone but the owner — Mae was refused her own grant
(`403` quoted in the first proof run). The function now asks through `supabaseCaller`, a client
carrying the caller's own `Authorization` header. That is what design (d) means by the caller's
own identity, and `src/test/staff-suspension-permission.test.ts` fails if the service-role form
ever comes back.

## Step 3 — proofs (live sessions, throwaway `d70b4d70-ea33-44d6-ac7c-d36c4ff09cc4`)

Sign-in before anything: `200`.

| Attempt | Result |
| --- | --- |
| Mae (management) suspends the throwaway | `200 {"success":true}`; `account_status = inactive`; sign-in `400 {"error_code":"user_banned","msg":"User is banned"}` |
| Mae reinstates | `200`; `active`; sign-in `200` |
| Leo (dispatcher), function path | `403 {"error":"Forbidden: management only"}`; status unchanged |
| Leo, **direct database path** (PATCH `profiles.account_status`) | `403 {"code":"42501","message":"Not authorized to change a staff account status. Suspending or reinstating a staff login is limited to management and the owner."}`; status unchanged |
| Mae → Marcus (owner) | `403 {"error":"Only the owner can suspend or reinstate the owner account."}` — refused at step 2, before any write; Marcus still `active` |
| Mae → herself | `400 {"error":"You cannot change your own account status."}`; Mae still `active` |
| Marcus (owner) suspends the throwaway | `200`; `inactive`; sign-in `400 user_banned` |
| Marcus reinstates | `200`; `active`; sign-in `200` |

No onboarding-staff-only identity exists to test (Mae holds `management` as well as
`onboarding_staff`), so that arm was not run — stated rather than implied.

Cleanup: `user_roles` 204, `profiles` 204, `company_members` 204, auth user 200. Residue:
`profiles []`, `user_roles []`, `company_members []`, `auth.users 404 user_not_found`.

## Step 4 — the screen

`StaffMemberPanel.tsx` renders the suspend/reinstate button only when
`member.user_id !== currentUserId && !member.roles.includes('owner')`. So for Mae the control is
absent on Marcus's card and absent on her own card — the screen agrees with P18 and P19 rather
than leaning on them. Marcus sees the same rule, which is why the owner card carries no control
for him either; the owner reinstates through another management member or the throwaway path, and
nothing about his own login can be switched off from this screen. A refused attempt raises the
server's own sentence (`if (data?.error) throw new Error(data.error)`) into a destructive toast
titled "Deactivation Failed" / "Reactivation Failed" — a clear message, not a silent no-op.
Nobody real was suspended.

## Step 5 — the slice closes

All five first-slice actions are now enforced below the screen:

1. Permanent account deletion — owner role (2026-09-18 2030).
2. Lease termination — `lease_termination.change` (permissions foundation, 0211).
3. Company-document sending — `company_document.send` (foundation; no sender screen exists yet).
4. Driver deactivation and reactivation — `driver.deactivate` trigger (1424).
5. Staff suspension and reinstatement — `staff_account.suspend`, this pass.

**Nothing sensitive is protected by the user interface alone.**

Not yet reached, per the design's Step 5: settlement approval and voiding, invoice issue and
void, accessorial approval, fuel-import commit, pay-rate and policy changes, and per-person
exceptions in day-to-day use — the table exists and is enforced, but no exception has been
granted. A settings screen for permissions is still unbuilt, and permission changes are still
audited only by `created_by` / `updated_by`.

## Suite and typecheck

```
 Test Files  207 passed | 2 skipped (209)
      Tests  2069 passed | 16 skipped (2085)
     Errors  2 errors
   Duration  411.46s
```

Both errors are sandbox worker `Timeout calling "onTaskUpdate"`. A first run at the same
`--maxWorkers=4` reported 283 failures across 30 files; every one was a `psql` spawn failing
under pooler contention, and all pass on the clean re-run above and individually. Typecheck
(`tsgo --noEmit`) clean.

## Deployment

`get-staff-list` deployed twice (the first deployment carried the service-role permission
question). Confirmed by behaviour, not by a version string: the refusals and acceptances in
Step 3 above were all produced by the second deployment, including the direct-path refusal that
only the new trigger can raise.

## Files this pass authored

- `drizzle/migrations/0020_staff_suspension_permission.sql`
- `supabase/functions/get-staff-list/index.ts`
- `src/test/staff-suspension-permission.test.ts`
- `src/integrations/supabase/types.ts` (regenerated)
- `docs/tms-build-status.md` (appended)
- `docs/tms-wish-list.md` (slice closed)
- `docs/passes/2026-09-21-1644-staff-suspension-permission.md`
