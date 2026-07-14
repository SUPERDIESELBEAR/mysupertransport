## Bug

When a driver taps **Resource Center** on the home tile grid, the page stays stuck on the loading skeleton (clock icon + pulse bars) forever. No content ever appears.

## Root cause

The Resource Center recently gained a two-tab layout inside `OperatorPortal.tsx`:

- Default tab: **Services & Tools** → renders `<DriverServiceLibrary />`
- Second tab: **Company Documents** → renders `<OperatorResourceLibrary onReady={…} />`

The crossfade overlay (`transitionOverlay` + `DestinationSkeleton`) is dismissed only when the destination view calls `handleDestinationReady('resource-center')`. That callback is wired **only** to `OperatorResourceLibrary`, which lives inside the non-default "Company Documents" tab and is therefore never mounted on first open. Result: `onReady` never fires, the skeleton overlay never fades out, and the user sees the second screenshot indefinitely.

## Fix

Make the "ready" signal fire when the Resource Center view mounts, independent of which tab is active.

### File: `src/pages/operator/OperatorPortal.tsx`

1. In the `view === 'resource-center'` block (around line 1822), add a small effect that calls `handleDestinationReady('resource-center')` once the view mounts (on the next paint / after Suspense resolves for `DriverServiceLibrary`).
   - Easiest implementation: extract a tiny inline component `<ResourceCenterReadySignal onReady={…} />` that runs `useEffect(() => onReady(), [])`, and place it inside the `resource-center` view branch. This avoids adding hooks into the big top-level render.
2. Remove the `onReady` prop from `<OperatorResourceLibrary />` (no longer needed; keeping it would double-fire, which is harmless but noisy).

No other files or backend changes are required. `OperatorResourceLibrary` already handles its own internal loading state for the documents tab.

## Verification

- Open the driver app → tap **Resource Center** from the home grid → skeleton fades and the "Services & Tools" tab renders immediately.
- Switch to **Company Documents** tab → resources load as before.
- Navigate away and back → no regression.
