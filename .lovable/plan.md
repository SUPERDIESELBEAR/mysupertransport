## Goal

Give drivers (and staff) a one-tap way to pull the latest data without signing out and back in. Today the only way a driver can force the app to re-read from the backend is sign out / sign in — too heavy for a routine "I uploaded something, where is it?" moment.

## What "refresh" should do (UX)

A full browser reload (`window.location.reload()`) works but is the worst option on mobile/PWA: it flashes a white screen, drops scroll position, closes any open modal/drawer, and on iOS standalone can briefly look like the app crashed.

The best UX is a **soft refresh** that re-pulls data in place:

1. Call `refreshProfile()` from `useAuth` (re-reads profile, roles, onboarding flags).
2. Call `queryClient.invalidateQueries()` so every React Query–backed list (documents, dispatch status, messages, notifications, compliance, etc.) refetches.
3. Re-run the portal-local fetchers (operator record, onboarding status, assigned dispatcher/coordinator, truck info) — these don't all go through React Query in `OperatorPortal`, so the simplest move is to expose a `refreshAll()` callback that re-invokes the existing effect loaders.
4. Spin the icon while in-flight, toast "Up to date" on success, "Couldn't refresh — check your connection" on failure.
5. **Escape hatch:** long-press (or a small "Hard reload" item in the user menu) does an actual `location.reload()` for the rare case where a soft refresh isn't enough (e.g. after a deploy with new JS).

## Where it goes

### Driver-facing app — `src/pages/operator/OperatorPortal.tsx`
- Add a `RefreshCw` icon button in the top header, immediately to the left of the existing **Sign Out** button (line ~1038). Same icon-button styling as Sign Out, with `aria-label="Refresh"`.
- Also add it inside the mobile menu drawer above the existing "Sign Out" row (line ~1112) labeled "Refresh data" so it's reachable on small screens with the menu open.
- Wire it to a new `handleRefresh()` that runs the soft-refresh sequence above and toggles a local `refreshing` state for the spin animation.

### Management / Staff DB — `src/components/layouts/StaffLayout.tsx`
Yes, add it here too. Staff have the same problem on the management dashboard (a driver uploads a doc, the staff member's open drawer doesn't reflect it until reload). Add the same `RefreshCw` button in the top `<header>` (line ~349), to the left of the existing sign-out / user-menu cluster, with the same `handleRefresh()` semantics (refreshProfile + invalidateQueries + toast). No long-press needed on desktop; a separate "Hard reload" menu item under the user dropdown is enough.

### Not changing
- Sign-out flow, auth, routing.
- Service worker / PWA update logic (separate concern — already handled by the existing PWA update prompt).
- Any data-fetching internals; we're just triggering existing refetch paths.

## Technical notes

- `useQueryClient()` from `@tanstack/react-query` is already available app-wide via `QueryClientProvider` in `src/App.tsx`.
- `useAuth()` already exposes `refreshProfile`.
- Icon: `RefreshCw` from `lucide-react`. Spin via `className={cn('h-5 w-5', refreshing && 'animate-spin')}`.
- Debounce: ignore clicks while `refreshing === true` to avoid stacking calls.
