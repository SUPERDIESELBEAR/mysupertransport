## Goal

Make `PWAInstallBanner` disappear the moment SUPERDRIVE is installed, and verify the behavior with a smoke test.

## Why it's needed

Today `src/components/PWAInstallBanner.tsx` only checks `isStandalone()` once, in its mount effect. If a driver opens the portal in a browser tab and then installs SUPERDRIVE (or the OS install completes after the banner is already on screen), the "Install SUPERDRIVE" popup keeps showing until the next full page load. It can also reappear briefly on tabs that were open at install time.

## Change

`src/components/PWAInstallBanner.tsx`

1. Add a `window.addEventListener('appinstalled', …)` listener that calls the existing `dismiss()` flow — sets the dismissed flag, clears `deferredPrompt`, hides the iOS card, and persists `superdrive-pwa-dismissed` so it stays gone on subsequent navigations.
2. Add a `visibilitychange` / `focus` re-check that calls `isStandalone()`; if it now returns true (e.g. iOS A2HS completed in another tab, or the user reopened the installed app shell), hide the banner immediately.
3. Keep all existing guards (iframe, preview host, already-standalone on mount, `DISMISSED_KEY`, in-app browser copy) untouched.

No other components change. No new dependencies, no styling changes, no behavior change for users who haven't installed.

## Smoke test

Add `src/components/__tests__/PWAInstallBanner.test.tsx` using Vitest + React Testing Library (already in the project). Three cases:

1. **Already standalone on mount** — mock `matchMedia('(display-mode: standalone)')` to return `matches: true`; assert the banner renders nothing.
2. **`appinstalled` fires while banner is visible** — start in non-standalone, dispatch a synthetic `beforeinstallprompt` so the banner shows the Android variant, then dispatch `appinstalled`; assert the banner unmounts and `localStorage[superdrive-pwa-dismissed]` is set.
3. **Visibility re-check after install** — start non-standalone with the iOS card visible, flip `matchMedia` to standalone, dispatch a `visibilitychange` event on `document`; assert the banner is gone.

Run via `bunx vitest run src/components/__tests__/PWAInstallBanner.test.tsx`.

## Out of scope

- No changes to `InstallStep`, `/install` page, scheduled PWA reminder emails, or `useTrackOperatorPresence` (which already tracks `appinstalled` server-side for telemetry — separate concern).
- No changes to manifest, service worker, or any registration code.

## Technical notes

- The `appinstalled` event is a standard `Event`, fires once on successful PWA installation on Android/desktop Chrome/Edge. iOS Safari does not fire it, which is exactly why the `visibilitychange` standalone re-check is the iOS-side safety net.
- Tools: `code--apply_patch` for both files; `code--exec` to run vitest.
