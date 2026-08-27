# Pin `stamp_load_stop_time_source()` to `public, extensions`

## What we will change

In the staged draft migration `.lovable/drafts/var_01m11n41hyex08hzsaa50s59d4/migrations/20260827130500_stop_time_capture_provenance.sql`, change the trigger function header from:

```sql
SET search_path = public
```

to:

```sql
SET search_path TO 'public', 'extensions'
```

This matches `enforce_load_stops_operator_update` on the same table and the convention documented in `docs/database-security-conventions.md`. The function is new, so it will not be added to `LEGACY_PUBLIC_ONLY_PINS`.

## What we will not change

- No other lines in the staged migration.
- The four reported issues remain out of scope.
- `LEGACY_PUBLIC_ONLY_PINS` will not be modified.

## Guard visibility

`definer-search-path.test.ts` currently does **not** read staged draft migrations. It calls `resolvedDefiners()`, which only scans `supabase/migrations`. `actor-stamp-fk.test.ts` was extended to also read staged migrations via `stagedMigrationSql()`, but that extension was not applied to the search-path guard. Therefore, until this migration is accepted into `supabase/migrations`, `stamp_load_stop_time_source()` is invisible to `definer-search-path.test.ts`.
