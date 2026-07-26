## Problem

While drawing on the Onboard Systems Assignment Sheet signature pad, the ink renders tiny in the top-left corner. Once saved, the stored image looks correct.

Cause (as coded in `src/components/operator/OperatorOSASSign.tsx`): the canvas backing store is sized to `cssWidth * devicePixelRatio` while the CSS box stays at `cssWidth`, and the compensating `ctx.setTransform(ratio, ...)` is applied in an effect that runs before `signaturePad.clear()` and before the library's own internal resize/context handling. When that transform is not in force, strokes are drawn in CSS-pixel coordinates into a backing store `ratio` times larger, so the visible stroke is scaled down by `1/ratio` and anchored at the top-left.

## Fix

In `src/components/operator/OperatorOSASSign.tsx`:

1. Remove the manual high-DPI scheme: stop computing `pixelWidth`/`pixelHeight`/`ratio` for the canvas attributes and stop calling `ctx.setTransform(...)`.
2. Size the canvas element with `width`/`height` attributes equal to the measured CSS size (`cssWidth` x 144), and keep the matching inline CSS width/height so backing store and display size agree 1:1. This guarantees pointer coordinates and rendered ink match exactly.
3. Keep the existing `ResizeObserver` + `measureSignatureCanvas` logic (with the "don't resize while ink exists" guard) and keep `clearOnResize={false}`, so the pad still fills its container and never mounts with zero dimensions.
4. Keep the clear-on-resize effect but reduce it to `signaturePad.clear(); setHasDrawn(false);` — no transform manipulation.
5. Leave the ink-detection helpers (`canvasHasVisibleInk`, `getSignatureDataUrl`) and the rest of the sign/upload flow untouched.

Trade-off: on high-DPI phones the saved PNG is 1x rather than 2x/3x, so it is slightly less crisp when blown up — but it is drawn and stored at the correct scale and position, which is what is broken today. Signature images are displayed small (max-h-24 / preview blocks), so the resolution loss is not visible.

## Verification

Run a Playwright pointer-drag over the signature box at a mobile viewport with `deviceScaleFactor: 2` and screenshot the canvas element to confirm the stroke follows the finger at full size instead of shrinking into the corner.
