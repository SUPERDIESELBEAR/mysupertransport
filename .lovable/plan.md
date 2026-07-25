## Plan

Fix the Onboard Systems Assignment Sheet signature area so it renders as a normal, bounded signing box on mobile and reliably captures the drawn signature.

### What I confirmed
- The screenshot shows the signature canvas itself is failing to render correctly on mobile: the browser displays a broken-image/frowning icon inside the signing area.
- The OSAS signing screen currently uses `react-signature-canvas` without explicit `width`/`height` attributes on the rendered canvas, then resizes it after mount.
- The current resize code clears the canvas when resizing and relies on a fixed `SIGNATURE_HEIGHT = 144`, but the mobile screenshot shows the visible signing block expanding far beyond that intended height.
- No signature-related console or network errors were present in the available preview logs, so this is most likely a client-side canvas layout/rendering issue rather than a failed upload request.

### Implementation steps
1. **Replace fragile canvas sizing with stable dimensions**
   - Give the signature host an explicit, responsive, fixed-height box.
   - Pass explicit canvas `width` and `height` props to `SignatureCanvas` from React state instead of relying on a post-render resize only.
   - Keep the drawing surface from stretching vertically down the page on mobile.

2. **Make mobile drawing reliable**
   - Use the host width and device pixel ratio to size the backing canvas correctly.
   - Prevent touch scrolling/gestures inside the signing box while still allowing normal page scroll outside it.
   - Avoid clearing the canvas after a user has already started drawing unless they tap Clear.

3. **Remove the broken canvas/frowning icon state**
   - Ensure the canvas element always mounts with valid pixel dimensions.
   - Add a clean fallback/loading state only while dimensions are being measured, so mobile browsers do not render a broken placeholder.

4. **Preserve blank-signature protection**
   - Keep the existing visible-ink validation before upload.
   - If no ink is captured, keep the driver on the signing screen and prompt them to sign again.

5. **Verify on a mobile viewport**
   - Load the driver-facing Onboard Systems signature screen in a mobile-sized browser viewport.
   - Confirm the signature box is bounded, no frowning icon appears, drawing can occur, and the Sign button only enables after input is captured.