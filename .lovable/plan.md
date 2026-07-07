## What the issue is

The Execute button is still failing at the final save step for the Equipment Asset Sheet signature. The screenshot now shows the fallback toast, which means the frontend caught a failure but did not receive a useful message to display.

I isolated the likely failure points to:
- `src/components/equipment/EquipmentAssetSheet.tsx` — uploads the signature, creates a signed URL, then directly updates `onboarding_status`.
- `src/pages/operator/OperatorPortal.tsx` — passes the driver `operatorId` and status into the sheet.
- `src/pages/staff/OperatorDetailPanel.tsx` — management dashboard reads the same saved signature fields.
- Backend triggers on `onboarding_status` — multiple `BEFORE UPDATE` triggers run in alphabetical order; one trigger stamps `eld_signature_signed_at`, and whitelist triggers then inspect changed columns.

I also checked PostgreSQL trigger behavior: multiple triggers for the same event fire alphabetically by trigger name, so direct table updates here are fragile because one trigger can mutate `NEW` before the whitelist trigger evaluates it.

## Do I know what the issue is?

Yes. The current implementation still relies on a client-side direct update to `onboarding_status`, which is being intercepted by several backend triggers/RLS rules. Even though the previous trigger allowlist was improved, the save path is still brittle and can fail with a generic client error. The reliable fix is to stop letting the mobile client perform this sensitive final update directly.

## Plan

1. **Add a dedicated backend save function for Equipment Asset Sheet signatures**
   - Create a `public.execute_equipment_asset_signature(...)` function.
   - It will accept `operator_id`, typed name, and signature image URL.
   - It will verify the signed-in user is either:
     - the driver assigned to that operator record, or
     - authorized staff/management.
   - It will update only:
     - `eld_signature_typed_name`
     - `eld_signature_image_url`
   - The existing signature lock trigger will continue applying `eld_signature_signed_at` automatically.
   - The function will return the saved signature fields so the app can immediately refresh the driver portal UI.

2. **Bypass the fragile operator whitelist only inside that function**
   - Use a transaction-local backend flag only inside the verified function call.
   - Update the whitelist triggers to allow this specific trusted signature-save path.
   - This keeps general driver updates restricted while making Execute reliable.

3. **Update `EquipmentAssetSheet.tsx` to use the function**
   - Keep the current signature image upload to `operator-documents`.
   - Explicitly check and display storage upload and signed URL errors.
   - Replace the direct `.from('onboarding_status').update(...)` with the new signature save function call.
   - On success, refresh status so the signature shows as locked/signed in the driver portal.

4. **Confirm management dashboard visibility**
   - No separate copy table is needed: management already renders `EquipmentAssetSheet` from the same `onboarding_status` fields.
   - Once the function saves successfully, management will see the same signed acknowledgment in the operator detail panel.

5. **Verify**
   - Confirm the backend function and trigger definitions are active.
   - Check linter output for issues introduced by this migration.
   - Re-check the component code path so the generic toast is replaced by step-specific errors if anything else fails.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>