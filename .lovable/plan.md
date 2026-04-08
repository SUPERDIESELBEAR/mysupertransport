

## Fix: Truck Photo Guide Mobile Issues + App-Wide Back Button

### Problems

1. **Photo Guide modal cut off on mobile**: The `DialogContent` uses `fixed` centering (`top-[50%] translate-y-[-50%]`) with no `max-height` or scroll. On mobile, the intro screen lists all 10 photo slots, overflowing off-screen with no way to scroll — top and bottom are clipped.

2. **Photo Guide steps not functional**: The intro screen shows all 10 slots as a static list (read-only overview). The actual interactive upload starts only after tapping "Start Guide". If the modal is cut off, the "Start Guide" button is hidden below the fold, making it appear non-functional.

3. **Phone back button closes entire browser**: This is a standard SPA problem. The app uses `BrowserRouter` with no `history.pushState` calls when opening modals or navigating between tabs. When the user presses the phone's hardware back button, the browser has no history entry to go back to within the app, so it exits entirely. This affects the entire app.

### Solution

#### 1. Fix Photo Guide mobile layout

**File: `src/components/operator/TruckPhotoGuideModal.tsx`**
- Add `max-h-[90dvh] overflow-y-auto` to the `DialogContent` so the modal scrolls on small screens instead of clipping
- Use `dvh` (dynamic viewport height) to account for mobile browser chrome (address bar, etc.)
- Add safe-area padding for notched phones

#### 2. App-wide back button support via History API

**File: `src/hooks/useBackButton.ts`** (new)
- Create a custom hook that pushes a "virtual" history entry when a modal/drawer/panel opens
- Listen for the `popstate` event and call the provided close callback instead of letting the browser navigate away
- Clean up on unmount

**File: `src/components/ui/dialog.tsx`**
- Integrate `useBackButton` into `DialogContent` so that every dialog in the app automatically supports the phone back button (back = close dialog instead of exit app)

**File: `src/components/ui/sheet.tsx`**
- Same integration for Sheet/Drawer components (used by detail panels, review drawers, etc.)

This approach gives every modal and drawer in the entire app automatic back-button support without modifying each one individually.

### How the back button hook works

```text
User opens modal
  → pushState("#modal-open")
  → popstate listener registered

User presses phone Back
  → popstate fires
  → hook calls onClose() instead of browser navigating away

User closes modal via X or overlay
  → hook calls history.back() to clean up the virtual entry
```

### Files changed

| File | Change |
|------|--------|
| `src/hooks/useBackButton.ts` | New hook: pushes virtual history state on mount, listens for popstate, calls close callback |
| `src/components/ui/dialog.tsx` | Add `max-h-[90dvh] overflow-y-auto` to DialogContent; integrate `useBackButton` |
| `src/components/ui/sheet.tsx` | Integrate `useBackButton` for drawer/sheet components |
| `src/components/operator/TruckPhotoGuideModal.tsx` | Add mobile-safe scrolling classes to DialogContent |

