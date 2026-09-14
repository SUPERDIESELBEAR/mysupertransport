# Correct the record, then make the charge gate the first statement

Two pieces. Nothing about who is authorised changes.

## 1. Record correction (documentation only)

Edit `docs/tms-build-status.md` only. Correct the 2026-09-14 note that describes
`add_load_charge` as `SECURITY DEFINER`, signed-in-executable and carrying no role
test. The correction cites the LIVE catalog (`pg_get_functiondef`), not the migration
file:

- The live body's first statement is `PERFORM public.assert_charge_entry_allowed(p_load_id)`,
  which refuses anyone who is not management, owner or dispatcher, then refuses a load
  whose money is fixed.
- `assert_charge_entry_allowed` is NOT granted to `authenticated`; it runs as owner
  inside the definer callers only.
- One migration (`20260831192947_b1cf8884…`) ever defines `add_load_charge`, and the
  gate call was present in that original authoring. No call was ever removed.
- Live driver probe: `You do not have permission to change charges on a load`,
  zero rows written.

Record the provenance honestly: the false note came from a reviewer misreading the
migration text, and it is the same shape as the four previous reviewer assertions that
entered the record as fact. Restate the existing source-citation guard: a claim about
a function's behaviour is recorded from the live catalog or not at all.

## 2. Put the gate first in `update_load_charge` and `delete_load_charge`

Today both look the charge up, and only then call the gate. Two consequences worth
removing:

- A driver attempting a charge change is told `Charge not found` — a statement about
  the DATA, when the truth is he has no permission. It misleads in the direction that
  matters: it suggests a different charge id might work.
- The gate not being the first statement is exactly why the migration read as ungated.
  When authorisation is the first line, its absence is obvious on sight.

New order in both functions:

```text
1. resolve the charge's load_id           (id only, no row exposure)
2. assert_charge_entry_allowed(load_id)   <- authorisation
3. 'Charge not found' if no such charge
4. the existing validation and the write, unchanged
```

Because the gate needs a load, step 1 stays a lookup — but it selects `load_id` alone,
and when the charge does not exist the gate is called with a load that also does not
exist, so `assert_charge_entry_allowed` refuses a driver on the role test before any
"not found" wording is reached. A management/owner/dispatcher caller with a bad id
still gets `Charge not found` at step 3.

Everything else in both bodies is untouched: same roles admitted, same money-fixed
statuses refused, same reason requirement, same change-history rows, same
`recompute_load_total_value` call, same `SECURITY DEFINER`, same
`SET search_path TO 'public','extensions'`, same grants (`authenticated`,
`service_role`; PUBLIC and anon revoked).

## Verification

- Report both reordered bodies read back from `pg_get_functiondef`, not from the file.
- Real signed-in driver session (the operator used in the investigation):
  `update_load_charge` and `delete_load_charge` against a REAL existing charge id must
  now return the permission refusal instead of `Charge not found`, and must write
  nothing — confirmed by comparing that charge's row before and after.
- `add_load_charge` refusal unchanged, verbatim.
- A management/owner path still adds, edits and removes a charge on a non-money-fixed
  load, exercised in a transaction that rolls back.
- `load_charges` row count and the affected load's `total_load_value` unchanged after
  all probes.
- Named suites: `policy-grant-parity`, `grant-parity-live`, `definer-search-path`,
  `definer-live-catalog`, `definer-fail-open`, `caller-evaluated-functions`,
  `tenancy-resolver`, plus `npx tsgo --noEmit`.

## Technical notes

- One migration containing both `CREATE OR REPLACE FUNCTION` statements in full; no
  ALTER-in-place, no source transformation, so the newest file is also the newest
  definition.
- Grants restated in the same migration after each replace, since `CREATE OR REPLACE`
  preserves the ACL but restating keeps the file self-describing.
- No frontend change: `src/lib/loadCharges.ts` already surfaces `error.message` from
  these RPCs, so the truthful refusal reaches the screen unmodified.
