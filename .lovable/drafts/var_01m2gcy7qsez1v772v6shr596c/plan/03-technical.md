## Technical notes

Live catalog confirms `public.unit_number_pool()` is `plpgsql`, `STABLE`,
`SECURITY DEFINER`, `search_path = public, extensions`, and its body executes
`CREATE TEMP TABLE IF NOT EXISTS _unit_scratch ... ON COMMIT DROP` plus a
`DELETE`/`INSERT` into it. Postgres rejects DDL in a non-volatile function, so
every call raises `CREATE TABLE is not allowed in a non-volatile function`
before returning a row. `public.unit_number_holders(text)` contains no DDL and
works.

### Change

Stage an additive migration in this draft that does a `CREATE OR REPLACE
FUNCTION public.unit_number_pool()` with the same signature, volatility
(`STABLE`), `SECURITY DEFINER`, pinned `search_path`, and the same role gate and
`unit_number_config` lookup. Only the middle changes: the `_unit_scratch`
lifecycle is replaced by CTEs in one `RETURN QUERY`:

```text
holders  -> operator_unit_number(s.unit_number, o.unit_number), is_active,
            deactivated_at, go_live_date  (company-scoped, is_demo excluded)
numbered -> numeric-only, excluded_units removed, cast to integer
grouped  -> n, bool_or(go_live_date IS NOT NULL OR is_active) AS taken,
            min(deactivated_at) FILTER (pre-Go-Live wash-outs) AS freed_at
ceiling  -> GREATEST(COALESCE(max(n), min-1), min-1)
result   -> recycled (NOT taken) UNION ALL gaps (generate_series, not in grouped,
            not excluded) UNION ALL next (ceiling+1 <= sequence_max_offered)
order    -> kind rank recycled/gap/next, freed_at ASC NULLS LAST, unit ASC
```

Grants are unchanged and re-stated for safety: `REVOKE ALL ... FROM PUBLIC,
anon`, `GRANT EXECUTE ... TO authenticated, service_role`. No table, column,
policy or index changes. Client code in `src/lib/unitNumberPool.ts` and both
call sites need no edit — the shape of the returned rows is identical.

Because a draft cannot run schema changes, this applies when the draft is
accepted; the list stays red in the draft preview until then.

### Also present, not part of this fix

The console shows a React `forwardRef` warning pointing at `DialogHeader` inside
`UnitNumberPoolPanel`. Cosmetic, unrelated to the error, and left alone unless
you want it swept up.
