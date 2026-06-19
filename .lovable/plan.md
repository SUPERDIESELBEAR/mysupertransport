## Item: Driver app shows white screen after Sign Out

### Root cause
`signOut()` in `src/hooks/useAuth.tsx` only calls `supabase.auth.signOut()` and returns. The route guard in `src/App.tsx` is supposed to push `!user` back to `/login`, but in the installed iOS PWA the OperatorPortal page can re-render once with stale state before the guard kicks in, leaving a blank screen. Closing the app from the iPhone app switcher is the only way out because nothing forces a navigation.

### Fix (single, minimal change)
In `src/hooks/useAuth.tsx`, update `signOut`:

1. Call `await supabase.auth.signOut()`.
2. Locally reset `user`, `session`, `roles`, `activeRole`, `profile` (defensive — covers the brief gap before the `onAuthStateChange` event fires).
3. Hard-navigate to `/login` with `window.location.replace('/login')`. A full reload (vs. `navigate()`) is intentional — it guarantees every cached page-level state in the PWA is dropped and matches how iOS standalone PWAs behave most reliably.

No changes to the route guards, no UI changes, no changes to the operator portal buttons (they already call `signOut`).

### Scope
- File touched: `src/hooks/useAuth.tsx` (signOut function only).
- Affects every Sign Out button (operator portal, owner portal, staff layout, application status, idle-timeout modal) — all of them get the same correct behavior.

### Verification
- Sign in as an operator on the published PWA → tap Sign Out → should land on `/login` immediately, no white screen.
- Repeat on desktop browser.
- Confirm idle-timeout auto-signout also lands on `/login`.
