# Fix: Dispatch-exclusion toggle out of sync in Driver Hub

## What's happening

Bobby Thompson is genuinely excluded from the Dispatch Hub — his `operators` row has `excluded_from_dispatch = true` (set 2026-05-18). The Dispatch Hub, the driver roster "Excluded" badge, and the daily rollover function all read this correctly.

The Driver Hub's operator detail panel (`OperatorDetailPanel.tsx`) shows the toggle as **off** because the query that loads the operator record does not select the exclusion columns:

```ts
// src/pages/staff/OperatorDetailPanel.tsx, line ~1018
supabase
  .from('operators')
  .select(`id, user_id, notes, anticipated_start_date, is_active,
           on_hold, on_hold_reason, on_hold_date,
           pwa_installed_at, last_web_seen_at, ...`)
```

`excluded_from_dispatch` and `excluded_from_dispatch_reason` are missing from the select list. A few lines down, the panel does:

```ts
setExcludedFromDispatch((op as any).excluded_from_dispatch === true); // always false
setExcludedReason((op as any).excluded_from_dispatch_reason ?? '');   // always ''
```

So the toggle always initializes to off and the reason field always initializes to blank, regardless of the real DB state. This also means: if a staff member opens Bobby's panel and toggles anything else that triggers a save of these fields, they could unintentionally clear his exclusion.

## Fix

Add `excluded_from_dispatch, excluded_from_dispatch_reason, excluded_from_dispatch_at` to the operator `select(...)` on line 1019 of `src/pages/staff/OperatorDetailPanel.tsx`. No other code changes needed — the setters and the toggle UI already handle these fields correctly.

## Verification

1. Open Bobby Thompson in the Driver Hub → "Exclude from Dispatch Hub" toggle shows **on**, with the original reason (if any) prefilled.
2. Open a non-excluded operator → toggle shows off.
3. Toggle off for Bobby → DB row updates, Dispatch Hub stops showing him as excluded.
