## Findings

Emma Mueller’s Equipment Asset Sheet is still locked because her `onboarding_status` row still has the signature fields populated:

- `eld_signature_typed_name = Emma Mueller`
- `eld_signature_image_url = .../equipment-asset-sheet/signature-...png`
- `eld_signature_signed_at = 2026-07-07...`

The UI uses `eld_signature_signed_at` as the lock flag, so even though equipment assignments and receipts are already cleared, the sheet remains locked.

## Plan

1. **Clear only Emma Mueller’s Equipment Asset Sheet completion/lock fields**
   - Set `eld_signature_typed_name`, `eld_signature_image_url`, and `eld_signature_signed_at` to `NULL` for Emma’s `onboarding_status` row only.
   - Also clear the asset-sheet verification stamps and return-instruction fields if any remain populated.

2. **Keep all non-asset-sheet driver data intact**
   - Do not touch Emma’s application, account, Go Live date, onboarding stage data outside the asset sheet, driver hub records, documents, or profile.
   - Do not delete equipment inventory items; leave inventory records intact.

3. **Verify after reset**
   - Re-query Emma’s `onboarding_status`, `equipment_assignments`, and `equipment_receipts` to confirm:
     - signature lock fields are empty,
     - no active equipment assignments remain,
     - no asset-sheet receipts remain.

4. **Optional code follow-up after the immediate reset**
   - Add a dedicated management-side “Reset Equipment Asset Sheet” action later so this can be done safely without manual database intervention.
   - The reset should use a backend function, require typed confirmation like `000`, and write an audit log.