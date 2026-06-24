## Goal
When a driver clicks **Open QPassport** in the email, they should land on the app page and see **their own signed QPassport** displayed as a static image, while the file also downloads to their device.

## Plan
1. **Change the viewer from PDF iframe to static image rendering**
   - Update `/qpassport/view` so it fetches the token-protected QPassport file.
   - Convert the first PDF page to a rendered image using the existing `pdfjs-dist` dependency.
   - Display that rendered image directly on the page instead of relying on the browser PDF viewer/iframe.
   - If the stored QPassport is already an image, display it directly.

2. **Keep the token tied to the specific driver**
   - Preserve the existing signed-token flow: the email link includes a token minted for one operator/driver.
   - The backend endpoint continues resolving that token to that operator’s `qpassport_url`, so Emma’s email opens Emma’s QPassport and another driver’s email opens theirs.

3. **Make download reliable**
   - Keep the blob-based download flow from the app page.
   - Trigger auto-download on page load where the browser allows it.
   - Keep a visible **Download** button as the guaranteed fallback, especially for phones/browsers that block automatic downloads unless the user taps.

4. **Avoid accidental wrong file types**
   - Update the backend response to preserve the stored file’s content type when possible instead of forcing everything to `application/pdf`.
   - Use a safe download filename such as `QPassport.pdf` for PDFs and `QPassport.png/jpg` for image files.

5. **Verify with Emma Mueller**
   - Re-send the test email using `operator_email: emmafmueller@gmail.com`.
   - Confirm the email link routes to `/qpassport/view?token=...`.
   - Confirm the page renders a static preview and offers/downloads the same driver-specific file.

## Notes
- On desktop browsers, auto-download should usually fire after the page loads.
- On iPhone/Android, browsers may block automatic downloads; the page will still show the QPassport immediately and the **Download** button will work as the user-initiated action.
- No database schema or auth changes are needed.