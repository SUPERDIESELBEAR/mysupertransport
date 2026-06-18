Universal "Sign In" label simplification

## Summary
Remove all role-specific sign-in labels. Every login screen will read "Sign In" and the "Operator Portal" / "Driver Portal" subtitle under the logo will be removed.

## Files to change

### 1. `src/pages/LoginPage.tsx`
- Change heading from conditional `Driver Sign In` / `Staff Sign In` to plain `Sign In`.
- Remove the `<p>` tag that renders `portalLabel` (`Driver Portal` / `Operator Portal`) under the logo.
- The `?type=driver` URL parameter can remain in place for now (it will simply have no visible effect).

### 2. `src/pages/ResetPassword.tsx`
- Remove the "Operator Portal" `<p>` tag under the SUPERTRANSPORT logo.

### 3. `src/pages/SplashPage.tsx`
- No text change required; the nav link already reads "Sign In". The `?type=driver` query parameter on the link can be dropped to keep URLs clean, since it no longer affects the UI.

## What will NOT change
- Internal route names, component names, or page titles (e.g. `OperatorPortal` component, `/dashboard` route).
- The `?type=driver` parameter logic in `LoginPage` will be simplified (remove the conditional heading/label variables) but the parameter itself can be left as a harmless no-op to avoid breaking external bookmarks or email links until a later cleanup.