

## Fix ICA "owner_name" Column Missing

### Problem
The ICA Builder saves `owner_name` directly to the `ica_contracts` table, but that column doesn't exist in the database schema. The table only has `owner_business_name` and `owner_ein_ssn`.

### Solution
Add an `owner_name` text column to the `ica_contracts` table via a database migration.

```sql
ALTER TABLE public.ica_contracts ADD COLUMN owner_name text;
```

No code changes needed — the front-end already handles `owner_name` correctly; it just needs the column to exist.

### Files Changed

| File | Change |
|------|--------|
| Migration | `ALTER TABLE public.ica_contracts ADD COLUMN owner_name text;` |

