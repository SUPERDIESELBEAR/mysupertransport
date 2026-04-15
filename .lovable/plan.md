

## Fix: Clear "Invite Pending" When Operators Become Active

### Problem
The `profiles.account_status` field defaults to `'pending'` and is never updated to `'active'` for operators. No trigger, login hook, or edge function transitions it. Every operator permanently shows "Invite Pending" in the Pipeline Dashboard regardless of their actual activity.

### Solution
Set `account_status = 'active'` when an operator logs in for the first time (or any time they log in while still `'pending'`).

### Implementation

**1. Update `src/hooks/useAuth.tsx`**
After fetching the profile, if the user's `account_status` is `'pending'`, update it to `'active'` in the database. This is a simple one-time self-update that runs on login.

```typescript
// After fetching profile successfully:
if (data.account_status === 'pending') {
  supabase.from('profiles')
    .update({ account_status: 'active' })
    .eq('user_id', userId)
    .then(() => {});
}
```

**2. Backfill existing active operators (one-time migration)**
Run a migration to set `account_status = 'active'` for all operators who have already logged in (i.e., have a `last_sign_in_at` in auth, or have uploaded documents, or have an `onboarding_status` record with progress). The simplest approach: update all profiles that have a matching `operators` record and whose `account_status` is still `'pending'`.

```sql
UPDATE public.profiles p
SET account_status = 'active', updated_at = now()
WHERE p.account_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.operators o WHERE o.user_id = p.user_id
  );
```

This ensures Bobby Thompson and any other active operators immediately clear the badge without waiting for their next login.

### Files to change
| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Auto-upgrade `pending` → `active` on profile fetch |
| New migration | Backfill existing active operators |

### No other changes needed
- The Pipeline Dashboard's `never_logged_in` check already reads `account_status` — once it's `'active'`, the badge disappears automatically.
- RLS on `profiles` allows users to update their own row (verified via the existing `update` policy pattern used by profile editing).

