## Plan

Fix the Onboard Systems Assignment Sheet signature so the drawn signature is captured reliably on mobile and displayed immediately after signing.

### What I confirmed
- The sheet row is being marked **signed** and has a saved signature path.
- A PNG object exists in backend storage for the signed sheet.
- The screenshot shows the app has a signed timestamp/name but the displayed image area is blank, which points to the captured canvas image being blank/transparent or not being restored correctly after the sign flow.

### Implementation steps
1. **Fix mobile signature canvas sizing**
   - Update the signing canvas to initialize with explicit pixel dimensions instead of relying only on CSS sizing.
   - Scale for device pixel ratio so touch drawing is captured accurately on phones.
   - Prevent page scrolling/touch gestures from interfering while drawing.

2. **Validate the captured image before upload**
   - Add a small client-side check that the exported canvas actually contains non-white/non-transparent pixels.
   - If the canvas export is blank, keep the driver on the signing screen and show a clear error instead of saving a signed sheet with an empty image.

3. **Improve post-sign display**
   - After upload, show the locally captured data URL immediately while the stored image URL is resolving.
   - Keep the existing stored-path display for management and driver document previews.

4. **Add a safe fallback for already affected sheets**
   - If a sheet is marked signed but its signature image is unavailable/blank, show a clear “Signature needs to be re-signed” state instead of an empty white box.
   - Allow the driver to re-sign that sheet so the bad signature can be replaced without staff deleting/recreating the assignment sheet.

5. **Verify**
   - Use the live preview to confirm the signature drawing remains visible after tapping **Sign Assignment Sheet** and that the management preview displays the same signature.