## Plan

1. **Keep the signature visible immediately after signing**
   - Update the driver signing screen so it resolves and displays the saved signature image after the sheet changes to `signed`.
   - This prevents the signature area from looking like it disappeared right after tapping **Sign Assignment Sheet**.

2. **Harden the staff preview signature display**
   - Keep using the stored signature path, but add a clear loading/fallback state in the management **VIEW** modal so a missing/failed image is obvious instead of showing an empty signature box.
   - If the signed URL cannot be generated, show a small “Signature image unavailable” message while preserving the signer name and timestamp.

3. **Harden the driver My Documents preview the same way**
   - Apply the same display behavior to the signed assignment sheet preview inside the driver app.

4. **Verify the actual saved record**
   - Confirmed the latest Marcus/Mueller signed sheet has a saved signature path and a matching PNG object in backend storage.
   - After implementation, verify the frontend renders that stored PNG instead of a blank block.

## Technical details

- The saved row exists in `onboard_assignment_sheets` with `driver_signature_data_url` set to an `osas/...png` storage path.
- The storage object also exists in the `signatures` bucket with `image/png` metadata.
- The likely remaining issue is frontend rendering/state: after signing, the signing component switches to the “already signed” state without rendering the resolved image, and preview modals currently provide no fallback if the signed image source fails to load.