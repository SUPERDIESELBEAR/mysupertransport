
## Fix: Truck Down Banner Counts Only Fully-Onboarded Operators

### Problem
Three queries count `truck_down` operators without checking `fully_onboarded`:

1. `fetchTruckDownOperators` in `StaffPortal.tsx` (line 226) — populates the banner with operator names
2. `fetchTruckDownCount` in `ManagementPortal.tsx` (line 120) — populates the badge count on the Management overview
3. `fetchDispatchBreakdown` in `ManagementPortal.tsx` (line 128) — drives the "Truck Down" tile in the Overview fleet breakdown

The Dispatch Board already filters to `fully_onboarded = true`, so non-onboarded operators with stale dispatch statuses appear in counts/banners but not on the board.

### Fix Plan

**1. `StaffPortal.tsx` — `fetchTruckDownOperators` (lines 226–251)**

Add `fully_onboarded` to the select from `onboarding_status`, then JS-filter after fetching:

```typescript
const { data } = await supabase
  .from('active_dispatch')
  .select(`
    operator_id,
    operators!inner(
      application_id,
      unit_number,
      applications(first_name, last_name),
      onboarding_status(unit_number, fully_onboarded)
    )
  `)
  .eq('dispatch_status', 'truck_down');

// Filter to only fully onboarded
const filtered = (data ?? []).filter((row: any) => {
  const os = row.operators?.onboarding_status;
  const status = Array.isArray(os) ? os[0] : os;
  return status?.fully_onboarded === true;
});
```

**2. `ManagementPortal.tsx` — `fetchTruckDownCount` (lines 120–126)**

Join `onboarding_status` and count JS-side after filtering:

```typescript
const fetchTruckDownCount = useCallback(async () => {
  const { data } = await supabase
    .from('active_dispatch')
    .select(`operator_id, operators!inner(onboarding_status(fully_onboarded))`)
    .eq('dispatch_status', 'truck_down');
  const count = (data ?? []).filter((row: any) => {
    const os = row.operators?.onboarding_status;
    const status = Array.isArray(os) ? os[0] : os;
    return status?.fully_onboarded === true;
  }).length;
  setTruckDownCount(count);
}, []);
```

**3. `ManagementPortal.tsx` — `fetchDispatchBreakdown` (lines 128–177)**

Augment the select with `operators!inner(onboarding_status(fully_onboarded))` and skip non-fully-onboarded rows when tallying the breakdown:

```typescript
.from('active_dispatch')
.select('dispatch_status, updated_by, updated_at, operators!inner(onboarding_status(fully_onboarded))')

// In the loop:
for (const row of data) {
  const os = row.operators?.onboarding_status;
  const status = Array.isArray(os) ? os[0] : os;
  if (!status?.fully_onboarded) continue;   // <-- new guard
  // ... existing counting logic
}
```

### Files Changed
- `src/pages/staff/StaffPortal.tsx` — 1 query + filter
- `src/pages/management/ManagementPortal.tsx` — 2 queries + filters

No database migration needed — all changes are client-side query adjustments.
