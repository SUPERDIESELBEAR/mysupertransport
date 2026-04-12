

## Implement Truck Photo Guide UX Improvements

### Changes

**1. `src/components/operator/OperatorDocumentUpload.tsx`**
- For the `truck_photos` slot only: hide the Upload button and hidden file input (lines 257-281)
- Replace the small text link (lines 286-294) with a prominent gold Button as the primary CTA for that row

**2. `src/components/operator/TruckPhotoGuideModal.tsx`**
- **Intro screen (step 0):** Move the Cancel/Start Guide buttons (lines 252-262) above the photo checklist (lines 236-250) so the CTA is visible without scrolling
- **Photo step file input (line 197-206):** Add `capture="environment"` to open the rear camera directly on mobile
- **Upload area text (line 332):** Change "Tap to choose photo" to "Tap to Take Photo"

### Files Modified
| File | Summary |
|------|---------|
| `src/components/operator/OperatorDocumentUpload.tsx` | Hide Upload button for truck_photos; promote guide link to gold Button |
| `src/components/operator/TruckPhotoGuideModal.tsx` | Add `capture="environment"`; reorder intro layout; update copy |

