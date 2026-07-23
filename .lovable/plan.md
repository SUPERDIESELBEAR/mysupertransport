# Dispatch Board "Decals" modal — mobile-viewport regression

## What I know

- The earlier fix works at 1280+ widths (verified via Playwright: modal opens, image 200s).
- At the preview's mobile viewport (647×710) Playwright reproduces exactly what you're seeing: the Decals button reports `disabled=false`, `.click()` fires, but no signed-URL POST goes out, no `.fixed.inset-0` overlay ever appears in the DOM, no console error.
- Same code path (`setDecalTarget(...)` → `{decalTarget && <DecalPhotoViewerModal open …/>}` → `<FilePreviewModal>`), just a different width.
- No mobile-only branch exists in `DispatchPortal.tsx` around the Cards view's Decals button, and no swipe/gesture handler wraps the card, so the click *should* reach React the same way it does on desktop.

That leaves two candidates I want to nail down before touching UI code: either React's `onClick` isn't firing on the small-viewport Cards render (e.g. the Card is inside a scroll container whose child intercepts the click), or `setDecalTarget` fires but the modal is being unmounted immediately by a re-render triggered on mobile only.

## Plan

### Step 1 — Add a scoped runtime trace (temporary)

In `src/pages/dispatch/DispatchPortal.tsx`:
- Wrap the Cards-view Decals `onClick` (line 1860) with a `console.debug('[decals] click', row.operator_id, { ds: !!row.decal_photo_ds_url, ps: !!row.decal_photo_ps_url })` before `setDecalTarget(...)`.
- Log the render side: `useEffect(() => { console.debug('[decals] target', decalTarget?.name ?? null); }, [decalTarget])`.

In `src/components/fleet/DecalPhotoViewerModal.tsx`:
- `console.debug('[decals] modal render', { open, tiles: tiles.length })` at the top of the component.

Run Playwright at 647×710 against Steve's card and read the console. Three outcomes decide the fix:

- **No `[decals] click` log** → the button click isn't reaching React. Root cause is an ancestor swallowing the event on small viewports. Fix by hardening the button (see Step 2a).
- **`[decals] click` fires but `[decals] target` stays `null`** → state update dropped (StrictMode double-invoke or unmount race). Fix by moving `decalTarget` up out of a component that's remounting (see Step 2b).
- **`[decals] target` sets and `[decals] modal render` runs but no overlay** → `FilePreviewModal` mounts and immediately unmounts. Fix by removing whatever triggers the remount (see Step 2c).

### Step 2 — Apply the matching fix

- **2a (event swallowed):** Add `onPointerUp` in addition to `onClick` on the Decals button, and confirm no ancestor `<div>` in the Card sets `pointer-events-none` at `<lg` widths.
- **2b (state dropped):** Move the `decalTarget` state and the `{decalTarget && <DecalPhotoViewerModal .../>}` render to the top of `DispatchPortal`'s return so it isn't inside any branch that toggles between mobile/desktop layouts.
- **2c (modal remounts):** Portal `FilePreviewModal` (or the Decal viewer wrapper) to `document.body` via `createPortal` so parent Cards-view re-renders can't unmount it, and stabilize the `key` on `FilePreviewModal` so URL churn doesn't re-mount.

### Step 3 — Verify

- Playwright at 647×710: click Decals on Steve's card → `.fixed.inset-0` overlay present, decal image loaded (`naturalWidth > 0`), signed-URL POST 200.
- Repeat at 1280×1800 (make sure Step 2 didn't regress the earlier desktop fix).
- Vehicle Hub Decals on the same driver still works.
- Remove the temporary `console.debug` lines from Step 1 before closing out.

## Technical notes

- Frontend-only changes. No schema, RLS, or edge-function work.
- No changes to `src/lib/decalUrl.ts`, uploaders, storage triggers, or `useSignedUrl`.
- Once the console traces name the culprit, the actual fix is a few lines in one file.
