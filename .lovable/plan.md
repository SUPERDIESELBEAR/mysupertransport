## What's happening

Data-side, decal photos are wired end-to-end: `DispatchPortal` reads `decal_photo_ds_url` / `decal_photo_ps_url` / `decal_photos` from `onboarding_status`, lights the Decals icon when any of them exist, and on click sets `decalTarget`, which drives `<DecalPhotoViewerModal open={!!decalTarget}>` at the bottom of the tree. That's correct — the drivers you named do have URLs in those columns.

But right now clicking Decals opens nothing. I can't reproduce end-to-end from the sandbox (auth is signed out here), so I'm going to treat the diagnosis as **unconfirmed** and make step 1 of this plan an actual verification, not an assumption. The most plausible causes based on a code read:

1. `<DecalPhotoViewerModal>` (in `src/components/fleet/DecalPhotoViewerModal.tsx`) throws or auto-closes before paint. It's the modal that replaced `DecalPhotosQuickView` in the last turn.
2. The click handler fires but the render tree doesn't see the state change (e.g. the button lives inside a memoized subtree whose parent re-render is being swallowed by a re-mount elsewhere).
3. A stale service-worker cache is serving the old bundle to the user, so what they're clicking is the pre-swap code path.

## Fix

Small, defensive changes that cover all three suspects without over-engineering.

### Steps

1. **Verify what's actually happening on click.** Temporarily wrap the two `onClick={() => setDecalTarget(...)}` handlers in `DispatchPortal.tsx` with `console.log('[decals] open', row.operator_id, {...})` and log again inside the `useEffect(..., [open, tiles])` in `DecalPhotoViewerModal.tsx`. Ask the user to click Decals on Steve Figueroa's card once and share the console. If we see the outer log but not the effect log, the modal isn't mounting → suspect (1). If we see neither, the button isn't wired → suspect (2). If we see both but nothing renders, it's a paint/z-index or stale-bundle issue → suspect (3).
2. **Harden the modal against silent failure.** In `DecalPhotoViewerModal.tsx`:
   - Wrap the `refreshSignedUrl` `Promise.all` in `try/catch`; on failure, seed `signed` with the raw URLs so tiles still render.
   - Give the `Dialog` a stable `key={driverName}` and drop the local `<button aria-label="Close">` (Radix already renders one) — it's currently outside `<DialogTitle>` and can steal focus in a way that occasionally re-triggers `onOpenChange(false)` right after open.
3. **Bust the service-worker cache** by bumping `public/version.json`. Users on old bundles will get the current code on next refresh. This eliminates suspect (3) without any code churn.
4. **After the user confirms** which log path fired (or that logs never appeared), remove the temporary logs and, if needed, apply the specific fix that matches — e.g. swap the modal back to the still-present `DecalPhotosQuickView` if the fleet modal is the one throwing.

### Technical notes

- No schema, no migration, no writer changes. Read-side only.
- Files touched in this plan:
  - `src/pages/dispatch/DispatchPortal.tsx` — temporary click logs on both Decals buttons
  - `src/components/fleet/DecalPhotoViewerModal.tsx` — try/catch around URL resolution, remove redundant close button, stable key, effect log
  - `public/version.json` — bump to force fresh bundle
- The `resolveDecalUrl` fallback added last turn stays as-is; it's not the failure surface here (it can't prevent the dialog from opening).
