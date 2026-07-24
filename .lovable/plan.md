Current verified state
- OSAS core is built and wired: `onboard_assignment_sheets` / `onboard_assignment_sheet_items` tables, staff Assignment Sheets tab in Equipment Inventory, driver `OperatorOSASSign` signing view, `PendingOSASCard` dashboard prompt, `send-osas-to-operator` edge function, and `notify_staff_on_osas_signed` trigger.
- The legacy `EquipmentAssetSheet` component still imports `SignatureCanvas` and contains the `handleExecute` handler that calls the dropped `execute_equipment_asset_signature` RPC. It is still rendered in both the staff Operator Detail panel and the driver portal.
- The dead signature path will fail at runtime if a user tries to sign there, and the competing UI may confuse drivers.

Plan to finish the build
1. Remove dead signature code from `EquipmentAssetSheet.tsx`
   - Delete `SignatureCanvas` import, `sigRef`, `typedName`, `hasDrawn`, `signing`, and `handleExecute`.
   - Remove or simplify the "Owner Operator Equipment Receipt Acknowledgment" block to show only the OSAS notice when unsigned.
   - Preserve the assignment-status, serial verification, delivery-method, and shipping-receipt sections that staff still need.

2. Rename user-facing labels from "Equipment Asset Sheet" to "Onboard Systems Assignment Sheet (OSAS)"
   - Card title and header in `EquipmentAssetSheet.tsx`.
   - Return-instructions email dialog copy.
   - Any remaining tooltips or empty-state text in the component.

3. Retire the legacy card from the driver portal
   - Remove the `<EquipmentAssetSheet mode="driver" ... />` block from `OperatorPortal.tsx`.
   - Remove the `equipment-asset-sheet-anchor` scroll target and its `getElementById` reference.
   - The `PendingOSASCard` + `OperatorOSASSign` view already replaces the driver signing flow.

4. Keep the staff-side card in `OperatorDetailPanel.tsx`
   - Staff still use it to set assignment status, verify serials, record delivery method, and upload/view outbound and return shipping receipts.

5. Verify the end-to-end flow
   - Run typecheck and confirm no unused imports or broken refs.
   - Open the preview and test: staff creates a sheet → sends to driver → driver signs via the dashboard card → staff receives the `osas_signed` notification.

Decision needed
- Option A (recommended): Remove the legacy card from the driver portal entirely and rely on the new OSAS card/view.
- Option B: Keep the old card as a read-only "Assignment & Receipts" summary for drivers.

Please approve Option A or let me know if you prefer Option B, then I will execute the cleanup.