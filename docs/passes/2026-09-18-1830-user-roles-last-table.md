# Pass report — restrictive tenant policy: `user_roles`, THE LAST TABLE

2026-09-18 1830 UTC. BUILD MODE. Immutable: append corrections, do not rewrite.

Read first, as instructed: `docs/passes/2026-09-18-1358-contractor-pay-setup.md`
in full, including its statement of why `user_roles` goes last. **Nothing in the
prompt contradicted the live system or the record.** The prompt's final line
(`END OF PROMPT…`) arrived intact; the prompt was not truncated.

---

## 1. Step 1 — THE LOCK-OUT CHECK, before anything was written

All 185 rows compared with the company their user resolves to through
`current_company_id()`'s three sources read TOGETHER, reproducing the resolver's
own `CASE WHEN count(*) = 1` rule rather than trusting it:

```sql
WITH resolved AS (
  SELECT u.user_id,
         (SELECT CASE WHEN count(*)=1 THEN (array_agg(d.company_id))[1] END FROM (
            SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = u.user_id
            UNION SELECT o.company_id FROM public.operators o WHERE o.user_id = u.user_id
            UNION SELECT t.company_id FROM public.truck_owners t WHERE t.user_id = u.user_id
          ) d WHERE d.company_id IS NOT NULL) AS resolved_company
  FROM (SELECT DISTINCT user_id FROM public.user_roles) u
)
SELECT 'a_mismatch', count(*) FROM public.user_roles ur JOIN resolved r USING (user_id)
  WHERE r.resolved_company IS NOT NULL AND ur.company_id <> r.resolved_company
UNION ALL
SELECT 'b_no_company', count(DISTINCT ur.user_id) FROM public.user_roles ur JOIN resolved r USING (user_id)
  WHERE r.resolved_company IS NULL
UNION ALL
SELECT 'c_multi_company_roles', count(*) FROM (
  SELECT user_id FROM public.user_roles GROUP BY user_id HAVING count(DISTINCT company_id) > 1) x;
```

```
        finding        | count
-----------------------+-------
 a_mismatch            |     0
 b_no_company          |     0
 c_multi_company_roles |     0
```

All three empty, so the migration was allowed. 185 rows, 173 distinct users,
`company_id` NOT NULL with zero nulls, every row on the one live carrier
`6b54d0e6-8743-4284-b55b-8cd094b093dd`. Triggers: `aa_stamp_tenant_company_id`
(BEFORE INSERT, `stamp_tenant_company_id`) and `enforce_owner_role_writes`
(BEFORE INSERT OR DELETE OR UPDATE). Three permissive policies, all `{public}`:
"Management can view all roles", "Owner can view all roles", "Users can view
their own roles".

## 2. Step 2 — THE READ PATHS

**As the signed-in user (15 sites):** `src/hooks/useAuth.tsx:148` (the one that
decides roles and therefore the portal), `src/pages/staff/PipelineDashboard.tsx:1053`,
`src/pages/dispatch/DispatchPortal.tsx:966`, `src/pages/dispatch/DispatchBoardPage.tsx:147`,
`src/pages/dispatch/LoadsListPage.tsx:168`, `src/lib/loadDetail.ts:384`,
`src/pages/management/OwnershipTransferPage.tsx:78`,
`src/components/management/DemoAccountsPanel.tsx:85`,
`src/components/management/DeactivationWizardContent.tsx:1044`,
`src/components/messaging/ManageGroupModal.tsx:176`,
`src/components/messaging/NewDirectMessageModal.tsx:49`,
`src/components/staff/AssignNotificationModal.tsx:56`,
`src/components/service-library/HelpRequestModal.tsx:44`,
`src/components/inspection/InspectionComplianceSummary.tsx:400`,
`src/hooks/useStaffBirthdayAnniversaryEvents.ts:154`.

**Through a definer function: 22 functions, every one `prosecdef = t` and owned
by `postgres`, the table's own owner** — `assign_user_role`,
`bootstrap_assign_owner`, `count_unused_resume_tokens`, `get_staff_contact_info`,
`get_thread_participants`, `has_role`, `is_staff`, `list_driver_contacts`,
`log_notification_delivery_failure`, `notify_on_truck_down`,
`notify_operators_on_fleet_share`, `notify_owner_on_pay_setup_submitted`,
`notify_staff_on_osas_signed`, `notify_staff_on_release_note`,
`notify_staff_on_return_receipt`, `raise_eld_sync_alert`,
`record_revoked_list_check`, `record_rods_divergence`, `record_rods_unlock`,
`remove_user_role`, `submit_accessorial_adjustment`, `transfer_owner`.

