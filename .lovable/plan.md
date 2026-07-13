## What the video shows

Emma is on **Status**. She taps **Doc Hub**, then **FAQ**, then Doc Hub again in the bottom nav. Each tap:

1. Page scrolls a little
2. Gold **ONBOARDING PROGRESS** bar re-animates from 0 → 67% (the `SmartProgressWidget` ring/bar is remounting)
3. She lands back on Status

The URL and view state briefly change to the tapped tab, then get rewritten back to Status before the destination view can render. This is the reported "stuck on one page" bug.

## Root cause

`src/pages/operator/OperatorPortal.tsx` keeps the active view in **two sources of truth** that fight each other:

1. React `useState<OperatorView>` initialized from the URL (line 133)
2. The URL itself (`?tab=...`)

Reconciled by three overlapping mechanisms:

- **`syncViewUrl`** (line 164) writes the URL twice — once with `window.history.pushState` and again with `navigate({...}, { replace: true })` — and tracks the write with an `appWrittenSearchRef` marker.
- A **`useEffect` on `location.search`** (line 148) re-reads `getViewStateFromSearch` and calls `setView(next.view)`.
- The **auto-redirect** at lines 923-933 (`if (view === 'progress') navigateToView('home', { replace: true })`) fires whenever `isFullyOnboarded`, `onboardingStatus`, or `location.search` changes.

Emma's account is 67% onboarded → `isFullyOnboarded === false` because `onboardingStatus.insurance_added_date == null`. But `onboardingStatus` is refetched by real-time subscriptions and by `fetchData()` calls that fire on every view change. When the object reference changes, the redirect effect re-evaluates, and because `buildOperatorViewUrl(..., 'progress')` **deletes** the `tab` param (line 54), any later re-read of the URL that lands on an empty search collapses back to `'progress'`. The `useEffect` at line 148 then calls `setView('progress')`, cancelling the tap.

The double history write (`pushState` + `navigate replace`) also means React Router's internal location cache can echo a stale `location.search` back into the effect, which is what causes the "screen goes white for a split second" — the destination view mounts, then unmounts as `view` is force-reset.

Because `SmartProgressWidget` lives inside the Status/Progress branch, resetting `view` back to `progress` remounts the widget → the gold ring replays from 0. This matches the video frame-for-frame.

## Fix

Make the URL the single source of truth. Delete the mirrored `useState`, delete the manual `pushState`, always write an explicit `?tab=` for every view.

### 1. `src/pages/operator/OperatorPortal.tsx` — navigation rewrite

- **Delete** `useState<OperatorView>` for `view` and `binderView` (lines 133-139) and the `useEffect` at line 148 that mirrors `location.search` into state. Replace with:
  ```ts
  const { view, binderView } = useMemo(
    () => getViewStateFromSearch(location.search),
    [location.search],
  );
  ```
- **Rewrite** `buildOperatorViewUrl` (line 52) so **every** view — including `progress` — writes an explicit `?tab=` param. Remove the "no tab means progress" branch that lets stripped URLs collapse back to Status.
- **Rewrite** `navigateToView` (line 192):
  ```ts
  const navigateToView = useCallback((target, options = {}) => {
    const next = buildOperatorViewUrl(location.pathname, location.search, target, options);
    if (options.closeMobileMenu !== false) setMobileMenuOpen(false);
    navigate(`${next.pathname}${next.search}`, { replace: !!options.replace });
  }, [location.pathname, location.search, navigate]);
  ```
  No `window.history.pushState`, no `appWrittenSearchRef`, no double write.
- **Delete** `appWrittenSearchRef`, `viewRef`, `prevViewRef`, and the reconciliation `useEffect` at lines 258-266 — these only existed to paper over the dual-state model. Derive `viewHistory` from `location.key` transitions instead.
- **Guard** the onboarded auto-redirect (lines 923-933) with `homeAutoRedirected.current` so it fires **once per session** and only when `params.get('tab') === null`, never based on the derived `view` value. This stops it from fighting a deliberate tap.

### 2. `src/App.tsx` — remove the debug pushState wrapper

Delete the `__navDebugPatched` block (lines 40-63). Wrapping `window.history.pushState`/`replaceState` interferes with React Router's own history bookkeeping. Keep the `console.log` calls inside `OperatorPortal` for one release so we can confirm the fix in the field.

### 3. Persistent nav tracer (temporary, one week)

Inside the new `navigateToView`, append `{ ts, from, to, href }` to `localStorage['sd-nav-trace']` (cap 50 entries). If any driver still reports the issue after deploy, staff can pull it from a hidden Debug row in the operator profile drawer. Remove after one week along with the leftover `[NAV-DEBUG]` logs.

### 4. Regression test

Add `src/pages/operator/__tests__/OperatorPortal.nav.test.tsx` (Vitest + RTL inside `MemoryRouter`) covering:

- Tapping each bottom-nav item (Status, Binder, Messages, Doc Hub, FAQ) updates `location.search` to the expected `?tab=` and renders the destination.
- Tapping Progress writes `?tab=progress` — no empty-search collapse.
- Deep link `/operator?tab=documents` mounts on Doc Hub and **stays** there when `onboardingStatus` refetches mid-render.
- Onboarded driver landing on `/operator` with no query auto-redirects to `?tab=home` exactly once, and a subsequent tap on `?tab=progress` is not fought back.

## Files touched

- `src/pages/operator/OperatorPortal.tsx` — navigation rewrite (primary)
- `src/App.tsx` — remove `__navDebugPatched` wrapper
- `src/pages/operator/__tests__/OperatorPortal.nav.test.tsx` — new test

No DB, edge function, or auth changes. Staff/management/dispatch portals unchanged.

## Rollout

1. Ship as a straight bug fix — no flag.
2. Ask Emma and the second reporting driver to hard-refresh once after deploy and confirm all five bottom-nav tabs open their destinations.
3. Watch `sd-nav-trace` from any repeat reports for a week, then delete the tracer.
