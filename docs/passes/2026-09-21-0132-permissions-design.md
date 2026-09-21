# Pass report — the permissions module, designed on paper

2026-09-21 0132 UTC. BUILD MODE, scope limited by the prompt to
`docs/tms-build-status.md`, `docs/tms-wish-list.md` and this report.

**DESIGN ONLY. No migration, no code, no data change, no deletion. Nothing was
built.** **The full suite was SKIPPED deliberately — this pass is documentation
only**, so there is nothing it could regress. Typecheck likewise not run: no
TypeScript was touched. The prompt's final line (`END OF PROMPT…`) arrived
intact; the prompt was not truncated.

Read first, as instructed:
`docs/passes/2026-09-18-1944-permissions-decisions-and-inventory.md` — decisions
P1-P11, the sixteen-row inventory, and the four open questions it left. Also read
live for this design: `stamp_tenant_company_id`, `current_company_id`, `has_role`,
`is_staff`, the `tenant_isolation` shape in `drizzle/migrations/0005` and `0012`,
and the service-role note in `supabase/functions/_shared/email/auth.ts:63-70`.

## Contradiction check — one correction to the prompt's own figures, no STOP

Nothing in P12-P15 contradicts the live system or the record; they answer the
four open questions and are recorded as given. Two figures in the prompt do not
match the record, and are corrected here rather than repeated:

1. **"the eight actions protected only by the UI" — the record says THREE, and
   one of those is already closed.** The 2026-09-18 1944 inventory marked exactly
   three: permanent account deletion, deactivate a driver, terminate a lease.
   Permanent account deletion was CLOSED on 2026-09-18 2030 UTC (the
   `get-staff-list` `delete_user` branch now requires `owner`). **Two remain
   UI-only: deactivate a driver and terminate a lease** — both are in the first
   slice below. If "eight" refers to a different count the owner has in mind, say
   which eight and I will reconcile them; I did not invent five more.
2. **"the 64 edge functions with no role check"** is right as a total, but the
   record's live subset is the 23 irreversible/outbound ones, and five of that
   group were gated on 2026-09-21 0019 UTC. The total will not be re-counted
   until a pass re-runs the scan.

The inventory is sixteen rows, as the prompt says.

## Step 1 — the four answers, recorded as P12-P15

Written into `docs/tms-build-status.md` verbatim under the dated heading, so
later passes cite them individually:

- **P12** — one database function answers "may this user perform this action?".
  Policies call it; edge functions call it before acting. The UI may hide
  controls; hiding is never the enforcement.
- **P13** — viewing and changing are SEPARATE permissions. Read-only = holds the
  view permission, not the change permission.
- **P14** — permission is checked when an action STARTS. Removal does not
  interrupt work underway; the next action is refused.
- **P15** — per-person exceptions live in their own table, layered over role
  grants, each with an optional expiry. Role grants remain the normal path.

P12 answers open question 1 (both: the function is the single answer, and the
edge function must call it). P13 answers 2. P14 answers 3. P15 answers 4.

## Step 2 — the design

### (a) Three tables

**1. `permission_actions` — the catalogue of what can be permitted.**

| column | type | notes |
|---|---|---|
| `key` | text PRIMARY KEY | stable machine name, e.g. `driver.deactivate` |
| `label` | text NOT NULL | what the owner reads on screen |
| `description` | text | one sentence: what holding it lets you do |
| `category` | text NOT NULL | grouping for the settings screen: drivers, money, documents, access |
| `kind` | `permission_kind` enum (`view`,`change`) NOT NULL | P13 makes this structural, not a naming habit |
| `is_active` | boolean NOT NULL DEFAULT true | retire an action without deleting grants |
| `created_at` / `updated_at` | timestamptz | existing convention |

**No `company_id`, deliberately, and this is the one departure from the tenancy
convention.** The catalogue is PRODUCT-level: the set of actions SUPERDRIVE knows
how to enforce is decided by the code that enforces them, not by a carrier. A
tenant cannot invent an action, because an action only exists where a policy or an
edge function calls it. Consequences, accepted: no stamp trigger and no
`tenant_isolation` policy on this table; instead RLS on with `SELECT` to
`authenticated` and **no write policy at all** — rows arrive by migration, the
same pattern `pipeline_config` and the enum types already follow. Grants:
`GRANT SELECT ON public.permission_actions TO authenticated; GRANT ALL ... TO
service_role;` no `anon`.

