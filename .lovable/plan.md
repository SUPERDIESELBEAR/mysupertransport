# Fix: Bottom Nav Moves While Scrolling (Driver App)

## What's happening

The mobile bottom tab bar in `src/pages/operator/OperatorPortal.tsx` is rendered with `position: fixed; bottom: 0`. On iOS Safari (and in PWA mode on some devices), a page that scrolls the whole `<body>` causes any `position: fixed` element to visibly shift or lag during momentum scroll and while the URL/status bar shows/hides. That's exactly the "the black bar moves when scrolling" symptom drivers are reporting.

The correct, permanent fix on mobile web/PWA is to stop scrolling the body and instead use an **app-shell layout** — the outer container fills the dynamic viewport, the middle content pane is the only scroller, and the top header + bottom nav sit as normal (non-fixed) flex children. The nav then physically cannot move because nothing is scrolling around it.

## Scope

Frontend/presentation only. No business logic, no data changes, no backend.

Single file: `src/pages/operator/OperatorPortal.tsx`.

## Changes

1. **Outer container** (line ~1140): change `min-h-dvh bg-secondary` to a full-height flex column:
   ```
   h-[100dvh] flex flex-col bg-secondary overflow-hidden
   ```

2. **Top header** (line ~1172): remove `fixed top-0 inset-x-0 z-40` so it becomes a normal flex child. Keep the `env(safe-area-inset-top)` padding.

3. **Main content wrapper**: wrap the existing scrollable content in a new `<main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">`. Remove the current top padding compensations that exist only because the header is fixed (line ~1400 `paddingTop: calc(1.5rem + 4rem + env(safe-area-inset-top))` and the `pb-24` bottom padding on the BuildInfo block — the flex layout handles both automatically).

4. **Floating "Next Step" CTA** (line ~1927): keep it visually above the nav, but re-anchor it to sit inside the app shell above the nav. Simplest: move it to be a sibling that sits between `<main>` and `<nav>` with `sticky bottom-0` behavior inside the shell, or keep it `fixed` but with `bottom: 4rem + safe-area` (unchanged) — it's not the source of the reported bug, so we leave its position class alone and only ensure it still visually clears the nav.

5. **Bottom nav** (line ~1989): remove `fixed bottom-0 inset-x-0 z-40`. It becomes a normal flex child at the end of the shell. Keep the internal safe-area spacer.

6. **Preview mode branch**: keep the current non-shell rendering for the in-app "Preview as operator" iframe view (`isPreview === true`), which already skips the fixed header/nav. No change there.

## Why this works

- Body no longer scrolls, so iOS has nothing to hide/show the URL bar against and nothing to rubber-band.
- The nav is a static child of a fixed-height column, so it's mechanically anchored to the bottom of the viewport at all times — no `position: fixed` reliance.
- `100dvh` handles the dynamic viewport so the shell always fills the visible area on iOS/Android.
- Modals, drawers, and existing fixed overlays (toasts, dialogs) are portalled to `body` and are unaffected.

## Verification

- Load `/operator` on the mobile preview at 390×844 and scroll long views (Home, Binder, Messages, Doc Hub) — the black nav must stay pinned pixel-perfect.
- Confirm the top header stays pinned during scroll of the content pane.
- Confirm the "Next Step" floating CTA still appears above the nav and doesn't overlap it.
- Confirm desktop (`md:` and up) still renders correctly — the bottom nav is `md:hidden` and the top nav's desktop layout is unchanged.
- Regression-check the Resource Center skeleton, ICA signing screen, and any full-height modals still fit inside the shell.
