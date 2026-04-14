

## Replace Crop UX with Edge-Draggable Trim Handles

### Problem
The current editor uses `react-easy-crop`, which works by letting you pan/zoom an image behind a fixed crop window. This is the wrong UX for document trimming — users need to see the full document and drag lines inward from each edge to trim off margins, shadows, and extra space. The image also overflows the editor area because it's not sized to fit.

### Solution
Replace `react-easy-crop` with `react-image-crop` — a library that renders the full image and overlays a resizable crop rectangle with draggable edges and corners. This matches exactly what you described: drag a line along each of the four sides to trim.

### What changes

**File: `package.json`**
- Remove `react-easy-crop`
- Add `react-image-crop`

**File: `src/components/shared/DocumentEditor.tsx`**
- Replace `Cropper` from `react-easy-crop` with `ReactCrop` from `react-image-crop`
- Import `react-image-crop/dist/ReactCrop.css` for styling
- Show the full image inside the editor (object-fit contain) with a resizable crop overlay
- The crop rectangle starts at the full image bounds; user drags any edge inward to trim
- Rotation still handled via canvas transforms before the crop step
- Update `getCroppedImage` to use the pixel crop from `react-image-crop`'s output format
- Keep all existing save/upload logic intact

### UX after the fix
1. Open editor → full document visible, crop handles on all four edges and corners
2. Drag any edge inward to trim off unwanted margins/shadows
3. Rotate left/right, zoom as needed
4. Save → trimmed image uploaded back to storage

### Files modified
| File | Change |
|------|--------|
| `package.json` | Swap `react-easy-crop` → `react-image-crop` |
| `src/components/shared/DocumentEditor.tsx` | Replace cropper component and adapt crop logic |

