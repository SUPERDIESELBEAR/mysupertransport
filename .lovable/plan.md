# Driver App: Persistent Top Bar + Back Button

## Goal
1. Keep the Driver app top bar (logo, profile, notification preferences, notification bell, sign out, and a new Back button) visible at all times — never scroll away.
2. Add a Back button so drivers can return from a sub-view (Document Hub → opened policy doc, Fleet → My Truck detail, ICA, Messages thread, Notifications, etc.) without scrolling back to the top to use the tab nav.

## Changes

### 1. Lock the top bar (`src/pages/operator/OperatorPortal.tsx`)
- Today the `<header>` uses `sticky top-0 z-40`. On mobile PWAs, sticky can be pushed out of view by safe-area / virtual keyboards / parent overflow. Convert to:
  - `fixed top-0 inset-x-0 z-40` with the same dark surface styling.
  - Add `pt-16` to the main content wrapper (line 1060) so content isn't hidden under the bar.
  - Add `env(safe-area-inset-top)` padding so the bar clears the iOS status bar in PWA standalone mode.
- Bottom mobile tab nav is already `fixed bottom-0` — no change.

### 2. Add a Back button to the top bar
- New state `viewHistory: OperatorView[]` in `OperatorPortal`. Push the previous view onto it inside `setView` whenever the view actually changes (skip duplicates).
- Render a Back button (`ChevronLeft` from lucide) at the far left of the header, just before the logo:
  - **Hidden when `viewHistory.length === 0`** — no disabled/ghost state on root tabs (confirmed UX choice).
  - On click: pop the last entry and call the underlying setter directly (without re-pushing).
  - Also clears any open sub-detail state (e.g. `FleetDetailDrawer` open, doc viewer modals) via the existing `onBack` props on sub-components.
- Keyboard: Esc triggers Back when history is non-empty.
- Hardware back: integrate with the existing `useBackButton` hook so Android hardware back behaves the same instead of exiting the PWA.

### 3. Sub-view back affordance
- Top-bar Back is the single primary back control — no duplicate in-page back buttons added.

## Out of scope
- No business-logic changes (acknowledgment gating, Go Live enforcement, etc. remain as previously planned).
- No styling overhaul of the header beyond the new Back icon button and safe-area padding.

## Technical notes
- File: `src/pages/operator/OperatorPortal.tsx` only.
- Icon: `ChevronLeft` from `lucide-react` (add to existing import list if missing).
- `setView` wrapper signature unchanged so all existing call sites keep working.
