# Pass report — restrictive tenant policy, PILOT BATCH (4 tables)

2026-09-16 2007 UTC. BUILD MODE. Immutable: append corrections, do not rewrite.

Read first, as instructed: the 2026-09-16 record entries (read-enforcement
decision, census, unassigned-tables/readiness) and
`docs/passes/2026-09-16-1920-restrictive-policy-precheck.md`.

**Nothing in the prompt contradicted the live system or the record.** The one
deliberate departure from the pre-check was named by the prompt itself:
`brokers` replaces the proposed `broker_notes`, because `broker_notes` has 0
rows and a mistake there would be invisible. The final prompt line
(`END OF PROMPT…`) arrived intact; the prompt was not truncated.

---

## 1. What was built

One migration, four `CREATE POLICY` statements, nothing else touched — no
permissive policy edited, no column, no trigger, no grant, no data.

```sql
CREATE POLICY tenant_isolation ON public.<table>
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

on `cert_reminders`, `brokers`, `facilities`, `active_dispatch`.
`company_members` was not a target.

Live `pg_policies` after, all four identical in shape:

```
<table>|tenant_isolation|RESTRICTIVE|ALL|{authenticated}
  qual       = (company_id = ( SELECT current_company_id() AS current_company_id))
  with_check = (company_id = ( SELECT current_company_id() AS current_company_id))
```

Policy count **560 → 564**, exactly as predicted. Linter total **172**,
unchanged, no new finding type (4 INFO rls-enabled-no-policy, 3 extension-in-public,
31 anon-definer, 133 authenticated-definer, 1 leaked-password — all pre-existing).
`npx tsgo -p tsconfig.app.json --noEmit` → exit 0.

## 2. BEFORE / AFTER counts, real sessions

The sandbox cannot `SET ROLE`. Each identity was signed in for real via
`lovable auth-session --json --user <uuid>`; counts were taken over PostgREST
with `Prefer: count=exact`, `Range: 0-0`. No token was printed, logged or
summarised.

| identity | cert_reminders | brokers | facilities | active_dispatch |
|---|---|---|---|---|
| owner Marcus Mueller `5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe` | 53 → 53 | 13 → 13 | 2 → 2 | 80 → 80 |
| dispatcher **Leo Wallace** `7d80cc10-4e82-4e96-a8e2-70bb9c1b46ef` | 53 → 53 | 13 → 13 | 2 → 2 | 80 → 80 |
| onboarding_staff **Mae Lauron** `2cedd3ac-cd90-46fb-8c43-bfe7595264ea` | 53 → 53 | 13 → 13 | 2 → 2 | 80 → 80 |
| driver Steve Figueroa `878be880-396a-4dd6-9ae1-787df2a5e749` | 0 → 0 | 0 → 0 | 2 → 2 | 1 → 1 |
| truck owner Donald Alleyne `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0` | 0 → 0 | 0 → 0 | 0 → 0 | 1 → 1 |
| service role (psql) | 53 | 13 | 2 | 80 |

**Zero differences.** Step 4's stop condition did not trigger. The zeros are
pre-existing permissive refusals (the same zeros were read BEFORE the migration),
not the new policy emptying a screen.

## 3. Write test, as dispatcher Leo, quoted

| step | result |
|---|---|
| insert without `company_id` | `201`, stamped `6b54d0e6-8743-4284-b55b-8cd094b093dd` |
| insert with `company_id = 0000…00ff` | `201`, **stored as `6b54d0e6-…`** — the stamp overwrote the spoof |
| update `mc_number` | `200` |
| update `company_id` → `0000…00ff` | `403` `{"code":"42501","message":"new row violates row-level security policy \"tenant_isolation\" for table \"brokers\""}` |
| delete, as Leo | `200`, **empty body, both rows still present** |
| delete, as owner (cleanup) | both rows returned and removed |
| residue | `count(*) WHERE company_name LIKE 'SCRATCH%'` = **0**; `brokers` = 13 |

Two things worth stating plainly:

- On stamped tables the restrictive `WITH CHECK` is a SECOND line of defence,
  not the first: the BEFORE trigger rewrites a spoofed `company_id` before the
  check runs, so the insert succeeds rather than being refused. The refusal
  that IS the new policy's own is the UPDATE that tries to move a row to
  another company.
- The zero-row dispatcher `DELETE` returning `200` is a pre-existing
  authorisation gap (`brokers_mgmt_all` is management/owner; PostgREST reports a
  zero-row delete as success). Found here, NOT fixed here; added to the
  follow-up list.

Two false starts, recorded rather than hidden: the write script first used a
`name` column (`PGRST204` / `42703` — the column is `company_name`), and the
guard's first query used `ORDER BY 1, 2` over a single expression
(`ERROR: ORDER BY position 2 is not in select list`). Both were the probe being
wrong, not the system.

## 4. Guards — `src/test/tenancy-resolver.test.ts`

**The pre-existing guard failed first, and its failure was wrong.** "no billing
policy admits a caller merely because a company resolves" named all four new
policies. It was narrowed with `permissive = 'PERMISSIVE'`, annotated in place:
the rule is about policies that GRANT, and a restrictive policy can only REMOVE
access, so a role-less restrictive company predicate admits nobody.

New guard "every company_id table either carries tenant_isolation or is
pending": reads the 148 company-bearing tables and every restrictive policy
live; three ledgers — `RESTRICTIVE_DONE` (4), `RESTRICTIVE_EXEMPT`
(`company_members`), `PENDING_RESTRICTIVE` (**143**); asserts exact shape, no
stray restrictive policy on a table without `company_id`, no undeclared table,
no stale pending entry, and none on `company_members`.

Demonstrated failures, each followed by a byte-identical restore (`diff` clean,
guard green):

1. undeclared — `these tables have company_id and no restrictive-policy disposition … expected [ 'brokers' ] to deeply equal []`
2. stale — `stale PENDING_RESTRICTIVE entries: expected [ Array(1) ] to deeply equal []`
3. missing policy — `invoices: no restrictive policy: expected [ 'invoices: no restrictive policy' ] to deeply equal []`
4. duplicate policy and wrong predicate — **AUTHORED FIXTURES, disclosed as
   such in the file and here.** The sandbox role cannot `CREATE POLICY`, so
   neither a second policy nor a literal-uuid predicate can be staged in the
   database. The shape check was extracted into `restrictiveShapeProblems()`
   and run against hand-written rows. These two prove the CHECK, not the
   DATABASE.

## 5. Suites

12 named suites, **191 tests, all passed**, 369 s: `tenancy-resolver`,
`policy-grant-parity`, `grant-parity-live`, `definer-live-catalog`,
`definer-fail-open`, `definer-search-path`, `notification-isolation`,
`operator-fuel-isolation`, `operator-settlement-isolation`,
`operator-pay-exposure`, `function-reachability`, `caller-evaluated-functions`.

One unhandled error, quoted and NOT diagnosed, already on the record:
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"` — a reporter RPC
timeout, not an assertion.

