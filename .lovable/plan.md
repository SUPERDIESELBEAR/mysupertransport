# Fix: OSAS "Send to Operator" returns non-2xx error

## Root cause (verified)

The `send-osas-to-operator` edge function authorizes staff in two steps:
1. Check `app_metadata.user_roles` / `roles` on the JWT.
2. If that misses, fall back to the DB via `supabase.rpc('get_user_roles', { user_id: userData.user.id })`.

Verified against the live DB: the function signature is `public.get_user_roles(_user_id uuid)` — the parameter is `_user_id`, not `user_id`. Passing `{ user_id: ... }` fails to bind, so the fallback returns no roles and the function responds `403 Forbidden`. That's what surfaces in the UI as "Edge Function returned a non-2xx status code".

Owner/staff JWTs on this project don't carry `user_roles` in `app_metadata` (roles live in the `user_roles` table), so every staff user hits the broken fallback.

## Fix

In `supabase/functions/send-osas-to-operator/index.ts`, change the RPC call to use the correct argument name:

```ts
const { data: roles } = await supabase.rpc('get_user_roles', { _user_id: userData.user.id })
```

No other changes needed. The rest of the authorization logic (`.some(r => ['management','onboarding_staff','owner'].includes(r))`) works correctly once `roles` is populated.

## Verification

After the fix, clicking "Send to Operator" as Marcus (owner) should:
- Return 200 with `{ success: true, sheetId }`.
- Create the sheet row and mark equipment as `assigned`.
- Trigger the `osas-sign-request` email to the operator.
