## What's happening

You confirmed:
- You're on the **Progress** (Status) screen as a driver account (not fully onboarded).
- Tapping a nav item briefly changes the URL then **bounces back to `/dashboard` with the `?tab=` stripped**.

Because the URL is losing its `?tab=` parameter, the URL-sync effect in `OperatorPortal.tsx` reads the search string, sees no tab, defaults `view` back to `'progress'`, and the screen never changes. Every navigation surface (bottom bar, top bar, drop-down menu) goes through the same `navigateToView` helper, which is why *all* of them fail identically.

The question is **who is stripping `?tab=`**. Three plausible culprits, in order:

1. **A role-guarded route re-render.** If `location.pathname` isn't `/dashboard` (e.g. `/owner` or `/operator`), the route falls into `<Navigate to="/dashboard" replace />` in `App.tsx`, which drops the search string. Matches your symptom exactly.
2. **A stale-URL race in `syncViewUrl`.** The helper calls `window.history.pushState` and then `navigate({...}, {replace:true})`. On some renders `location.pathname` from `useLocation()` is stale and the replace overwrites the good URL with a bad one.
3. **Auth `loading` flipping mid-click.** `AppRoutes` returns a spinner while `loading` is true. If auth re-hydrates during a tap, `<Routes>` unmounts and the reset path drops the search.

## Fix approach

**Step 1 — Instrument, reproduce once, remove instrumentation.**

Add temporary `console.log` calls in code (they run for everyone, no account targeting needed):
- Every `navigateToView` invocation: log target, `location.pathname`, `window.location.search`.
- The URL-sync `useEffect`: log `location.search`, `appWrittenSearchRef.current`, computed `next.view`.
- A one-shot dev-only `history.pushState/replaceState` monkey-patch that logs the caller/stack for any `/dashboard` nav without `?tab=`.

**How I get the logs:** you reload the driver portal in your current preview, tap a broken nav item once, then send your next message. Your browser console is automatically snapshotted and delivered to me — no account setup required.

**Step 2 — Apply the targeted fix.**

Based on the logs, one of:
- **Pathname wrong:** hard-anchor `buildOperatorViewUrl` to always emit `/dashboard` for driver accounts so a stale pathname can't route into `<Navigate to="/dashboard" replace/>` and drop the query. Or change the role-guarded `Navigate` to preserve `location.search`.
- **Race in `syncViewUrl`:** drop the redundant `navigate({...})` after `pushState` (the `useEffect` on `location.search` already reconciles React Router), or switch to `navigate(nextHref, {replace:true})` as the single source of URL truth and remove the manual `pushState`.
- **Auth remount:** add a guard so a mid-click `loading` flip doesn't clear params.

Then remove the temporary logs.

## Technical section

Files touched in step 1 (~10 added lines, all `console.log` / `console.trace`):
- `src/pages/operator/OperatorPortal.tsx` — `navigateToView`, `syncViewUrl`, URL-sync `useEffect`.
- `src/App.tsx` — dev-only mount-time history monkey-patch.

Files touched in step 2 depend on log outcome; expected to be one of:
- `src/pages/operator/OperatorPortal.tsx` — tighten `buildOperatorViewUrl` and/or `syncViewUrl`.
- `src/App.tsx` — adjust the `/dashboard` element or role-guarded routes to preserve search on redirect.

## What you'll do

1. I ship the instrumentation.
2. You reload the driver app in your current preview, tap a broken nav item once, then send the next message.
3. I read your session's console logs, identify the culprit, apply the real fix, and remove the logs.
