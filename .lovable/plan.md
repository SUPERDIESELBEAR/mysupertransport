

## Fix "In Onboarding" Count — Exclude Fully Onboarded Operators

### Problem
The "In Onboarding" metric on the Overview card counts **all** operators (`SELECT count(*) FROM operators`), including those already fully onboarded. It should only count operators still going through onboarding.

### Fix
**File:** `src/pages/management/ManagementPortal.tsx` (line 495)

Change the query from:
```typescript
supabase.from('operators').select('id', { count: 'exact' })
```
to:
```typescript
supabase.from('operators').select('id, onboarding_status!inner(fully_onboarded)', { count: 'exact', head: true })
  .or('fully_onboarded.is.null,fully_onboarded.eq.false', { referencedTable: 'onboarding_status' })
```

This joins `onboarding_status` and excludes operators where `fully_onboarded = true`, matching the same logic the Pipeline Dashboard uses.

### Files changed

| File | Change |
|------|--------|
| `src/pages/management/ManagementPortal.tsx` | Filter `onboarding` metric to exclude fully onboarded operators |