```
 definer | invoker
---------+---------
      22 |       0
```
```
 relname    | relrowsecurity | relforcerowsecurity | relowner
 user_roles | t              | f                   | postgres
```

Owner-equals-owner and NOT FORCE RLS together mean RLS is not applied inside
those functions at all, so they keep working.

Worth stating plainly: `has_role()` and `is_staff()` ALREADY compared
`ur.company_id = public.current_company_id()` (with a named `service_role`
escape) before this pass, quoted live. The new policy is therefore a SECOND line
of defence on the client read path, not a new rule for the role checks. Edge
functions read the table 63 times, all through the service-role admin client,
which RLS does not apply to.

## 3. Step 3 — THE UNDO, written before the change

```sql
DROP POLICY tenant_isolation ON public.user_roles;
```

Runnable in this same pass through the migration tool (`DROP POLICY` is DDL and
not a breaking schema change). **It was not needed — nothing regressed.**

## 4. Steps 4 and 6 — BEFORE and AFTER, five real sessions, one sign-in each

Headless browser against the running app: session restored to `localStorage`,
`/dashboard` opened, roles read exactly as `useAuth` reads them, rendered portal
taken from the page.

| identity | roles (session) | rows | lands on | after |
|---|---|---|---|---|
| Marcus Mueller (owner) | dispatcher, management, onboarding_staff, operator, owner | 5 | `/dashboard` → Management portal | IDENTICAL |
| Leo Wallace (dispatcher) | dispatcher | 1 | `/dashboard` → Dispatch portal | IDENTICAL |
| **Mae Lauron** | **management, onboarding_staff** | **2** | `/dashboard` → Management portal | **IDENTICAL — both roles survived** |
| Steve Figueroa (operator) | operator | 1 | `/operator/home` | IDENTICAL |
| Donald Alleyne (truck owner) | truck_owner | 1 | `/operator/home` | IDENTICAL |

`error: null` on all five, before and after. The rendered navigation was compared
as text, not just the URL — Leo's "Dispatch Board | Driver Status | Loads | Rate
Con Inbox | 3 | Facilities …", Mae's and Marcus's "Overview | Messages |
RECRUITING | Applications | Onboarding Pipeline | 34 | PEI Q …", Steve's and
Donald's "Home | Status | Upload Docs …" — byte-identical.

One harness note, recorded rather than hidden: the first before-run gave Marcus
only the spinner ("SUPERDRIVE") because 6 s was not long enough for the
Management portal to mount. The wait was raised to 12 s and BOTH phases were then
run with the identical script, so the comparison is like for like.

## 5. Step 5 — MIGRATION

`drizzle/migrations/0012_restrictive_tenant_policy_user_roles.sql`, the pilot's
exact shape and nothing else. No function created or replaced, so no EXECUTE
grant changed and there is nothing new to revoke from PUBLIC/anon/authenticated.
Live afterwards:

```
 qual                                                                | polpermissive | polroles
 (company_id = ( SELECT current_company_id() AS current_company_id)) | f             | {authenticated}
```

## 6. Step 7 — PROBES, inside a transaction that raises

Stated up front, as the last two passes did: **the move-to-another-company
refusal is NOT demonstrable here.** `aa_stamp_tenant_company_id` is BEFORE INSERT
and rewrites `company_id` before the policy is evaluated; the psql role is denied
UPDATE on the table; one carrier exists.

```
NOTICE:  blank insert stamped: 6b54d0e6-8743-4284-b55b-8cd094b093dd  matches real carrier: t
NOTICE:  spoofed insert stored: 6b54d0e6-8743-4284-b55b-8cd094b093dd  matches real carrier: t
ERROR:  PROBE ROLLBACK -- nothing committed
```

Residue: `185` rows, `0` on any company other than the real one. Two false
starts, the probe being wrong rather than the system: calling
`current_company_id()` directly gave `permission denied for function
current_company_id`, and a random `user_id` hit `user_roles_user_id_fkey`.

## 7. Step 8 — GUARD

Failed first on the stale entry, quoted:

```
+   "user_roles: declared pending but already carries a restrictive policy",
 ❯ src/test/tenancy-resolver.test.ts:2268:56
```