**2. `role_permissions` — the normal path (P9).**

| column | type | notes |
|---|---|---|
| `id` | uuid PK DEFAULT gen_random_uuid() | |
| `company_id` | uuid NOT NULL REFERENCES `carrier_profile(id)` ON DELETE RESTRICT | |
| `role` | `app_role` NOT NULL | the existing enum, no parallel role list |
| `action_key` | text NOT NULL REFERENCES `permission_actions(key)` | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | existing convention |
| | UNIQUE (`company_id`, `role`, `action_key`) | |

Presence of the row IS the grant — there is no `granted boolean`, because a
false row and a missing row would mean the same thing and invite disagreement
between them. Denial for one person is the exceptions table, not a false row.
Trigger `aa_stamp_tenant_company_id BEFORE INSERT OR UPDATE ... EXECUTE FUNCTION
public.stamp_tenant_company_id()`; restrictive policy exactly as rolled out:

```sql
CREATE POLICY tenant_isolation ON public.role_permissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

Permissive policies: every staff member may READ the grants (they explain the
screen they are looking at); only the owner may WRITE them — `has_role(auth.uid(),
'owner')`, not `has_permission('permissions.manage')`, so no permission grant can
ever remove the owner's ability to fix permissions (P1 made load-bearing).
Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`, `ALL` to
`service_role`, nothing to `anon`.

**3. `user_permission_exceptions` — per person, layered, expiring (P15).**

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid NOT NULL REFERENCES `carrier_profile(id)` | stamped |
| `user_id` | uuid NOT NULL | the person, as `user_roles.user_id` does it |
| `action_key` | text NOT NULL REFERENCES `permission_actions(key)` | |
| `effect` | `permission_effect` enum (`allow`,`deny`) NOT NULL | both directions, because "everyone but him" is the commoner real case |
| `expires_at` | timestamptz NULL | NULL = no expiry; a past value is simply inert |
| `reason` | text NOT NULL | required, because P9 says sparingly and a reason is what makes it reviewable |
| `created_by` / `created_at` / `updated_by` / `updated_at` | | |
| | UNIQUE (`company_id`, `user_id`, `action_key`) | one row per person per action; flip `effect` rather than stacking |

Same stamp trigger, same `tenant_isolation` restrictive policy, same grant block.
Writes: owner only, same reasoning as above. **A `deny` row can never bite the
owner** — the resolver short-circuits on `owner` before it reads this table, so the
table is structurally incapable of denying him (P1).

### (b) The function

```sql
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_company uuid; v_exists boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- unknown action key is a programming error, not a denial: fail LOUDLY
  SELECT true INTO v_exists FROM public.permission_actions
   WHERE key = _action AND is_active;
  IF NOT COALESCE(v_exists, false) THEN
    RAISE EXCEPTION 'Unknown permission action %', _action USING ERRCODE = '22023';
  END IF;

  -- P1: the owner is unrestricted, always, before any table is consulted
  IF public.has_role(_user_id, 'owner') THEN RETURN true; END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN RETURN false; END IF;   -- ambiguous/no membership is refused

  -- P15: the person's own exception wins over his roles, in both directions
  RETURN COALESCE(
    (SELECT e.effect = 'allow'
       FROM public.user_permission_exceptions e
      WHERE e.user_id = _user_id AND e.action_key = _action
        AND e.company_id = v_company
        AND (e.expires_at IS NULL OR e.expires_at > now())),
    EXISTS (SELECT 1
              FROM public.user_roles ur
              JOIN public.role_permissions rp ON rp.role = ur.role
             WHERE ur.user_id = _user_id
               AND rp.action_key = _action
               AND rp.company_id = v_company));
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT public.has_permission(auth.uid(), _action) $$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.has_permission(text)       TO authenticated, service_role;
```

Why each choice: **STABLE** so the planner may cache it within a statement (see
(f)); **SECURITY DEFINER** because a caller must not need to read
`role_permissions` or another person's `user_roles` row to learn his own answer,
and because the two-argument form is called by edge functions about a user other
than the connection's; **`SET search_path = public, extensions`** is the pin the
definer guards already demand (`src/test/definer-search-path.test.ts`); **EXECUTE
to `authenticated` only** — anon has no permissions to ask about, and both forms
go into `KNOWN_AUTHENTICATED_EXECUTABLE` in the same pass that creates them, with
the counters bumped, or the guard suite fails.

