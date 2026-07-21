## What's happening

The Dispatch Board's Decals button reads the same three onboarding fields the driver's onboarding flow writes to (`decal_photo_ds_url`, `decal_photo_ps_url`, `decal_photos`), so the data source is already correct — Hafeezullah is dim only because he genuinely has nothing uploaded yet.

Where it falls short in practice:

- Stored URLs are a mix of long-lived `/object/sign/…` links (valid to 2031), stale short-lived `/sign/…` links, and `/object/public/…` links against a bucket that's actually private.
- `DecalPhotosQuickView` (used by Dispatch) tries to mint a fresh signed URL on open. When that call fails or returns nothing, the tile falls back to a "File missing" placeholder — even when the originally stored long-lived signed URL would have loaded fine. Net effect: the popup often shows empty tiles for drivers who do have photos.
- Vehicle Hub already has a nicer, proven viewer (`DecalPhotoViewerModal`) with an expand-to-fullscreen preview and consistent tile styling.

## Fix

Unify Dispatch on the Vehicle Hub viewer and make URL resolution fall back to the stored URL when re-signing fails, so the photos uploaded during onboarding always render.

### Steps

1. **Harden `resolveDecalUrl`** (`src/lib/decalUrl.ts`): on `createSignedUrl` error/empty, return the original `storedUrl` instead of `null`. Existing long-lived signed URLs (exp 2031) then still render. Only URLs whose object truly doesn't exist stay broken.
2. **Point Dispatch at the Vehicle Hub viewer**: in `src/pages/dispatch/DispatchPortal.tsx`, swap the two `<DecalPhotosQuickView …>` usages (list + card views) for `<DecalPhotoViewerModal …>` from `src/components/fleet/DecalPhotoViewerModal.tsx`. Keep the same "lit vs dull" presence check driving the button state — that's already correct.
3. **Route `DecalPhotoViewerModal` through the hardened resolver**: replace its local `refreshSignedUrl` helper with `resolveDecalUrl` so it inherits the same pass-through fallback behavior. Consistent behavior wherever decals are viewed (Dispatch + Fleet).
4. **Verify** by opening the Decals popup on Dispatch for a few drivers with the different stored URL shapes (long-lived `/sign/` — e.g. operator `71221960…`, and `/public/` — e.g. `2df36975…`), and confirming images now render. Confirm Hafeezullah's button stays disabled with the "No decal photos uploaded yet" tooltip.

### Technical notes

- No schema change, no migration, no writer changes. Read-side only.
- `DecalPhotosQuickView.tsx` becomes unused after step 2; leave it in place for now (safe to remove in a follow-up cleanup pass).
- Files touched:
  - `src/lib/decalUrl.ts` — fallback to stored URL on resolver failure
  - `src/components/fleet/DecalPhotoViewerModal.tsx` — use shared `resolveDecalUrl`
  - `src/pages/dispatch/DispatchPortal.tsx` — swap modal component in both list and card renderers
