## Fix: Logout white-screen flash on web

### Root cause

`signOut()` in `src/hooks/useAuth.tsx` ends with `window.location.replace('/login')`. That triggers a full page reload — the browser tears down the React tree (white screen), then re-downloads `index.html`, re-bootstraps React, re-runs `getSession()` (loading spinner), and finally renders `/login`. On the web this reads as a blank/white flash before the sign-in page appears.

The hard reload was added intentionally for installed iOS PWAs so the standalone shell fully resets. We need to keep that behavior for PWA but use a soft, in-app navigation for normal browser sessions.

### Fix

In `signOut()`:

1. Call `supabase.auth.signOut()` and clear local auth state (`user`, `session`, `roles`, `activeRole`, `profile`) — unchanged.
2. Detect PWA standalone mode:
   ```ts
   const isStandalone =
     window.matchMedia('(display-mode: standalone)').matches ||
     (window.navigator as any).standalone === true;
   ```
3. If `isStandalone` → keep `window.location.replace('/login')` (preserves the iOS PWA reset behavior).
4. Otherwise → do **not** hard-navigate. The route guards already render `<Navigate to="/login" replace />` for `/dashboard`, `/staff/*`, `/dispatch/*`, `/management/*`, `/operator/*`, `/owner/*`, `/status` as soon as `user` becomes `null`, so the user lands on `/login` instantly with no reload and no white flash.

That's a ~6-line change confined to `signOut()`. No router, route guard, or component changes needed.

### Why this is safe

- Every protected route in `src/App.tsx` already has `!user ? <Navigate to="/login" replace /> : …`, so clearing `user` is sufficient to redirect.
- `/login` itself renders `LoginPage` when `!user`, so the redirect target is correct.
- iOS PWA behavior is preserved because standalone mode still gets the hard reload.

### File

- `src/hooks/useAuth.tsx` — modify `signOut()` only.

### Out of scope

- No changes to `IdleWarningModal` or `StaffDirectory` direct `supabase.auth.signOut()` calls (those don't navigate and aren't part of the reported flow).
- No router restructuring.
