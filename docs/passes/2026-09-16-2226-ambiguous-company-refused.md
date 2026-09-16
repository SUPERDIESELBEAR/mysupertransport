# Pass report — an ambiguous company resolves to NOTHING (owner decision C)

2026-09-16 2226 UTC. BUILD MODE. Immutable: append corrections, do not rewrite.

Read first, as instructed: the 2026-09-16 record entries (read-enforcement
decision; "restrictive tenant policy, pilot batch of four" section (e)),
`docs/passes/2026-09-16-1920-restrictive-policy-precheck.md` section (e), and
`supabase/functions/_shared/tenancy.ts`.

**Nothing in the prompt contradicted the live system or the record.** The final
prompt line (`END OF PROMPT…`) arrived intact; the prompt was not truncated.

---

## 1. The decision, recorded

Owner decision C: a user matching more than one distinct company across
`company_members`, `operators` and `truck_owners` resolves to NO company.
Rejected: **A** one-company-per-person by constraint (too rigid — a driver
joining a second carrier would need a new login); **B** pick-by-rule such as
newest (silently shows the wrong carrier while both links are live). C never
shows wrong data, fails as a visible empty screen, costs nothing now, and defers
the company switcher to the first real person who needs two companies.

Recorded in `docs/tms-build-status.md`, entry `2026-09-16 2226 UTC`.

## 2. Census — zero, inactive rows included

```sql
SELECT user_id, count(DISTINCT company_id) AS companies
FROM (
  SELECT user_id, company_id FROM public.company_members
  UNION ALL SELECT user_id, company_id FROM public.operators     WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id, company_id FROM public.truck_owners  WHERE user_id IS NOT NULL
) s
WHERE company_id IS NOT NULL
GROUP BY user_id HAVING count(DISTINCT company_id) > 1;
```

Result: **0 rows.** No `status`/`is_active` filter, so terminated operators and
inactive truck-owner rows are counted. `SELECT count(*) FROM carrier_profile` →
`1`. The owner's expectation held; no STOP condition triggered.

## 3. Every resolver found

Discovery query (first attempt failed: `pg_get_functiondef` was applied to
aggregates; corrected with `p.prokind = 'f'`) over live bodies matching
`company_members|operators|truck_owners` keyed on a user.

| resolver | what it did with two matches | changed? |
|---|---|---|
| `public.current_company_id()` | returned the FIRST source's `LIMIT 1` row | YES |
| `public.stamp_company_from_recipient()` | picked one recipient company | YES — RAISEs |
| `public.stamp_eld_malfunction_notification_company_id()` | picked one | YES — RAISEs |
| `public.stamp_tenant_company_id()` | calls the resolver | no |
| `public.assign_user_role()` | calls the resolver | no |
| `public.has_role()` | compares a role's company to the resolver | no |
| `public.stamp_inspection_document_company_id()` | derives from `NEW.driver_id`; bare scalar subquery raises `21000` on two rows | no |
| `public.bootstrap_assign_owner()` | reads the carrier row, not a user | no |
| `_shared/tenancy.ts` `companyIdForUser` | `maybeSingle()` raised vaguely | YES |
| `_shared/tenancy.ts` `companyIdForAnyUser` | `.limit(1)` per source, first hit won | YES |

BEFORE body:

```sql
SELECT COALESCE(
  (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid() LIMIT 1),
  (SELECT o.company_id  FROM public.operators o        WHERE o.user_id  = auth.uid() LIMIT 1),
  (SELECT t.company_id  FROM public.truck_owners t     WHERE t.user_id  = auth.uid() LIMIT 1)
)
```

AFTER body (live, quoted from `pg_get_functiondef`, comments elided here):

```sql
SELECT CASE WHEN count(*) = 1 THEN (array_agg(d.company_id))[1] END
FROM (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
  UNION SELECT o.company_id FROM public.operators o    WHERE o.user_id  = auth.uid()
  UNION SELECT t.company_id FROM public.truck_owners t WHERE t.user_id  = auth.uid()
) d
WHERE d.company_id IS NOT NULL
```

Still `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public',
'extensions'`. First migration attempt failed verbatim:
`ERROR: 42883: function min(uuid) does not exist` — hence `(array_agg(...))[1]`.

GRANTS, before and after, identical (shown, not assumed):

```
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres
```

Linter total unchanged at **172**.

## 4. Proof, and what could not be done

The sandbox psql role cannot execute the function:

```
ERROR:  permission denied for function current_company_id
```

(followed by `current transaction is aborted` on the rest of the script), and it
cannot insert `carrier_profile` or `company_members` rows. **Labelled as the
nearest honest means:** a migration-channel `DO` block that stages the ambiguity
and RAISEs at the end, so nothing persists. Verbatim output:

```
=== AMBIGUITY PROOF (this block aborts; nothing persists) ===
staff  one company  -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
staff  two companies -> NULL
driver one company  -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
driver operator row + scratch membership -> NULL
owner  one company  -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
owner  truck_owners row + scratch membership -> NULL
```

Identities: staff Marcus Mueller `5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`, driver
Steve Figueroa `878be880-396a-4dd6-9ae1-787df2a5e749`, truck owner Donald
Alleyne `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`. The first attempt tried a second
`operators` row and failed:

```
ERROR: 23505: duplicate key value violates unique constraint "operators_user_id_key"
DETAIL: Key (user_id)=(878be880-396a-4dd6-9ae1-787df2a5e749) already exists.
```

`operators_user_id_key` and `truck_owners_user_id_key` are globally unique, so
ambiguity for a driver or owner can only be staged ACROSS sources — which is
what the corrected proof does. Afterwards: `carrier_profile` = 1 row, scratch
memberships = 0.

## 5. Edge helpers — RED first, then green

