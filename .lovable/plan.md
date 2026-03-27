

## Fix: "Forbidden: insufficient role" when Adding a Driver

### Root cause

In `supabase/functions/invite-operator/index.ts` (line 35-41), the role check queries `user_roles` for rows matching `management` OR `onboarding_staff`, but uses `.maybeSingle()`. Your account holds **both** roles, so the query returns multiple rows. `.maybeSingle()` treats multiple results as an error and returns `null` for data, triggering the 403 response.

### Fix — one file: `supabase/functions/invite-operator/index.ts`

Change the role check from:
```ts
const { data: roleCheck } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', callerUser.id)
  .in('role', ['management', 'onboarding_staff'])
  .maybeSingle();
```

to:

```ts
const { data: roleCheck } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', callerUser.id)
  .in('role', ['management', 'onboarding_staff'])
  .limit(1);
```

And update the guard check from `if (!roleCheck)` to `if (!roleCheck || roleCheck.length === 0)`.

This returns an array and checks for at least one matching role, regardless of how many the user holds.

### No database changes. No new files.