Company scoping uses `current_company_id()` rather than a passed company, so it
cannot be pointed at another carrier. Ambiguous membership resolves NULL and is
refused — the same refusal `_shared/tenancy.ts` makes.

### (c) How a policy uses it — worked example, `lease_terminations` (P6)

Today: one policy, `Staff manage lease terminations`, `FOR ALL` with
`is_staff()` — any staff role, dispatcher and onboarding staff included. P6 says
owner and management only. P13 splits it in two:

```sql
-- undo: DROP POLICY lease_terminations_view ON public.lease_terminations;
--       DROP POLICY lease_terminations_change ON public.lease_terminations;
--       CREATE POLICY "Staff manage lease terminations" ON public.lease_terminations
--         FOR ALL TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY "Staff manage lease terminations" ON public.lease_terminations;

CREATE POLICY lease_terminations_view ON public.lease_terminations
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('lease_termination.view')));

CREATE POLICY lease_terminations_change ON public.lease_terminations
  FOR ALL TO authenticated
  USING      ((SELECT public.has_permission('lease_termination.change')))
  WITH CHECK ((SELECT public.has_permission('lease_termination.change')));
```

Seed rows, same migration:

```sql
INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
 ('lease_termination.view',  'View lease terminations',      'See termination records and their paperwork.', 'drivers', 'view'),
 ('lease_termination.change','Terminate a lease',            'Create or change a lease termination.',        'drivers', 'change');

INSERT INTO public.role_permissions (company_id, role, action_key)
SELECT c.id, r.role, r.action_key
  FROM public.carrier_profile c,
       (VALUES ('management'::app_role,'lease_termination.view'),
               ('management','lease_termination.change'),
               ('dispatcher','lease_termination.view'),
               ('onboarding_staff','lease_termination.view')) AS r(role, action_key);
```

The owner is granted nothing and loses nothing — P1 is in the function, not in
the rows. Dispatcher and onboarding staff keep the read they have today and lose
the write they should never have had. The restrictive `tenant_isolation` policy
on `lease_terminations` continues to run alongside, unchanged: company first,
then permission.

### (d) How an edge function uses it — worked example, `get-staff-list` `deactivate_user`

The function authenticates with `requireStaff`, then writes `profiles.account_status`
with the SERVICE-ROLE client. **On that client `auth.uid()` is NULL** — the note
already in `_shared/email/auth.ts:63-70` — so the one-argument form silently
returns false and the zero-argument convenience form is useless here. This is
exactly why `has_permission` takes an explicit `_user_id`:

```ts
const auth = await requireStaff(req, { roles: ['owner', 'management'] });
if (auth instanceof Response) return auth;

// P12: the gate is the database's answer, asked about the CALLER, before the write
const { data: allowed, error: permErr } = await auth.supabase
  .rpc('has_permission', { _user_id: auth.userId, _action: 'staff_account.suspend' });
if (permErr) return fail(500, 'Could not check permission', { cause: permErr.message });
if (allowed !== true) return fail(403, 'You do not have permission to suspend an account');

// ... existing service-role write, unchanged
```