`src/test/tenancy-helper-ambiguity.test.ts` (new, 7 tests) run against the OLD
helper: **3 failed**, including the two vague messages that motivated the
change:

```
Could not resolve company from company_members: multiple rows returned
Could not resolve company membership: multiple rows returned
```

Neither names the user, and both read like a transport failure. After the
change: **7/7 passed**. `companyIdForAnyUser` now reads all three sources
together and refuses; `companyIdForUser` refuses two memberships explicitly;
zero matches still throw. No `.limit(1)` remains in the file. A typing defect
surfaced in the harness typecheck and was fixed:
`tenancy.ts(47,3): error TS2322: Type 'unknown[]' is not assignable to type 'string[]'`.

## 6. Before/after — real sessions, four pilot tables

Each identity was signed in for real (`lovable auth-session --json --user …`),
counted over PostgREST with `Prefer: count=exact`, `Range: 0-0`. No token was
printed or logged.

| identity | cert_reminders | brokers | facilities | active_dispatch |
|---|---|---|---|---|
| owner Marcus Mueller | 53 | 13 | 2 | 80 |
| dispatcher Leo Wallace | 53 | 13 | 2 | 80 |
| onboarding_staff Mae Lauron | 53 | 13 | 2 | 80 |
| driver Steve Figueroa | 0 | 0 | 2 | 1 |
| truck owner Donald Alleyne | 0 | 0 | 0 | 1 |

**Identical to the pilot's numbers.** Nothing was lost.

## 7. Guard

`src/test/tenancy-resolver.test.ts`: the existing "exactly one COALESCE"
assertion was inverted to `0` with the reason annotated in place (the preference
chain is gone, so there is no chain to smuggle a fourth fallback into). New
`ambiguityProblems()` + describe block asserts on the LIVE body: no `LIMIT`, no
`COALESCE`, `count(*) = 1` present, `UNION` present; that the three sources are
exactly `company_members`, `operators`, `truck_owners`; and that no other live
user→company resolver contains a `LIMIT`. Body text, not behaviour, because the
test runner shares the psql role that cannot execute the function (section 4).

Demonstrated failing by pointing the fixture assertion at the CURRENT body:

```
FAIL  src/test/tenancy-resolver.test.ts > an ambiguous company resolves to NOTHING (owner decision C) > FIXTURE — the pre-decision body is flagged
AssertionError: expected [] to deeply equal [ …(4) ]
- [
-   "resolver body contains a LIMIT — it picks a row instead of refusing",
-   "resolver body contains COALESCE — a preference chain returns the first source, not a refusal",
-   "resolver body does not require exactly one distinct company",
-   "resolver body does not read the three sources together",
- ]
+ []
```

Restored byte-identically (`diff` clean, guard green). The fixture holding the
pre-decision body is DISCLOSED as authored: the sandbox role cannot
`CREATE OR REPLACE` a function, so the old body cannot be staged live.

One earlier false start, recorded rather than hidden: a word-based `LIMIT` check
matched the word inside a comment; the comment was reworded to "NO ROW-PICKING
CLAUSE" and the check now strips `--` comments before testing.

## 8. Suites, typecheck, deploys

11 suites — tenancy-resolver, tenancy-helper-ambiguity, definer-live-catalog,
definer-search-path, definer-fail-open, grant-parity-live, policy-grant-parity,
notification-isolation, operator-fuel-isolation, operator-settlement-isolation,
function-reachability — **194 tests passed**, 392 s, plus one pre-existing
unhandled error, quoted and NOT diagnosed:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

`npx tsgo -p tsconfig.app.json --noEmit` → exit 0.
`deno check supabase/functions/_shared/tenancy.ts` → `Check … tenancy.ts`.

Deployed, all 15 importers of `_shared/tenancy.ts`: bootstrap-admin,
create-preview-session, create-test-operator, get-staff-list, invite-operator,
invite-staff, invite-truck-owner, manage-group-thread, provision-demo-driver,
provision-test-driver, receive-rate-con-email, reset-demo-driver,
send-binder-share, send-ica-review-link, send-officer-packet. Deployment
confirmed two ways: the deploy call reported all 15 by name, and a live
unauthenticated POST to `get-staff-list` returned
`401 {"error":"Unauthorized"}` — live and refusing, not a `404`.

## 9. Files changed

- `supabase/functions/_shared/tenancy.ts` — `distinctCompanies`, both exported
  helpers refuse ambiguity by name; no `.limit(1)`.
- `src/test/tenancy-helper-ambiguity.test.ts` — new, 7 tests.
- `src/test/tenancy-resolver.test.ts` — COALESCE assertion inverted with reason;
  ambiguity guard added; restored byte-identically after the failure demo.
- Database migration — `current_company_id`, `stamp_company_from_recipient`,
  `stamp_eld_malfunction_notification_company_id`; grants re-applied.
- `docs/tms-build-status.md` — entry `2026-09-16 2226 UTC`, sections (a)–(g).
- `docs/tms-wish-list.md` — MULTI-COMPANY AMBIGUITY moved to RECENTLY CLOSED
  (company switcher still unbuilt, triggered by the first real two-company
  person); the dispatcher broker `DELETE` finding moved from PREREQUISITES to
  VERIFICATION GAPS, reworded as the owner specified, with the
  `BrokersListPage canDelete={isManagement}` citation confirmed live at line
  240. No duplicate items created.
- This report, written last and committed.

## 10. Boundary

Still ONE carrier. The refusal is proven by an aborted staging block and by the
live body — not by a real person belonging to two companies, because none
exists. Cross-carrier isolation remains undemonstrated for the 143 tables still
without a restrictive policy. Deployed-vs-repo parity of the 15 functions rests
on the deploy tool's own report, which remains a listed verification gap.
