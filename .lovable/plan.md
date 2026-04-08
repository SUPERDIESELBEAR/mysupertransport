

## Remove Emojis from Truck Photo Guide Steps

Remove the emoji icons displayed next to each of the 10 photo steps in the Truck Photo Guide modal.

### Changes

**File: `src/components/operator/TruckPhotoGuideModal.tsx`**

1. Remove the `icon` property from the `PhotoSlot` interface and all 10 slot definitions
2. Remove the three `<span>` elements that render `slot.icon` / `currentSlot.icon`:
   - Line 245 (intro list)
   - Line 279 (active step header)
   - Line 408 (review list)

