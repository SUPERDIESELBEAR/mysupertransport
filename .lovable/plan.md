

## Fix: Owner Role Not Routed to Management Portal

### Problem
When you log in, your `activeRole` is `owner` (the highest-priority role). But the `/dashboard` route in `App.tsx` only checks for `management`, `onboarding_staff`, `dispatcher`, and `operator` — it doesn't handle `owner`. So it falls through to `<ApplicationStatus />`, showing the "Application Approved" screen.

### Fix
**File:** `src/App.tsx` (line 53)

Add `owner` to the dashboard routing logic so it routes to `ManagementPortal`:

```
activeRole === 'owner' ? <ManagementPortal /> :
activeRole === 'management' ? <ManagementPortal /> :
```

This single change ensures that when you log in as owner, you land on the Management Portal as expected.

### Files changed

| File | Change |
|------|--------|
| `src/App.tsx` | Add `activeRole === 'owner'` case to dashboard route |

