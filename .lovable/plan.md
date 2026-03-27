

## Fix: App Not Rendering in Preview

### Likely Cause

The recently added `react-filerobot-image-editor` and `pdfjs-dist` packages may be causing a build failure. These libraries have known compatibility issues with Vite/ESM builds — particularly `react-filerobot-image-editor` (beta version `5.0.0-beta.156`) and `pdfjs-dist` worker setup. A build error from any import crashes the entire app, not just the page using it.

### Fix

**1. Lazy-load `DocumentEditor` in `DocRow.tsx`**

Replace the static import:
```ts
import { DocumentEditor } from '@/components/shared/DocumentEditor';
```
with a dynamic `React.lazy()` import so it only loads when the editor is actually opened. This isolates the heavy/problematic dependencies from the rest of the app.

**2. Guard pdfjs-dist worker initialization in `DocumentEditor.tsx`**

Wrap the top-level `pdfjsLib.GlobalWorkerOptions.workerSrc` assignment in a try/catch or conditional check to prevent it from crashing at import time.

**3. If the build is still failing**, downgrade `react-filerobot-image-editor` from the beta to the stable `^4.8.1` version (the `filerobot-image-editor` core is already at 4.8.1), or use a simpler alternative like `react-easy-crop` (already in dependencies) combined with canvas-based brightness/filter utilities.

### Files changed
| File | Change |
|------|--------|
| `src/components/inspection/DocRow.tsx` | Lazy-load `DocumentEditor` |
| `src/components/shared/DocumentEditor.tsx` | Guard pdfjs worker init |