## 6. Boundary

**CROSS-CARRIER REFUSAL STILL NOT DEMONSTRATED: ONE CARRIER EXISTS.** Proven:
the policy is present, exactly shaped, and costs the existing carrier nothing;
plus one real refusal of a company-change. Not proven: that a second carrier's
rows would be hidden. Blocked on carrier #2, itself blocked on the unordered
`LIMIT 1` in `current_company_id()`.

**144** company-bearing tables carry no restrictive policy: 143 pending, plus
`company_members` permanently exempt.

## 7. Documentation

- `docs/tms-build-status.md` — new dated entry, sections (a)–(e).
- `docs/tms-wish-list.md` — the read-enforcement decision moved to RECENTLY
  CLOSED and struck through under OWNER DECISIONS OWED; rollout added under
  DECIDED, NOT BUILT; multi-company `LIMIT 1` and the dispatcher-DELETE finding
  added under PREREQUISITES. **No Module 7 Pass 6 clarification was added: the
  existing PARKED line already states that the record names no blocker and no
  pass number for a Module 7 Pass 6.** No duplicate items created.
- This report, written last and committed.

The owner will separately inspect the dispatch board, the compliance panel and
realtime behaviour on the four pilot tables. Nothing in this pass can substitute
for that: 21 realtime subscriptions touch company-bearing tables, and a
restrictive policy also filters realtime payloads.
