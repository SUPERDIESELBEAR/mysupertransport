# Proposal: one owner, protected assignment, safe transfer

Design proposal only. No code, no migrations.

## 1. Current state (all live queries unless noted)

- **Owners today: exactly one.** Marcus Mueller, user `5cca4f77…f950965c1ffe`, account status `active`. One row in `user_roles` with role `owner`.
- **Table shape:** `user_roles(id uuid pk, user_id uuid, role app_role, created_at)`. Indexes: pk on `id`, unique on `(user_id, role)`, index on `user_id`. **No triggers at all** on the table.
- **Row-level rules:** three policies, all read-only (own rows; management; owner). There is **no** insert/update/delete policy, so `authenticated` writes are blocked by row-level security even though the table grants insert/update/delete to `authenticated` and `service_role`.
- **What can write `owner` today:**
  - `bootstrap-admin` (source): assigns `owner` when the caller passes `role: 'owner'`, gated only by the shared `BOOTSTRAP_SECRET`. It upserts on `(user_id, role)` and can be called repeatedly for different users. Confirmed.
  - Any other backend function using the service key could write it; today none does. `get-staff-list` restricts role add/remove to `onboarding_staff | dispatcher | management` (source), `invite-operator` writes `operator`, `invite-staff` writes staff roles, `invite-truck-owner` writes `truck_owner`, the two test/demo provisioners write driver roles.
  - Direct database writes as `postgres`/service role — always possible, unconstrained.
  - `assign_user_role(uuid, app_role)` refuses `owner` outright, and nothing calls it (recorded).
- **What can remove it:** `remove_user_role` refuses `owner`, and nothing calls it. `get-staff-list` never passes `owner` through its role list, and blocks password resets for owner accounts. `delete-user-account` deletes **all** `user_roles` rows for the target user — it checks that the *caller* is owner, not that the *target* is not the owner, so it is a real deletion path for the owner row.
- **Would anything today prevent a second owner?** No. Nothing in the database prevents it; only the fact that no shipped code path other than `bootstrap-admin` writes `owner`.

## 2. Only one owner

**Mechanism: a unique partial index.**

```
CREATE UNIQUE INDEX user_roles_single_owner
  ON public.user_roles ((true)) WHERE role = 'owner';
```

It works given the table's shape: a partial unique index on a constant expression allows at most one matching row overall (a unique index on `role` where `role='owner'` gives the same effect and reads more plainly; either is fine). Because there is exactly one owner row today, the index builds without touching or rejecting existing data.

*Rejected:* a check constraint (cannot see other rows) and a validation trigger counting rows (races under concurrency; an index is enforced by the storage layer and cannot be bypassed by service role).

**What this breaks for transfer.** With the index in place, "insert new owner, then delete old" fails at the insert. "Delete old, then insert new" leaves a window with zero owners — and if the insert fails, the system has no owner at all, with 166 policy expressions keyed on owner/role checks still live. Therefore transfer must be a **single database function that deletes and inserts inside one statement/transaction**, so the constraint is only ever evaluated at the end of the operation. Two REST calls from an edge function cannot give that guarantee; one RPC can.

Note the index enforces "at most one", not "exactly one". "Exactly one" is not enforceable by an index; it is preserved by making the transfer atomic and by refusing plain deletion of the owner row (section 3).

## 3. Nobody becomes owner through the application

The refusal must move from `assign_user_role` (uncalled, and bypassed by service role anyway) into a **trigger on `user_roles`**, because the trigger is the only thing service-role writes cannot route around.

Proposed `BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles`, fires only when the row's role is `owner`:

- raise unless an unlock flag is set for the current transaction;
- otherwise allow.

**Unlock pattern.** The precedent in this codebase is the settlement/invoice immutability pair: `enforce_invoice_immutability()` consults `invoice_writer_active()`, which reads `current_setting('app.invoice_write', true) = 'on'`. It fits, with one caveat that decides the design: a session GUC cannot be set from a Supabase REST `upsert`. `bootstrap-admin` writes through `from('user_roles').upsert(...)`, so under the trigger it would start failing.

So the legitimate paths must become RPCs that set the flag internally:

- `bootstrap_assign_owner(...)` — only permits the assignment when **no owner row exists** (fresh deployment), sets the flag, inserts, audits.
- `transfer_owner(...)` — the atomic transfer of section 4.

