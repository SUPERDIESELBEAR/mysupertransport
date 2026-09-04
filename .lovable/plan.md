# Three "pre-existing, unrelated" failures — re-established from live evidence

The 2026-09-04 `useAuth` pass called all three "pre-existing and unrelated". Two of
the three descriptions were wrong. Every claim below is labelled **[re-run]**
(vitest, this turn) or **[live]** (psql against the project database, this turn) or
**[file]** (read this turn).

---

## (c) The guard-suite finding — misdescribed, and it is ours

### 1. Verbatim failure output **[re-run]**

```
FAIL  src/test/definer-live-catalog.test.ts >
      live SECURITY DEFINER catalog (pg_proc) >
      every SECURITY DEFINER trigger function is attached to a live trigger
AssertionError: SECURITY DEFINER trigger function(s) not attached to any trigger.
Drop them or attach them:
  public.enforce_ica_contracts_operator_update(): expected [ Array(1) ] to deeply equal []
- Expected: []
+ Received: [ "public.enforce_ica_contracts_operator_update()" ]
  src/test/definer-live-catalog.test.ts:1012
```

### 2. Currently failing? **[re-run]** Yes — reproduces standalone. Not ordering, not
shared state, not a timeout.

### 3. Correcting the record

The report named it "an orphaned … from the earlier ICA trigger drop" and implied a
stale allowlist. **It is neither a stale allowlist nor a search_path finding.** The
guard that fails is the *trigger-attachment* assertion in
`definer-live-catalog.test.ts`, which reads `pg_proc` and `pg_trigger` live. Nothing
in `LEGACY_PUBLIC_ONLY_PINS` is involved, and `definer-search-path.test.ts` passes
clean **[re-run]**.

The build-status entry is also accurate and not in conflict: the 2026-08-31 re-pin
did happen and still holds **[live]**.

### 4. Every migration defining the function **[file]**

| Migration | What it does |
|---|---|
| `20260606131634_ee70f732…` | first `CREATE OR REPLACE`, plus `CREATE TRIGGER trg_enforce_ica_contracts_operator_update` |
| `20260610105245_d4d7a7da…` | re-authors the function |
| `20260801005113_d70ed44d…` | `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` |
| `20260830000607_3ebc9697…` | re-authors |
| `20260831133407_c620f689…` | **newest definition** — the 2026-08-31 re-pin, plus three explicit `REVOKE ALL` (PUBLIC, anon, authenticated) |
| `20260903214629_aafeb8a0…` | one statement only: `DROP TRIGGER IF EXISTS trg_enforce_ica_contracts_operator_update ON public.ica_contracts;` |

Live catalog **[live]**:

```text
enforce_ica_contracts_operator_update | secdef=t | search_path=public, extensions | anon=f | authenticated=f
```

The pin is correct, the grants are correct, and the function **still exists**. What
no longer exists is its trigger: `pg_trigger` on `ica_contracts` lists
`update_ica_contracts_updated_at`, `trg_ica_contracts_operator_column_whitelist`,
`trg_sync_ica_completion_to_onboarding` — and no
`trg_enforce_ica_contracts_operator_update` **[live]**.

**What the guard asserts:** a SECURITY DEFINER trigger function must be attached to
a live trigger. A definer function with no trigger is owner-privileged code sitting
in the schema with no caller — dead privileged surface.

**Why it fails:** migration `20260903214629` (the redundant-ICA-trigger-drop pass,
2026-09-03, this project) dropped the trigger and left the function behind. The
guard is doing exactly its job and caught our own leftover the same day.

**Verdict: OURS AND MUST BE FIXED.** The fix is one migration:
`DROP FUNCTION IF EXISTS public.enforce_ica_contracts_operator_update();` — provided
`trg_ica_contracts_operator_column_whitelist` genuinely covers the dropped trigger's
duty. That coverage claim was the premise of the 2026-09-03 drop and should be
re-read against both function bodies before dropping.

---

## (a) `operator-settlement-isolation` — genuinely external, and provably not a denial

### 1. Verbatim output **[re-run]** — none. Zero failures.

### 2. Currently failing? **No.** Run standalone twice:

```
✓ every settlement SELECT policy for authenticated is self-scoped   1341ms / 1125ms
✓ anon holds no privilege on any settlement table                   1086ms / 1125ms
✓ the deposit function is definer, pinned, and not PUBLIC           1103ms / 1088ms
✓ the deposit function returns the caller's balance only            1083ms / 1103ms
Test Files 1 passed | Tests 4 passed   (both runs)
```

