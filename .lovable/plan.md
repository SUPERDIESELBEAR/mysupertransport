

## Why Salman Mohamed Still Shows on Dispatch Board

### Root Cause
The Dispatch Board query in `src/pages/dispatch/DispatchPortal.tsx` (line 490–505) fetches **all operators** and only filters by `onboarding_status.fully_onboarded = true`. It **never checks `operators.is_active`**.

Confirmed in DB:
| Field | Value |
|---|---|
| Name | Salman Mohamed |
| `is_active` | **false** (deactivated) |
| `fully_onboarded` | true |

Because he was fully onboarded before deactivation, he passes the only filter the Dispatch Board uses. Same bug likely affects anyone deactivated post-onboarding.

### The Fix
One-line change in `fetchDispatch()` — exclude inactive operators from the result set:

```ts
const onboarded = (data as any[]).filter(op =>
  getOne(op.onboarding_status)?.fully_onboarded && op.is_active !== false
);
```

And add `is_active` to the SELECT:
```ts
.select(`id, user_id, unit_number, is_active, onboarding_status (...), active_dispatch (...)`)
```

### Audit for Same Bug Elsewhere
While I'm in there, I'll also check these dispatch-adjacent surfaces and apply the same `is_active` guard if missing:
- `src/components/dispatch/MiniDispatchCalendar.tsx`
- Any "Truck Down" banner / global alerts that read from `active_dispatch`
- Driver Roster / Fleet Roster (likely already correct — verify only)

### Cleanup Question
Salman currently has an `active_dispatch` row. After the filter fix he won't appear, but the row remains in the DB. Two options:

1. **Leave it** — historical record preserved; if reactivated, his last status returns.
2. **Auto-reset on deactivation** — extend the existing `on_operator_deactivated` trigger to also set `dispatch_status = 'not_dispatched'` and clear `assigned_dispatcher` / `current_load_lane` / `eta_redispatch`. Cleaner, matches how deactivation already clears other operational state.

My recommendation: **option 2** — consistent with the existing deactivation trigger pattern.

### Files Changed
| File | Change |
|---|---|
| `src/pages/dispatch/DispatchPortal.tsx` | Add `is_active` to SELECT + filter inactive operators out |
| `src/components/dispatch/MiniDispatchCalendar.tsx` | Same filter if applicable |
| Migration *(only if option 2)* | Extend `on_operator_deactivated` trigger to reset dispatch state |

No UI redesign, no schema changes (unless you pick option 2).

