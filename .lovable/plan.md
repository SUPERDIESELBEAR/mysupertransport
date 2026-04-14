

## Fix: Document Editor White Screen Crash

### Root Cause (reproduced)
Clicking the edit pencil on Bobby Thompson's CDL produces a completely white screen. The `DocumentEditor` component crashes on mount, and since there is no React Error Boundary anywhere in the component tree, the crash destroys the entire app. The user must refresh the browser to recover.

The crash is caused by the third-party crop library failing at runtime. This project has gone through three crop libraries (`react-filerobot-image-editor`, `react-easy-crop`, `react-image-crop`) and all have failed. The dependency-based approach is unreliable.

### Solution: Build a zero-dependency crop editor + add error boundary

**1. Rewrite `DocumentEditor.tsx` with native canvas + mouse events (no crop library)**
- Remove all imports of `react-image-crop`
- Build the crop overlay entirely with HTML/CSS/mouse events:
  - Render the image in a container with `object-fit: contain`
  - Draw a crop rectangle overlay using a `div` with border handles on all four sides and corners
  - Track mouse/touch drag on each handle to resize the crop area
  - Semi-transparent overlay outside the crop area (like the standard crop UX)
- Keep the existing rotation (canvas bake), save, and Supabase upload logic unchanged
- This approach has zero external dependencies and cannot break due to package incompatibility

**2. Add an Error Boundary wrapper around every `DocumentEditor` mount point**
- Create a small `EditorErrorBoundary` class component that catches render errors
- Shows a "Something went wrong — Close" fallback instead of a white screen
- Wrap the `Suspense` + `DocumentEditor` in this boundary in:
  - `DocRow.tsx` (FilePreviewModal editor, PDFModal editor, AdminDocRow editor)
  - `ApplicationReviewDrawer.tsx`
  - `OperatorDetailPanel.tsx`
- This ensures even if the editor somehow crashes in the future, the app never locks up

**3. Remove unused crop dependencies from `package.json`**
- Remove `react-easy-crop`
- Remove `react-image-crop`
- Remove `react-konva` (leftover from filerobot)

### Files changed
| File | Change |
|------|--------|
| `src/components/shared/DocumentEditor.tsx` | Replace `react-image-crop` with native canvas/mouse crop UI |
| `src/components/shared/EditorErrorBoundary.tsx` | New error boundary component |
| `src/components/inspection/DocRow.tsx` | Wrap editor mounts in error boundary |
| `src/components/management/ApplicationReviewDrawer.tsx` | Wrap editor mount in error boundary |
| `src/pages/staff/OperatorDetailPanel.tsx` | Wrap editor mounts in error boundary |
| `package.json` | Remove `react-easy-crop`, `react-image-crop`, `react-konva` |

### Expected result
- Clicking the pencil opens a working editor with draggable trim handles on all sides
- If anything goes wrong, a fallback UI with a Close button appears instead of a white screen
- No third-party crop library dependencies that can break

