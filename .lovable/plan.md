## Scope: applies to every driver, not just Steve

Steve is the reproduction case, but every step below operates on **all** operators. No driver-specific logic, no allowlists. When we're done, any driver with decal photos in Stage 5 will see them in the Dispatch Board modal — and the same treatment covers Vehicle Hub decal and truck-photo viewers.

## What I confirmed

Steve Figueroa (operator `2c24ca65…ee109`) has both decal URL columns populated:
- `decal_photo_ds_url` and `decal_photo_ps_url` are Supabase `/object/sign/...` URLs whose tokens were issued in 2026.

So the Dispatch icon is correctly enabled and `DecalPhotoViewerModal` receives both URLs — the failure is downstream (viewer/URL resolution), not row-sync. The prior turn's backfill + trigger already fixed the storage↔column drift class; this is a separate class of failure that also affects other drivers whose columns hold stale/invalid signed tokens.

## Root cause candidates (verify in this order, against real drivers)

1. **Stored `/object/sign/...` URL is no longer honored.** When `resolveDecalUrl` fails to re-sign, it falls back to the original stored URL; if that URL's token is invalid (rotated key, `iat` skew, expired), the `<img>` load 400/403s and the modal shows nothing.
2. **`FilePreviewModal` misroutes an image URL with `?token=…`** because file-type sniffing keys off the extension after the query string.
3. **The storage object is actually missing** for that operator.

## Fix plan (all drivers)

### Step 1 — Reproduce and capture the real failure

Sign in as a dispatcher via Playwright, open Steve's card, click Decals, and capture the final `<img>` src, network status, and any `resolveDecalUrl` errors. Then repeat on one more driver whose columns are also `/object/sign/...` URLs to confirm the same failure mode.

### Step 2 — Harden the viewer for every driver

Applied globally:
- **Surface storage errors** in `resolveDecalUrl` instead of silently returning the stale URL. If re-signing succeeds, use the fresh URL; if it fails **and** the stored URL is a Supabase signed URL, treat the tile as "photo unavailable" rather than rendering a broken image.
- **Fix image detection** in `FilePreviewModal` so any `.jpg/.jpeg/.png/.heic/.webp` path renders as `<img>` regardless of trailing `?token=…`.
- **Missing-object state**: when the storage object doesn't exist, show a clear "File missing — re-upload from Stage 5" tile.

These changes apply to every render of `DecalPhotoViewerModal` and `DecalPhotosQuickView` — Dispatch Board and Vehicle Hub both consume them.

### Step 3 — One-shot data normalization for every driver

Migration that rewrites, for **all** rows in `onboarding_status`:
- `decal_photo_ds_url`, `decal_photo_ps_url`, and each `decal_photos[].url`
- `truck_photo_front_url`, `_back_url`, `_ds_url`, `_ps_url`, and each `truck_photos_extra[].url`

…from any `/object/sign/{bucket}/{path}` (or `/object/public/{bucket}/{path}`) form back to the bare storage path (`{operator_id}/decal_photos/{file}` or `{operator_id}/truck_photos/{file}`). The resolver already handles bare paths and mints a fresh signed URL at read time, so this permanently removes the "stale signed token" failure mode for every driver, everywhere the columns are read.

Rows already storing a bare path are left alone. The auto-sync trigger from the previous turn already writes bare paths going forward.

### Step 4 — Verify across drivers, not just Steve

- Query: count operators whose decal or truck URL columns still contain `object/sign` or `object/public` → must be `0` after Step 3.
- Steve: Dispatch Decals → both photos render; Vehicle Hub → Decals → same; Vehicle Hub → Truck Photos → Stage 2 uploads render.
- Two additional drivers picked at random from the set that Step 3 rewrote: same three checks pass.
- One driver with **no** decal photos: Dispatch icon still disabled (no regression).
- One driver whose Stage 5 upload happens **after** the fix ships: photos appear in Dispatch and Vehicle Hub without a manual refresh (trigger + realtime).

## Technical details

- Files touched: `src/lib/decalUrl.ts` (loud errors, prefer bare path), `src/components/fleet/DecalPhotoViewerModal.tsx` and `src/components/dispatch/DecalPhotosQuickView.tsx` (missing-file state), `src/components/inspection/DocRow.tsx` (`FilePreviewModal` image detection).
- One migration to normalize `onboarding_status` URL columns to bare storage paths (decal + truck).
- No changes to Dispatch card gating (`hasDecals`), the upload writers, or the sync trigger — they already work universally.
