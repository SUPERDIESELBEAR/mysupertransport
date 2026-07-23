## Plan

1. **Fix the decal carousel modal behavior**
   - Update the decal photo viewer so moving from photo 1 to photo 2 changes the displayed image in-place instead of unmounting/remounting the preview modal.
   - Keep the modal open while `activeIndex` changes.

2. **Prevent history/back-stack interference**
   - Avoid triggering the modal back-button cleanup when only the selected decal image changes.
   - Ensure the Back/Close action still returns to the Dispatch Board only when the user intentionally closes the modal.

3. **Verify in the preview**
   - Open the Dispatch Board on the current mobile-sized viewport.
   - Click Steve’s Decals button.
   - Click the next arrow and confirm the second decal photo appears without returning to the board.

## Technical notes

- The decal viewer currently renders `FilePreviewModal` with `key={activeTile.key}`. Changing photos changes the key, which remounts `FilePreviewModal`.
- `FilePreviewModal` uses `useBackButton`; remounting can pop the virtual modal history entry and close/navigate unexpectedly.
- The fix is to remove the remount-on-photo-change pattern and let `FilePreviewModal` react to the new `url`/`name` props normally.