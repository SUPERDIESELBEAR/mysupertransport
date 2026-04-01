

## Fix Stage 1 Save Error — Strip Non-Editable Fields from Update Payload

### Problem
The save handler at line 1132 spreads the entire `status` state (loaded via `SELECT *` from `onboarding_status`) into the update payload, only stripping `id` and `fully_onboarded`. This sends DB-managed fields like `operator_id`, `updated_at`, and `updated_by` in the update, which can cause constraint or trigger errors.

### Root Cause
Line 1132:
```ts
const { id: _id, fully_onboarded: _fo, ...updateData } = status as any;
```
This passes `operator_id` (which has a UNIQUE constraint and FK), `updated_at` (managed by trigger), and `updated_by` (FK to `auth.users`) in the update payload. Depending on DB state, this can cause silent failures or explicit errors.

### Fix

**`src/pages/staff/OperatorDetailPanel.tsx`** — Update the destructuring at line 1132 to also strip `operator_id`, `updated_at`, and `updated_by`:

```ts
const { id: _id, fully_onboarded: _fo, operator_id: _oid, updated_at: _ua, updated_by: _ub, ...updateData } = status as any;
```

This ensures only user-editable fields are sent in the update, preventing constraint violations from DB-managed columns.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Strip `operator_id`, `updated_at`, `updated_by` from the update payload alongside `id` and `fully_onboarded` |