Three properties worth stating: the RPC runs on the service client, so it needs
`service_role` EXECUTE (granted above); `current_company_id()` inside it resolves
from `_user_id`'s own membership, not from the connection, because the connection
has no identity — so a service-role call still cannot reach another carrier; and
`requireStaff` stays in place, because the permission check is not an
authentication check. The pattern for a function acting ON SOMEONE'S BEHALF is
the same call with the BENEFICIARY's id only when the question is genuinely about
him (a driver's own upload); when a staff member acts on a driver's record, the
question is about the staff member, and passing the driver's id would be the bug.

### (e) No row for the action

Two different situations, deliberately answered differently:

- **Action key not in `permission_actions`** — `RAISE EXCEPTION 'Unknown
  permission action %'`. A typo in a policy or an edge function is a programming
  error and must be loud. A silent `false` here is the worst outcome available:
  the action simply stops working for everyone, and the message the owner gets is
  "you do not have permission", which sends him looking at the wrong thing.
- **Key known, no grant and no exception** — returns **false. Closed by default.**
  This is the safer default and it is the one proposed. Its cost is real and
  should be named: the day an action is enforced, anyone whose grant was not
  seeded loses a working button, and it looks like a bug rather than a decision.
  Three things keep that cost small, and they belong to the building pass, not
  this one: every enforcement migration seeds its grants in the same file;
  the seed is derived from the inventory's "who can do it today" column unless a
  decision says otherwise; and a repo test asserts that every action key appearing
  in a policy or an edge function exists in `permission_actions` and holds at
  least one role grant for every existing carrier.

The rejected alternative — open by default, so an unseeded action behaves as it
does today — fails P8 outright: it means a permission can be believed to be
enforced while being a no-op, which is precisely the class of failure the
cron-secret pass spent a night on.

### (f) Performance

**How often:** once per statement, not once per row, provided every call site
wraps it as `(SELECT public.has_permission('x'))`. That wrapper is the whole
trick, and it is the same one the restrictive rollout already relies on for
`current_company_id()` across 159 tables: with no reference to a column of the
row being checked, the scalar subquery is an InitPlan, evaluated once and reused
for the whole statement. Written bare as `public.has_permission('x')` the planner
is entitled to call it per row, and on a `loads` scan of a few thousand rows that
is a few thousand executions — the difference between microseconds and a
noticeable pause. `STABLE` permits the caching; the subquery form is what makes
it happen. **Any policy written without the wrapper is a review failure.**

Per evaluation the cost is three index lookups: `permission_actions` by primary
key, `user_permission_exceptions` by its unique key, and `user_roles` joined to
`role_permissions` by its unique key — all small tables (`user_roles` is 185
rows). The one hot path to watch is `has_role(_user_id,'owner')` at the top,
which the owner's every query pays; it is an existing indexed function already on
this path everywhere. No caching layer is proposed anywhere: there is no cache to
go stale, and correctness after a grant change should not wait on an expiry.

## Step 3 — the first slice: five actions

Chosen on the prompt's own criterion, a mistake that is visible immediately
rather than silent, and on the record's own findings:

| # | action keys | why this one first | who holds it (P1-P11) | where enforcement goes | how the building pass proves the refusal |
|---|---|---|---|---|---|
| 1 | `driver.deactivate` (change) | One of the two remaining UI-ONLY actions. The database lets any staff deactivate a driver today; the damage is immediate and obvious on the dispatch board | owner (implicit), management | `operators` UPDATE policy split: the existing broad `is_staff()` UPDATE keeps serving onboarding writes, narrowed so that a change to `is_active` / `deactivated_at` requires the permission (column-condition in the policy, or a trigger refusal — the building pass picks one and says which) | a live dispatcher session UPDATEs `is_active` inside a RAISING transaction: 0 rows / 42501. Owner and management admitted. No real row committed |
| 2 | `lease_termination.view`, `lease_termination.change` | The other UI-only one, and the policy is plainly too wide; worked in full in (c) | view: all staff. change: owner, management | `lease_terminations` policies, as written in (c) | onboarding-staff session INSERT in a raising transaction → refused; management INSERT → accepted, then rolled back |
| 3 | `company_document.send` (change), `company_document.view` (view) | P7 names exactly three roles and the database today admits four. It sends paperwork OUTSIDE the company — the mistake leaves the building | view: all staff. send: owner, management, dispatcher | `document_send_log` INSERT policy; `company_documents` SELECT unchanged (all staff may view). The send edge function calls the two-argument form as in (d) | onboarding-staff session INSERT into `document_send_log` refused; dispatcher accepted and rolled back; the function refuses the same caller with 403 and sends no mail |
| 4 | `settlement.view`, `invoice.view` | The only ADDITION in the slice, and P2 has been owed since 2026-09-18: the dispatcher cannot see settlements or invoices today. An addition is the safest thing to ship first — if the grant is wrong, a screen is empty, nothing is destroyed | view: owner, management, dispatcher. onboarding staff NOT granted | `settlements`, `dispatch_settlements`, `invoices` gain a SELECT policy on the view permission; the existing management FOR ALL policies stay as the change side | dispatcher session SELECTs and now returns the same count management sees; onboarding-staff session returns 0 rows; both read-only, no write attempted |
| 5 | `staff_account.suspend` (change) | The service-role seam is the concrete case behind P12, and suspension is the live one left in `get-staff-list` after permanent deletion was closed | owner, management | inside `get-staff-list`, exactly as (d) | a dispatcher token is refused 403 by the function before any write; owner admitted (stopped at the role check, no account suspended) |

Not in the slice, on purpose: anything whose failure is silent (the broker
factoring status), anything with no screen yet (invoice creation), and the
`user_roles` grant path — that one needs `assign_user_role` to become the single
write path first, which is its own pass.

## Step 4 — what could go wrong

- **If the function is wrong, everything it guards stops at once.** A bad
  `current_company_id()` result, a wrong join, an exception row read in the wrong
  direction — any of these returns false for real staff across every table in the
  slice simultaneously. Mitigations, all cheap: P1's short-circuit is FIRST, so
  the owner can always get in and undo; every enforcement migration carries its
  `DROP POLICY` / restore-the-old-policy undo in a comment, as `0012` does; and
  the slice ships a few actions at a time (P10), never all sixteen.
- **A stale permission cache** would show buttons the database then refuses — the
  benign direction, and P8 already accepts it. The dangerous direction is a UI that
  caches an OLD ALLOW and an edge function that trusts the UI; that is why P12 puts
  the call before the write, not in the component. No server-side cache is proposed,
  and roles must NOT be read from JWT claims for this: `app_metadata.roles` is not
  populated in this project, a fact already written into
  `_shared/email/auth.ts:118-125`. A React Query cache of "can I" answers should be
  invalidated on role change, which today happens through `get-staff-list`.
- **The demo carrier.** `role_permissions` is company-scoped, so a second
  `carrier_profile` row starts with NO grants and, under (e)'s closed default,
  every staff member there is refused everything except what the owner can do.
  That is correct isolation and a broken demo at the same time. **Creating a
  carrier must seed its grants in the same transaction** — a `seed_role_permissions
  (company_id)` function called by whatever provisions a carrier. Worth recording
  now, because the second carrier is the next big piece of work and nothing
  currently provisions a carrier at all.
- **What the existing code will fight.** `is_staff()` is spread across hundreds of
  policies; the slice replaces it in four places and leaves the rest, so for a
  while two idioms coexist — acceptable, but it must be deliberate and stated in
  the migration. `operators` UPDATE is the awkward one: the same policy serves
  onboarding writes, driver self-updates and deactivation, so splitting it by
  column or by trigger needs care and is the one item in the slice I would expect
  to take a second attempt. `get-staff-list` runs `verify_jwt = false` and
  validates the token itself, so its permission call must come after its own
  validation, not before. And every new definer function must be registered in the
  guard suites' inventories in the same pass, or `definer-live-catalog` fails the
  default run.

## Step 5 — what this design does not cover

- **The 64 edge functions with no role check.** The design gives them a call to
  make; it does not make it. Only the one in the slice (`get-staff-list`
  `deactivate_user`/`suspend`) gains it. The 23 irreversible/outbound ones
  recorded on 2026-09-18 remain as they are apart from the five gated on
  2026-09-21 0019 UTC.
- **The remaining UI-only actions** are both in the slice; there is no third.
- **Inventory rows the first slice does NOT reach** — eleven of sixteen: create
  or edit a load (already correct); view loads read-only (already correct); create
  or edit an invoice (engine only, no UI); run or reopen a settlement — the CHANGE
  side is untouched, only the view side moves; view driver pay data — still WIDER
  than P2, onboarding staff keeps seeing it; edit pay policies; grant or remove a
  staff role (the service-role seam stays open); delete an account permanently
  (already closed 2026-09-18, not revisited); delete via `delete-user-account`
  (already correct, the pattern being copied); edit a broker's factoring status;
  the truck owner's view of his trucks (P5 — the pattern exists,
  `is_truck_owner_for_operator()`, and its COVERAGE remains unaudited; a permission
  cannot fix a missing scope check).
- **Also untouched:** storage-object access (buckets have their own policies and no
  action key here reaches them); the `permission_actions` catalogue has no settings
  screen in this design — the owner's first grants arrive by migration; and nothing
  here audits WHO changed a permission beyond `created_by`/`updated_by`, which is
  weaker than `audit_log` and should probably be upgraded when the screen is built.

## Files this pass authored

The platform commits each change as it is made; `git commit` is not available to
the agent, so there is no separate commit of this pass to paste.

- `docs/tms-build-status.md` — one appended dated entry: P12-P15 and the design.
- `docs/tms-wish-list.md` — permissions module: designed, not built.
- `docs/passes/2026-09-21-0132-permissions-design.md` (this report)

No application file, edge function, migration, test or database row was touched.
