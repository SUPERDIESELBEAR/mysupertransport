## Context

- Video confirms Emma is on the latest published build (footer shows `v.36395a · Jul 13, 2026 at 11:17 AM CT`).
- She is in iOS **Safari** (not the installed PWA — the Safari app-switcher card is visible behind the recorder overlay).
- Both **onboarding CTAs** ("Review & Acknowledge Documents", "Complete Pay Setup") AND the **bottom tab bar** (Binder / Messages / Doc Hub / FAQ) fail — every tap keeps her on the Status screen.
- The current route-based navigation (`operatorRoutes.ts`) reads correctly on inspection, so we cannot diagnose further without data from Emma's device.

## Plan

### 1. Ship an in-app "Copy Diagnostics" tool the driver can trigger

Goal: capture what's actually happening on Emma's phone the next time she reproduces the bug.

- Add a **hidden diagnostics panel** that opens when the driver taps the version string in `BuildInfo` **5 times in a row** (no visual affordance change — safe to leave in production).
- Panel shows:
  - Build version, user agent, `display-mode`, `standalone`, viewport size, online/offline.
  - Whether a service worker is currently registered and its scope.
  - The last ~50 entries of `sd-nav-trace` from `localStorage` (already captured).
  - A big **"Copy diagnostics"** button that copies everything as plain text (uses the existing `copyToClipboard` fallback in `src/lib/pwa.ts`).
  - A **"Reset app state"** button that: unregisters any service workers, clears the `sd-nav-trace` and other `sd-*` localStorage keys, then hard-reloads to `/operator/status`.
- No new backend, no PII beyond what she already sees on screen.

### 2. Instrument the actual pointer → navigation path

Right now `sd-nav-trace` only records our internal `navigateToView` and redirect effects. When Emma taps and stays on Status, we cannot tell whether:
  - the click never reached `navigateToView`,
  - `navigateToView` ran but the URL was immediately rewritten,
  - the URL changed but React re-rendered the wrong view.

Add three new trace events, all client-side only:
- `pointer-tap` — captured at the document level, logs `target selector`, `pathname before`, and `defaultPrevented` at pointer-up time.
- `location-change` — a single effect on `useLocation()` that logs every pathname/search transition with a timestamp.
- `view-mismatch` — after render, if `view` derived from URL differs from the `view` that was last requested via `navigateToView`, log both.

Trim the ring buffer so it stays under ~50 KB.

### 3. Verify one concrete hypothesis before Emma retests

The transition-overlay (`transitionOverlay` block in `OperatorPortal.tsx`) covers the just-mounted view with a skeleton until the destination calls `onReady`. Several views (`pay-setup`, `docs-hub`, `messages`, `documents`) do **not** call `onReady`, so if the overlay was ever set for them it would stay opaque forever and visually look like "nothing happened".

- Audit every `setTransitionOverlay` call site.
- For any target view whose component does not accept/fire `onReady`, either:
  - remove the overlay for that target, or
  - add a short (500 ms) safety timer that force-fades the overlay.
- This is a low-risk change and directly matches Emma's "screen flashes, stays on Status" description even if it turns out not to be the root cause.

### 4. Fix a real gap in the tap → route path

Audit the specific buttons Emma taps in the video and make sure **each** goes through `navigateToView` (or a plain `<Link>`), never through a handler that could early-return:

- "Review & Acknowledge Documents" in `SmartProgressWidget.tsx` and `OperatorStatusPage.tsx`.
- "Complete Pay Setup" in `OperatorStatusPage.tsx` and the Stage-9 card in `OperatorPortal.tsx`.
- The gold floating "Next step" CTA in `OperatorPortal.tsx` (currently calls `nextStep.action` which is a closure that captures `navigateToView` — verify it is stable and does not depend on stale `stages` data).

Add `data-nav-cta="<name>"` attributes so the new `pointer-tap` trace event can identify which button was tapped.

### 5. Verify locally with Playwright

- Load the running preview at `/operator/status` (public route mechanics only — Emma's authenticated session is not available in the sandbox), tap through each bottom tab, and confirm:
  - the URL updates,
  - the rendered view changes,
  - no bounce back to `/operator/status`,
  - `localStorage.sd-nav-trace` contains matching `pointer-tap` → `location-change` → `view-mismatch: false` sequences.
- Capture screenshots per step.

### 6. Deliver next-steps to Emma

When shipped, give her exactly three actions:
1. Open the app, tap the version string 5 times at the bottom of the Status page.
2. Tap **Reset app state** once and let it reload.
3. If the bug returns, open the same panel and tap **Copy diagnostics**, then paste to support.

The reset alone may unstick her. If it does not, the diagnostics will show us the true cause on the next try.

## Files expected to change

- `src/components/BuildInfo.tsx` — 5-tap gesture + open diagnostics dialog.
- New `src/components/operator/DriverDiagnosticsPanel.tsx` — the panel UI, copy, and reset actions.
- `src/pages/operator/OperatorPortal.tsx` — add `location-change` and `view-mismatch` trace events; audit `setTransitionOverlay` call sites; audit CTA handlers; add `data-nav-cta` attributes.
- `src/components/operator/OperatorStatusPage.tsx`, `SmartProgressWidget.tsx` — `data-nav-cta` attributes on the Review/Pay-Setup CTAs.
- `src/lib/navTrace.ts` (new, or extend the existing helper in `OperatorPortal.tsx`) — centralize `appendNavTrace`, add ring-buffer size cap, add global `pointer-tap` document listener registered once from `OperatorPortal.tsx`.
- No database changes. No SW changes.

## Technical details

- Ring buffer cap: keep only the last 50 entries, drop the oldest when writing.
- Copy format: plain text, one JSON line per entry, prefixed with a header block (`build`, `ua`, `display-mode`, `standalone`, `viewport`, `sw`).
- Reset action: `navigator.serviceWorker?.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`, `Object.keys(localStorage).filter(k => k.startsWith('sd-')).forEach(k => localStorage.removeItem(k))`, then `window.location.replace('/operator/status')`.
- The 5-tap gesture: track tap timestamps in a ref, open the panel when 5 taps land within 3 seconds. No visible affordance.
- Transition-overlay safety timer: `window.setTimeout(() => setTransitionOverlay(o => o ? { ...o, phase: 'fading' } : o), 500)` cleared on unmount.
