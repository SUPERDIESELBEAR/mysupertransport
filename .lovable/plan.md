## Problem

Operators (Robert Sargent, Trovino Huddleston, and anyone else) cannot complete their ICA. Tapping **Execute Agreement** uploads a PNG to the `ica-signatures` bucket at path `contractor/{operator_id}-{timestamp}.png`. The storage RLS policy gating that upload is:

```sql
split_part(
  regexp_replace(objects.name, '^contractor/', ''),
  '-', 1
) = o.id::text
```

Operator IDs are UUIDs like `28a00800-7b6f-…`. `split_part('28a00800-7b6f-…-1776711439329.png', '-', 1)` returns `'28a00800'`, which never equals the full UUID. So every operator upload fails with **"new row violates row-level security policy"**, the client throws, and the toast appears. The matching SELECT policy on the same bucket has the same bug.

## Fix

Rewrite both storage policies to match the operator ID by **prefix** instead of `split_part`. New predicate:

```sql
name LIKE ('contractor/' || o.id::text || '-%')
```

Migration drops and recreates these two policies on `storage.objects`:

- `Operators can upload their own contractor signature` (INSERT)
- `Operators can view their own ICA signatures` (SELECT) — keep the existing `carrier-default/` clause so operators can still load the carrier signature

Staff policies and the carrier-default read path are untouched.

## Verification

After approval:

1. Run a quick SQL check confirming the new `qual`/`with_check` definitions.
2. Ask one of the two affected operators (or use a test operator) to try **Execute Agreement** again; the upload should succeed and the contract should flip to `fully_executed`.

No frontend code changes required — `OperatorICASign.tsx` already builds the correct path.
