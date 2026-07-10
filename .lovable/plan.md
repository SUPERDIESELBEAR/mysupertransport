
## Recommendation: Yes — add a small typed helper

The `as any` casts we just sprinkled work, but they turn off **all** type checking for that payload — a typo like `emplyer_name` or a wrong-type value would compile silently. A tiny helper keeps the escape hatch for dynamic keys while preserving column-name and value-type checking for the static parts.

## What to add

New file: `src/integrations/supabase/helpers.ts`

```ts
import type { Database } from './types';

type PublicSchema = Database['public'];
type TableName = keyof PublicSchema['Tables'];

type UpdateOf<T extends TableName> = PublicSchema['Tables'][T]['Update'];
type InsertOf<T extends TableName> = PublicSchema['Tables'][T]['Insert'];

/**
 * Typed passthrough for Supabase .update() payloads that are built with
 * dynamic keys (e.g. `{ [col]: value }`). Preserves column-name checking
 * for the known fields while allowing computed keys, without falling back
 * to `as any` which disables all type safety.
 */
export function updatePayload<T extends TableName>(
  _table: T,
  patch: Partial<UpdateOf<T>> & Record<string, unknown>,
): UpdateOf<T> {
  return patch as UpdateOf<T>;
}

export function insertPayload<T extends TableName>(
  _table: T,
  row: Partial<InsertOf<T>> & Record<string, unknown>,
): InsertOf<T> {
  return row as InsertOf<T>;
}
```

Usage replaces `as any`:

```ts
// before
.update({ [col]: newDateStr } as any)

// after
.update(updatePayload('applications', { [col]: newDateStr }))
```

The `_table` argument ties the payload to a specific table, so any statically-known field still gets checked against that table's schema. Dynamic `[col]` keys are permitted by the `Record<string, unknown>` intersection.

## Migration plan

1. Add `helpers.ts` (does not touch `client.ts` or `types.ts` — those stay auto-generated).
2. Convert the ~22 sites we just cast:
   - `.update(x as any)` → `.update(updatePayload('<table>', x))`
   - `.insert(x as any)` → `.insert(insertPayload('<table>', x))`
3. Add a short note under `mem://arch/database-patterns/managed-columns-handling` (or a new memory) telling future edits to use these helpers instead of `as any`.

## Scope note

Only touch call sites currently using `as any` for insert/update. Existing typed calls (`.update({ status: 'sent' })` with no dynamic keys) don't need changes — they already type-check today.

## Trade-offs

- **Cost**: ~30 lines of helper + one-time refactor of the ~22 sites we just patched.
- **Benefit**: dynamic-key writes stay ergonomic *and* any statically-typed field in the same payload gets column/value validation. Typos in known fields will fail the build again.
- **Risk**: none — helpers are pure identity functions at runtime.