Everything else that touches `owner` is refused, including `delete-user-account`, which should be changed to refuse when the target holds `owner`.

*Rejected:* keeping the guard only in edge functions (the current situation — a per-function convention that the next function forgets); and dropping `BOOTSTRAP_SECRET` in favour of the trigger alone (the secret is still the only thing standing between a fresh deployment and an arbitrary first owner).

## 4. The transfer

**Proposed mechanism: two-party confirmation, initiated by the owner, accepted by the recipient, with a short cancellation window and an audited atomic commit.**

A small `owner_transfers` table: from user, to user, initiated at/by, expires at, accepted at, cancelled at, status, mechanism. Flow:

1. Current owner initiates against a named existing management user. Row created, status `pending`, expiry (proposal: 72 hours).
2. Notification email to the current owner's address on record — out-of-band awareness, and the cancellation link. This is the anti-accident layer: a hijacked session that initiates a transfer still puts a cancel link in the real owner's inbox.
3. Recipient accepts in-app. Acceptance calls `transfer_owner`, which in one transaction sets the unlock flag, deletes the old owner row, inserts the new one, marks the transfer accepted, and writes an `audit_log` row (actor, from, to, timestamp, mechanism).
4. Either party can cancel before acceptance; expiry cancels automatically.

Costs of each candidate:
- **Two-party confirmation** — best accident resistance; costs a new table, two screens, and an email. Chosen.
- **A secret, as bootstrap uses** — cheapest, but a shared string is transferable and unattributable; whoever has it *is* the owner. Rejected as the primary mechanism; retained only for the no-owner bootstrap case.
- **Time delay with cancellation window** — good, but weak alone (a delay nobody watches is just a slower transfer). Adopted as part of the above, not instead of it.
- **Out-of-band email confirmation** — adopted as the notification/cancel channel; rejected as sole gate because an email click is a single factor held by one party.
- **Approval by a second management user** instead of the recipient — rejected: the recipient's acceptance is more meaningful, and it does not help when management is thin.

**If the owner is unavailable.** A mechanism requiring the outgoing owner is useless precisely when it is needed. Handled in two layers:

- **Break-glass:** `bootstrap_assign_owner` remains available for the zero-owner case. The documented emergency procedure is therefore: delete the orphaned owner row directly in the database (a deliberate, logged, credential-gated act), then run bootstrap with `BOOTSTRAP_SECRET` to install the new owner. This is honestly a **manual database procedure**, and the proposal keeps it that way rather than building an automated succession path that would become a second unattended way to become owner.
- **Documented**, with the audit entry written after the fact naming who executed it and why.

## 5. What must not break

- `has_role(auth.uid(), 'owner')` and friends: **202 policy expressions** reference `has_role`, of which **166 policy expressions** mention `'owner'`; **59 functions** in `public` reference `has_role`. Nothing in this proposal changes the owner's `user_roles` row, `has_role`, or the read policies, so `has_role(<current owner>, 'owner')` returns true before and after. The index is a constraint, the trigger only fires on writes.
- `bootstrap-admin` still works for its intended purpose — a fresh deployment with no owner — via `bootstrap_assign_owner`. Its management-role path is unaffected. What changes: it can no longer install a *second* owner, which is the point.

## 6. Build order

- **Pass 1 — index.** Add the partial unique index. Verifiable: it builds against live data (one owner), and a second insert is rejected in a fixture.
- **Pass 2 — trigger + `bootstrap_assign_owner`, and repoint `bootstrap-admin`'s owner path at the RPC.** Verifiable in fixtures: service-role insert of `owner` refused; bootstrap refused while an owner exists; bootstrap succeeds with none. Also fix `delete-user-account` to refuse owner targets.
- **Pass 3 — `transfer_owner` RPC + `owner_transfers` + audit.** Verifiable in fixtures: atomic swap leaves exactly one owner; failure leaves the original untouched; expired/cancelled transfers refuse.
- **Pass 4 — UI and the owner email.** Verifiable by walking the screens.
- **Pass 5 — write the break-glass procedure into the record.** Not testable; that is the honest status.

**What cannot be verified:** the real thing. A genuine transfer happens roughly never, and cannot be rehearsed in production without moving the owner row. Everything in passes 2–4 is fixture evidence on scratch rows. **The one live check that matters, run after every pass: the current owner still resolves as owner and still reaches the owner-only screens.**

## CONTRADICTIONS

None found.
