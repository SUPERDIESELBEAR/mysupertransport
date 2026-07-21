## Goal

When a dispatcher clicks an enabled **Decals** camera button on any Dispatch Board driver card, the driver’s uploaded Stage 5 decal photos should open inside the app, not as a broken/no-op link. The viewer should include previous/next arrows for multiple photos and an **X** close button that returns the user to the Dispatch Board.

## Verified current state

- Steve Figueroa has two decal URLs saved in `onboarding_status`: driver side and passenger side.
- `DispatchPortal.tsx` already reads `decal_photo_ds_url`, `decal_photo_ps_url`, and `decal_photos` from each driver’s onboarding status.
- The Decals buttons already set `decalTarget`, but the current modal first shows a thumbnail grid and then opens a second preview layer. That does not match the requested direct photo carousel behavior and is likely contributing to the “nothing happens” experience.

## Fix plan

1. **Replace the Dispatch decal click behavior with a direct carousel preview**
   - Keep the camera icon enabled only when the driver has uploaded decal photos.
   - On click, open the decal viewer directly to the first uploaded photo.
   - Include all available sources in order:
     1. Driver Side
     2. Passenger Side
     3. Additional uploaded angles

2. **Update `DecalPhotoViewerModal` into a single in-app viewer**
   - Remove the intermediate thumbnail grid requirement for dispatch usage.
   - Use the existing in-app `FilePreviewModal` so the viewer already has:
     - **X** close button
     - Back button
     - left/right arrow controls
     - keyboard arrow navigation
     - full-screen image viewing
   - Pass `onPrev`, `onNext`, and a counter like `1 of 2` so users can move between Steve’s two photos.

3. **Make URL handling reliable for old saved decal links**
   - Keep using `resolveDecalUrl()` to refresh old/expired storage links.
   - Seed the viewer with the stored URL immediately, then replace it with a refreshed secure URL when available.
   - If refresh fails, keep the original URL rather than showing nothing.

4. **Clean up temporary debugging logs**
   - Remove the current `[decals] card click`, `[decals] list click`, and `[decals] modal effect` console logs once the modal flow is corrected.

5. **Verify against Steve Figueroa’s scenario**
   - Confirm Steve’s Dispatch Board Decals button opens the two-photo viewer.
   - Confirm the arrows move between Driver Side and Passenger Side.
   - Confirm the X closes the viewer and returns to the Dispatch Board.

## Files to change

- `src/components/fleet/DecalPhotoViewerModal.tsx`
- `src/pages/dispatch/DispatchPortal.tsx`

No database migration is needed because the decal photo URLs are already saved and already queried by the Dispatch Board.