## Problem

On the driver's mobile PWA, tapping the bell → **View all →** is meant to open the driver's dedicated Notifications history page (it does *not* go to Messages — that's a separate inbox for driver↔staff DMs and broadcasts).

The bell in `src/pages/operator/OperatorPortal.tsx:1160` is wired as:

```tsx
<NotificationBell variant="dark" notificationsPath="/operator?tab=notifications" ... />
```

But the driver is signed in on `/dashboard` (that route renders `OperatorPortal` for `activeRole === 'operator'`). Tapping **View all →** therefore navigates from `/dashboard` → `/operator?tab=notifications`, which triggers a full remount of `OperatorPortal` on a different pathname. On mobile PWAs this cross-path remount is the likely reason the tap "goes nowhere" for the driver — the new route mounts, the URL-writer effect fires, and any transient state (splash / crossfade overlay / initial `view = 'progress'` default) can leave the driver looking at the wrong screen.

The dedicated `NotificationHistory` component (`src/components/management/NotificationHistory.tsx`) is fully built and is the correct destination — Messages is not.

## Fix

Keep **View all →** pointed at the Notifications history page, but stay on the pathname the operator is already on so we don't remount into a sibling route.

### 1. `src/pages/operator/OperatorPortal.tsx` (~line 1160)

Compute the notifications path from the current pathname so `/dashboard` stays `/dashboard` and `/operator` stays `/operator`:

```tsx
const notificationsHref = `${location.pathname}?tab=notifications`;
...
<NotificationBell
  variant="dark"
  notificationsPath={notificationsHref}
  clearBadge={view === 'notifications'}
/>
```

`location` is already in scope from `useLocation()` at the top of the component.

### 2. Sanity-check the view switcher

Confirm `view === 'notifications'` in `OperatorPortal.tsx` (~line 1739) renders `<NotificationHistory />` inside `<Suspense>` — no change expected, just re-verify after the routing fix.

## Verification

1. Sign in as a test driver (Emma Mueller) on `/dashboard`.
2. Tap the bell in the header → tap **View all →**.
   - URL becomes `/dashboard?tab=notifications` (same pathname, tab param added).
   - The full **Notification History** page loads (title "Notification History", filter chips All / Unread / Read, list of all past notifications with Mark all read and Refresh).
   - Bell badge clears (`clearBadge` flag).
3. Tap the browser / hardware back button → returns to the previous tab (Status / Progress) on `/dashboard`.
4. Repeat from a driver who happens to be on `/operator` (e.g. management previewing as operator) → URL becomes `/operator?tab=notifications` and the same page loads.
5. Confirm the bottom-nav **Messages** icon still opens the Messages inbox (`?tab=messages`) — unchanged.

## Out of scope

- No changes to `NotificationBell.tsx`, `NotificationHistory.tsx`, or the Messages hub.
- No change to the dispatcher / staff / management bells.
