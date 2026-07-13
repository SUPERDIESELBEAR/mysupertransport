## What Emma's diagnostics actually tell us

The trace is a smoking gun, but not the smoking gun we expected.

```
T+0ms    tap  "review-acknowledge-documents"  →  navigate("/operator/doc-hub")
T+23ms   rendered-route  view=docs-hub  path=/operator/doc-hub   ← the tap worked
T+23ms   location-change              path=/operator/doc-hub
T+38ms   rendered-route  view=progress path=/operator/status     ← BOUNCE
T+38ms   location-change              path=/operator/status
```

So the tap **did** register, `navigateToView('docs-hub')` **did** fire, the URL **did** flip to `/operator/doc-hub`, and `OperatorPortal` **did** render the Doc Hub view. Then, 38ms later, the URL was rewritten to `/operator/status` — and crucially, **none of our existing "redirect-*" trace events fired**. That means the second navigation did *not* come from `navigateToView` or from the "known operator route" redirect effect inside `OperatorPortal`. It came from somewhere else — most likely one of:

1. A brief auth-state change (visibility/token refresh) that made `App.tsx`'s `/operator/*` guard render `<Navigate to="/dashboard" replace />`, which then flowed into the dashboard→operator redirect and landed on `/operator/status`.
2. A history push from a component that isn't currently instrumented (Suspense boundary, error boundary, or a hook we haven't audited).
3. The browser back/forward cache on iOS 18.7 Safari standalone replaying a prior history entry.

The next step is to make it impossible for the next recording to be ambiguous.

## Plan

### 1. App-level history tracing (catches every navigation, no matter the source)

Add a tiny `NavTraceRouterListener` component mounted inside `<BrowserRouter>` in `src/App.tsx`. It subscribes to `useLocation()` and, on every change, records:

- new pathname + search
- `history.state` (so we can see React Router's key/idx and detect popstate/back-forward)
- `performance.navigation`-style hint (`navigation.type` from the Performance API when available)
- current `document.visibilityState`
- previous pathname (from a ref)

This runs above `OperatorPortal`, so it captures URL changes that happen *between* portal renders (i.e. during unmount/remount), which the current in-portal trace misses.

### 2. Auth-event tracing

In `src/hooks/useAuth.tsx`, log every `onAuthStateChange` event (`event` string only — never the token) plus `fetchRoles` start/end and the resulting role array length. This will confirm or rule out the "token refresh briefly drops role flags" hypothesis.

### 3. Route-guard render tracing in `App.tsx`

Wrap the `/operator/*` route element in a small logger that records which branch it renders on each pass: `LoginRedirect`, `OperatorPortal`, or `<Navigate to="/dashboard" replace />`. Same for `/dashboard`. This directly answers "did we bounce out of /operator/* because the guard briefly said no?".

### 4. Harden the `/operator/*` guard against transient auth flicker (the likely fix)

Today:
```tsx
<Route path="/operator/*" element={
  !user ? <LoginRedirect /> :
  (isOperator || isTruckOwner || isManagement) ? <OperatorPortal /> :
  <Navigate to="/dashboard" replace />
} />
```

The `<Navigate>` fallback fires the instant `roles` is briefly empty (e.g. right after a `TOKEN_REFRESHED` event, before `fetchRoles` resolves). Change to:

- If `user` exists but `roles.length === 0` and we've previously seen this user with roles, keep rendering `<OperatorPortal />` (or a neutral loading state) instead of redirecting away. Track "roles have loaded at least once for this user" via a ref/state in `useAuth`.
- Only fall through to `<Navigate to="/dashboard" />` when roles have loaded and genuinely lack operator/truck_owner/management — never during a refetch.

Apply the same guard to `/owner/*`, `/staff/*`, `/dispatch/*`, `/management/*` and the `/dashboard` role-switch to prevent the same class of flicker elsewhere.

### 5. Kill the `OperatorPortal` "redirect empty/invalid route" as a *second* safety net

The redirect effect at `OperatorPortal.tsx:895` is defensive — it normalizes `/operator` or `/dashboard` into `/operator/status`. Once the guard in (4) is in place, this effect should never see a `/dashboard` URL. To be safe, tighten it so it only fires when `segments.length === 0` **and** the base path is `/operator` or `/owner` (not `/dashboard`). This closes the loop even if the guard hypothesis is wrong.

### 6. Prominent in-app "Support Diagnostics" button (already partially done last turn)

Keep the visible "Support" link next to the version footer so Emma can copy the new, richer trace in one tap. No behavior change beyond what shipped previously.

## Files to change

- `src/App.tsx` — add `NavTraceRouterListener`; wrap route guards with tracing; harden `/operator/*` and sibling guards to tolerate transient empty `roles`.
- `src/hooks/useAuth.tsx` — trace auth events + role fetch lifecycle; expose "rolesEverLoaded" flag for the guards.
- `src/pages/operator/OperatorPortal.tsx` — narrow the redirect effect so it only normalizes when actually on `/operator`/`/owner` base with empty segments.
- `src/lib/navTrace.ts` — small helpers for `appendAuthTrace` and `appendRouteTrace` (thin wrappers around `appendNavTrace` so they share the same ring buffer).

## What Emma will see

No visual change. Next time she taps a broken button and copies diagnostics, the trace will include:

- exactly which router listener rewrote the URL back to `/operator/status`
- whether an auth event fired in the same window
- which guard branch `App.tsx` rendered before and after the bounce

That will either confirm the auth-flicker theory (in which case the guard change in step 4 is the fix) or point us at the real culprit within one more round-trip.

## Out of scope

- Rewriting the driver portal's routing model further.
- Changing PWA / service worker behavior (her diagnostics confirm no SW registered).
- Any UI polish or non-diagnostic behavior changes.
