## Goal

Give dispatchers a one-tap way to view a driver's truck decal install photos (driver side, passenger side, and any extra angles) from the Dispatch Board — without leaving the board or drilling into the Driver Hub.

## Where decal photos live (verified)

- Stored on `onboarding_status`:
  - `decal_photo_ds_url` (driver side)
  - `decal_photo_ps_url` (passenger side)
  - `decal_photos` (jsonb array of `{ url, label, uploaded_at, uploaded_by }`)
- Rendered elsewhere by `StaffDecalPhotoEditor` and viewed via the existing `PreviewLink` → `FilePreviewModal` (the same in-app image modal we standardized on).

## UX

On each driver dispatch card (both compact + expanded layouts, lines ~1822 and ~2195 in `DispatchPortal.tsx`), add a small **Decals** action next to the existing **Binder** and **History** buttons.

- Icon: `Camera` (lucide) + label "Decals". Same size/weight as sibling buttons.
- If the driver has **no** decal photos on file: button is still visible but disabled with tooltip "No decal photos uploaded yet" (keeps the row visually consistent and signals the gap to staff).
- Click → opens a lightweight `DecalPhotosQuickView` modal (not a full sheet), showing:
  - Driver name in header
  - Two labeled tiles for **Driver Side** and **Passenger Side**
  - A grid of any extra angles below (label + thumbnail)
  - Each thumbnail is a `PreviewLink` so tapping it opens the full-screen `FilePreviewModal` we already use everywhere else (pinch/zoom on mobile, download, etc.)
  - Empty slots show a dashed placeholder ("Not uploaded")
- Read-only for dispatchers. No upload/edit UI here — that stays in Driver Hub / `StaffDecalPhotoEditor`.

## Changes

### 1. Data — surface decal fields on the dispatch row
- `src/pages/dispatch/DispatchPortal.tsx`: extend the query that builds each driver row (the same one that already pulls onboarding fields for the card) to include `decal_photo_ds_url`, `decal_photo_ps_url`, `decal_photos`. Add the three fields to the row type.

### 2. New component
- `src/components/dispatch/DecalPhotosQuickView.tsx`:
  - Props: `open`, `onOpenChange`, `driverName`, `dsUrl`, `psUrl`, `extras: DecalPhotoExtra[]`
  - Reuses the `DecalPhotoExtra` type already exported from `StaffDecalPhotoEditor.tsx`.
  - Renders a `Dialog` (shadcn) with the layout above; thumbnails wrapped in `PreviewLink`.

### 3. Wire into the card
- `DispatchPortal.tsx`: add local state `decalTarget: { name, dsUrl, psUrl, extras } | null`. Add the **Decals** button in both card variants. Render `<DecalPhotosQuickView … />` once at the bottom, alongside the existing Binder sheet.

## Out of scope

- No changes to how decal photos are uploaded or stored.
- No new backend, RLS, or migrations — RLS on `onboarding_status` already allows dispatchers to read these columns (same source the card already uses).
- No changes to Driver Hub / `StaffDecalPhotoEditor`.

## Verification

1. From Dispatch Board, click **Decals** on a driver with photos → modal opens, DS/PS + extras visible, tapping a thumbnail opens the full-screen image preview.
2. Click **Decals** on a driver with no photos → button is disabled with tooltip.
3. Sibling **Binder** and **History** buttons still work unchanged.
4. Works in both compact and expanded card layouts, on mobile viewport.
