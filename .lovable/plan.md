## Plan

1. **Fix the backend permission trigger causing the banner**
   - The screenshot error is coming from the legacy `onboarding_status` operator update trigger, not the UI.
   - I’ll add a migration that updates the trigger logic so driver-owned updates can save the Equipment Asset Sheet signature fields without being rejected.
   - The allowed driver fields will remain narrow: decal photos, truck photos, ICA completion status, and the equipment asset sheet signature fields.

2. **Keep the signature write path as-is**
   - The app already uploads the signature image and then writes `eld_signature_typed_name` / `eld_signature_image_url`.
   - The backend trigger will continue stamping `eld_signature_signed_at` automatically so the signed date is server-controlled.

3. **Ensure it appears in both places**
   - The driver portal and management dashboard both read from the same `onboarding_status` signature fields through `EquipmentAssetSheet`, so once the update succeeds the signed copy will show in both views after refresh.

4. **Verify after implementation**
   - Run the backend linter/check if available.
   - Confirm the current conflicting trigger is replaced and the old rejection message can no longer block this signature-only update.