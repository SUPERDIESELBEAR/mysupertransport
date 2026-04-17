

## Fix: Truck Unit number missing on Flipbook cover (staff drill-down)

### Root cause
`src/components/inspection/OperatorBinderPanel.tsx` line 114 queries `unit_number` from the `operators` table — but that column does **not exist** on `operators`. It lives on `onboarding_status.unit_number` (one row per operator). The query silently returns no `unit_number`, so the Flipbook cover renders `—` for every driver.

The other two surfaces are already correct:
- `OperatorInspectionBinder.tsx` (operator portal) → reads `onboarding_status` ✅
- `InspectionBinderAdmin.tsx` (admin) → reads `onboarding_status` ✅

Only the **staff drill-down panel** (Operator Detail → Inspection Binder tab) is broken — which matches the symptom of "each driver" missing the unit number when staff open the flipbook.

### Fix
In `OperatorBinderPanel.tsx`, change the operators query to also fetch the related `onboarding_status.unit_number`, then read it from there.

Replace the 4th promise in the `Promise.all` (line 114) and the assignment on line 119:

```ts
// before
supabase.from('operators').select('id, unit_number').eq('user_id', driverUserId).maybeSingle(),
...
setUnitNumber((opRes.data as any)?.unit_number ?? null);

// after
supabase
  .from('operators')
  .select('id, onboarding_status(unit_number)')
  .eq('user_id', driverUserId)
  .maybeSingle(),
...
setUnitNumber((opRes.data as any)?.onboarding_status?.unit_number ?? null);
```

Per project memory (one-to-one relations), `onboarding_status` returns as a single object on `operators`, not an array — so the access pattern above is correct.

### File changed
| File | Change |
|---|---|
| `src/components/inspection/OperatorBinderPanel.tsx` | Fetch `unit_number` via the embedded `onboarding_status` relation instead of the non-existent `operators.unit_number` column |

### Why this is safe
- Single-file, single-query change
- Matches the pattern already used in the other two binder surfaces
- No schema changes, no RLS changes, no UI changes
- Verified against DB: `unit_number` exists only on `onboarding_status` (e.g., operator `817c1084…` → unit `221`)

