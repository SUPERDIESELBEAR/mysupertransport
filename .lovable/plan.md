# Dispatch Board "Decals" modal fixes for all drivers

## Confirmed root cause (reproduced as Emma against Steve Figueroa)

Clicking Decals on Steve's card in the Dispatch Board:

- `POST /storage/v1/object/sign/operator-documents/.../ds_...jpg` → **200**
- `POST /storage/v1/object/sign/.../ps_...jpg` → **200**
- `GET  /storage/v1/object/sign/.../ds_...jpg?token=…` → **200** (image bytes arrive)
- Radix `DialogContent` "Missing Description" warning fires (loading dialog mounted)
- Five seconds later: **no dialog in the DOM**, no error

The data pipeline is fine. Steve's `onboarding_status.decal_photo_ds_url` / `_ps_url` are already normalized bare paths, PostgREST returns them, `resolveDecalUrl` re-signs them successfully, and the image loads.

What breaks is inside `DecalPhotoViewerModal`:

1. First render (bare paths, no signed URL yet): returns a Radix `<Dialog>` "Loading decal photo…"
2. `resolveDecalUrl` resolves → `signed` state updates → the component now returns a **plain inline** `<FilePreviewModal>` (`<div className="fixed inset-0 z-50 …">`) instead
3. The Radix Dialog unmounts and `FilePreviewModal` mounts in the same commit. `FilePreviewModal` calls `useBackButton(true, onClose)`, which `history.pushState`s a virtual entry
4. The transition races with Radix's DismissableLayer teardown / a popstate on the freshly-pushed entry, and `onClose` fires — `setDecalTarget(null)` — closing the modal before the user sees anything

Vehicle Hub happens to work because `FleetRoster` wraps the modal in `{decalPhotoTarget && …}`, so the loading Radix Dialog is never rendered first — the component only mounts once the target is set and stays as a single `FilePreviewModal`. Dispatch renders `<DecalPhotoViewerModal open={!!decalTarget} …/>` unconditionally, so the loading→preview render swap always runs.

## Fix

Eliminate the render swap. `DecalPhotoViewerModal` should always render the same top-level container; only the *contents* change based on loading state.

### `src/components/fleet/DecalPhotoViewerModal.tsx`

- Return one consistent tree in the "opened" branch: the inline `FilePreviewModal` overlay for the active tile.
- Drop the intermediate Radix `<Dialog>` "Loading decal photo…" state. Instead, when the signed URL is not ready yet, render `FilePreviewModal` with a lightweight `loading` prop (or wrap it and show a spinner over the same backdrop). No mount/unmount between states.
- Keep the "no photos uploaded" and "photo unavailable" empty states as inline overlays too (not Radix Dialogs), so every open path uses the same root element and `useBackButton` mounts exactly once per open cycle.
- Guard `useBackButton` so it only pushes when we actually have an interactive modal to close (i.e., don't push during the "no photos" empty-state overlay if the caller expects an immediate no-op close).

### `src/components/inspection/DocRow.tsx` (`FilePreviewModal`)

- Add an optional `loading?: boolean` prop. When true, render the same backdrop + header shell but show a spinner instead of the `<img>`/iframe. This lets `DecalPhotoViewerModal` keep a single `FilePreviewModal` mounted from click → image ready.
- Leave existing image/PDF detection alone — it already handles signed URLs with `?token=…` correctly (`fileTypePath` strips the query).

### Align Dispatch with Vehicle Hub's mount pattern (belt-and-suspenders)

`src/pages/dispatch/DispatchPortal.tsx` line 2479: wrap the modal in `{decalTarget && (…)}` instead of `open={!!decalTarget}`. This ensures the modal only mounts once per open cycle and can't run its loading-state render before `decalTarget` is set.

## Verification

Run the same Playwright reproduction against localhost as Emma:

1. Dispatch Board → click Decals on Steve's card (unit #234) → modal appears with both photos, no flicker, `getRole('dialog')` / `.fixed.inset-0` overlay present in the DOM after 3s.
2. Repeat on two more drivers from the 7 currently-eligible set (e.g., Rodney Newberry #235, Ian Dunfee #258) — both open cleanly.
3. Vehicle Hub → Decals for the same three drivers still works (no regression).
4. A driver with no decal photos → button stays disabled (no regression).
5. Close via backdrop click, Escape, and hardware Back — each closes exactly once and leaves `history.length` unchanged (no phantom back-nav).

## Technical notes

- Only frontend/presentation code changes; no schema or RLS work needed. The prior URL normalization migration and the storage sync trigger stay as-is.
- The signed-URL POST + image GET already return 200 for Steve, so the fix is purely rendering; storage grants and RLS are proven correct by this turn's network capture.
- No changes to `src/lib/decalUrl.ts` or the upload writers.
