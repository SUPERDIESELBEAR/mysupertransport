

## Fix "Application Under Review" Flash on Login

### Root Cause

In `App.tsx` line 51-58, the `/dashboard` route uses a chain of `activeRole` checks:
```
activeRole === 'owner' ? <ManagementPortal /> :
activeRole === 'management' ? <ManagementPortal /> :
...
activeRole === 'operator' ? <OperatorPortal /> :
<ApplicationStatus />   // ← fallback when no role matches
```

When `onAuthStateChange` fires during sign-in, `user` is set immediately but `fetchRoles` runs asynchronously. For ~200ms, `activeRole` is `null`, so none of the checks match and `<ApplicationStatus />` renders briefly.

### Fix

**File: `src/App.tsx`** — In the `/dashboard` route, before falling through to `<ApplicationStatus />`, check if the user exists but roles haven't loaded yet. If so, show the loading spinner instead of the application status page.

```
!user ? <Navigate to="/login" replace /> :
(user && roles.length === 0 && !activeRole) ? <loading spinner> :
activeRole === 'owner' ? <ManagementPortal /> :
...
```

This requires destructuring `roles` from `useAuth()` on line 27 (it's already exposed by the context). The spinner is the same one already used in the `if (loading)` block.

### Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Add `roles` to destructured auth values; add roles-loading guard before `<ApplicationStatus />` fallback |

