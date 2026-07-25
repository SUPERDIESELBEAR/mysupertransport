## Problem

Tapping the "Onboard Systems — signature required" card on the driver dashboard switches the view to the OSAS signer, but the page appears scrolled to the bottom. The card sits near the bottom of the dashboard, and the new view mounts with the scroll position preserved.

## Root cause

`OperatorPortal.tsx` already resets scroll on every view change (lines 286–293), but it only calls `window.scrollTo(0)` / `document.documentElement.scrollTop = 0`. In the installed PWA / non-preview layout, the scrolling element is not the window — it is the inner content wrapper at line 1488–1494 (`flex-1 min-h-0 overflow-y-auto`). Because that container's own `scrollTop` is never reset, the new view renders with the previous scroll offset carried over, which lands the user at the bottom of the OSAS screen.

## Fix

Attach a ref to the inner scroll container and reset its `scrollTop` alongside the existing window reset whenever `view` changes.

### Technical details

In `src/pages/operator/OperatorPortal.tsx`:

1. Create `const contentScrollRef = useRef<HTMLDivElement>(null);` near the other refs.
2. Assign `ref={contentScrollRef}` to the wrapper `<div>` at line 1488.
3. In the existing view-change scroll-reset effect (lines 289–293), also do:
   ```ts
   if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
   ```

No other components need changes. The `PendingOSASCard` → `navigateToView('onboard-systems')` flow already updates `view`, so the effect fires on the transition and the OSAS screen will now open at the top.

### Verification

- Load the driver dashboard, scroll to the bottom to reveal the "Onboard Systems — signature required" card, tap it, and confirm the OSAS view opens scrolled to the top (both in the browser preview and the installed PWA layout).
- Sanity-check other view transitions (Home → My Documents, Home → My Truck) still land at the top.