`user_roles` moved into `RESTRICTIVE_DONE` with the reasoning attached;
`PENDING_RESTRICTIVE` is now `[] as const`.

**What the guard asserts with an empty list, and why it is not vacuous.**
Coverage was never asserted against the pending list — it is asserted against the
LIVE catalogue: `undeclared` fails for any `company_id` table absent from both
lists, and `restrictiveShapeProblems` fails with "no restrictive policy" for any
DONE table whose policy disappears. The one line that WOULD have become
meaningless, `expect(PENDING_RESTRICTIVE.length).toBeGreaterThan(0)`, was
replaced by a check that the DONE list has not been emptied or truncated relative
to the live inventory. Demonstrated live by removing `'brokers'` from the DONE
list:

```
AssertionError: the DONE list shrank below the live inventory — it was lost or truncated: expected 158 to be greater than or equal to 159
 ❯ src/test/tenancy-resolver.test.ts:2258:8
```

Restored byte-identical (`diff` clean) and green: **125 passed** (one
`onTaskUpdate` reporter timeout, not an assertion).

Totals: **719 policies in `public`, 159 RESTRICTIVE**, linter **170** — unchanged,
no new finding type (2 INFO rls-enabled-no-policy, 3 extension-in-public, 31
anon-definer, 133 authenticated-definer, 1 leaked-password, all pre-existing).

## 8. Step 9 — RECORD AND LIST

- `docs/tms-build-status.md` — two new dated entries: "2026-09-18 1830 UTC —
  restrictive tenant policy: `user_roles`, THE LAST TABLE" with sections (a)–(f),
  and the closing "THE RESTRICTIVE ROLLOUT IS COMPLETE".
- `docs/tms-wish-list.md` — the rollout moved to RECENTLY CLOSED; the
  DECIDED-NOT-BUILT line struck through, keeping the two facts that are still
  live there (the owner's passed live-update check, and the 8 subscribed-but-
  unpublished tables). Cross-carrier isolation is stated plainly as remaining
  STRUCTURAL, NOT DEMONSTRATED, until a second `carrier_profile` row exists.

**COMPLETE: 159 tables over 8 passes.** `company_members` permanently exempt
(the resolver reads it, so a restrictive company predicate on it is circular).
Three gaps remain and are recorded as gaps, not passes:

1. Cross-carrier refusal has never been demonstrated — one carrier exists.
2. `enforce_remittance_immutability` and
   `enforce_accessorial_adjustment_immutability` have never been observed
   refusing anything (zero remittance rows; no permissive UPDATE policy admits
   any of the five identities).
3. Eight screens subscribe to tables the database never publishes — pre-existing,
   unaffected by this rollout.

## 9. Step 10 — FULL SUITE and TYPECHECK

The first full run failed WHOLESALE, and the reason was the harness, not the
code. Quoted verbatim:

```
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (35.160.209.8), port 6543 failed: FATAL:  (ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked
```
```
 Test Files  23 failed | 179 passed | 2 skipped (204)
      Tests  279 failed | 1742 passed | 16 skipped (2037)
```

Every one of the 279 was that same pooler circuit breaker — the default worker
count opens more simultaneous `psql` authentications than the pooler allows. The
breaker was waited out (`psql back after 10s`) and the WHOLE suite re-run with
`--maxWorkers=4`:

```
 Test Files  202 passed | 2 skipped (204)
      Tests  2021 passed | 16 skipped (2037)
     Errors  2 errors
   Duration  425.92s
```

The 2 errors are the known `[vitest-worker]: Timeout calling "onTaskUpdate"`
reporter RPC timeouts, not assertions. `npx tsgo -p tsconfig.app.json --noEmit`
→ `TYPECHECK CLEAN`.

## 10. Files this pass authored

The platform commits each change as it is made — `git status --porcelain` is
empty and `git commit` is not available to the agent, so there is no commit of
this pass alone to paste. Real output, against the previous pass's commit
`8598a67c4`:

```
$ git diff --stat 8598a67c4
 docs/tms-build-status.md                           | 220 +++++++++++++++++++++
 docs/tms-wish-list.md                              |   5 +-
 .../0012_restrictive_tenant_policy_user_roles.sql  |   7 +
 drizzle/migrations/meta/0012_snapshot.json         |  18 ++
 drizzle/migrations/meta/_journal.json              |   7 +
 src/test/tenancy-resolver.test.ts                  |  38 ++--
 6 files changed, 283 insertions(+), 12 deletions(-)
```

Plus this report, written last.