### 5. Flake or real authorization failure?

**Infrastructure flake, and this one can be argued rather than assumed.** Three
independent reasons:

- Every assertion passes on repeat, twice, unmodified **[re-run]**.
- The suite cannot swallow a denial. `psql()` uses `execFileSync` with no
  `try`/`catch`; a permission error is a non-zero exit that throws and fails the
  test loudly. This is the opposite shape from the swallowed-default defect in the
  record — there is no default to fall back to.
- Each of the four `psql` calls takes ~1.1s of process startup. The full-suite run
  fires many psql-heavy suites concurrently; connection contention at that moment is
  the plausible cause of a timeout, and it did not recur when run alone.

**Verdict: GENUINELY EXTERNAL.** Sandbox/connection contention under parallel
full-suite execution. Worth noting the suite is slow enough to be flake-prone under
load, but nothing in the project caused it.

---

## (b) `parked-and-termination-guardrail` — ours, and "drift" is the wrong word

### 1. Verbatim output **[re-run]** — two failures, both reproduce standalone:

```
FAIL  parked — live schema and standing rows >
      parking writes no lease_terminations row — the standing set is untouched
AssertionError: expected 33 to be 31        (src/test/parked-and-termination-guardrail.test.ts:139)

FAIL  parked — live schema and standing rows >
      every voided row belongs to a driver who is still working
AssertionError: expected '1' to be '0'      (…:196)
```

### 2. Currently failing? **[re-run]** Yes, both, standalone.

### 6. What "standing-row count drift" actually is

The guard hard-codes a **data snapshot** taken on 2026-08-31:
`expect(Number(total[0])).toBe(31)` and `expect(Number(voided[0])).toBe(6)`
**[file]**. Live today **[live]**: `total = 33`, `voided = 6`.

The two extra rows, both written **2026-09-03** through the app **[live]**:

| Driver | Row created | is_active | excluded_from_dispatch |
|---|---|---|---|
| Edward Williams | 2026-09-03 14:37:02Z | false | false |
| Vino Huddleston | 2026-09-03 20:09:03Z | true | true |

The second failure has the same single cause. Of the six voided rows, five belong to
operators with `is_active = true, excluded_from_dispatch = false`. The sixth is
**Vino Huddleston**, whose old row was voided 2026-08-31 and who was then *actually*
terminated on 2026-09-03, flipping `excluded_from_dispatch` to true **[live]**. One
row, one driver, both assertions.

**Was it caused by project work?** No — not the seed loads, not the dispatch
settlement, not the `useAuth` pass. These are genuine staff terminations recorded in
production data after the snapshot was frozen.

**But the guard is ours, and it is written wrongly.** It asserts a census, not an
invariant. Any legitimate termination breaks it; the count will break again next
week. And the useAuth pass then used that breakage as evidence the run was clean —
a guard that cries wolf on normal operation teaches people to ignore it, which is
the same disease as an over-counting allowlist.

**Verdict: OURS AND MUST BE FIXED.** Rewrite both assertions as invariants:

- Replace the `31`/`6` literals with the invariant they were standing in for — that
  *parking* writes no termination row (the third assertion in the same test already
  checks exactly this, correctly, and passes).
- Re-scope "every voided row belongs to a driver who is still working" to the six
  named 2026-08-31 voids, or to voided rows with no *later* termination for the same
  operator — so a driver who is voided and then genuinely departs stops being a
  violation.

---

## Verdicts

| Failure | Verdict |
|---|---|
| (c) orphaned `enforce_ica_contracts_operator_update` | **OURS AND MUST BE FIXED** — our 2026-09-03 trigger drop left a definer function with no trigger. Not a stale allowlist; not the search_path pin, which is correct and intact. |
| (a) `operator-settlement-isolation` | **GENUINELY EXTERNAL** — passes twice standalone; the suite throws on denial and cannot mask one. |
| (b) `parked-and-termination-guardrail` | **OURS AND MUST BE FIXED** — the guard hard-codes a 2026-08-31 row census; two real terminations on 2026-09-03 broke it. The data is right; the assertions are wrong. |

Two of the three were reported as "pre-existing and unrelated". Only one was.
