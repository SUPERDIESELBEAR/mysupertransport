## Reset Emma Mueller's Equipment Asset Sheet only

Target operator: Emma Mueller (`c49e2427-11cf-4765-a48b-36b28cd150a2`). No other drivers, no other Emma data.

**Confirmed current state:**
- 4 active `equipment_assignments` (ELD, dash cam, BestPass, fuel card), none returned
- 0 `equipment_receipts`
- Asset Sheet fields present on her `onboarding_status` row

**Actions (single insert-tool call, three statements):**

1. `DELETE FROM equipment_assignments WHERE operator_id = <Emma>` — removes her 4 assignments; the shared `equipment_items` return to `available` inventory (items themselves are not deleted).
2. `DELETE FROM equipment_receipts WHERE operator_id = <Emma>` — no-op today, included for safety in case a receipt is added before this runs.
3. `UPDATE onboarding_status` for Emma, nulling only Asset Sheet fields:
   - Verification: `eld_verified_at/by`, `dash_cam_verified_at/by`, `bestpass_verified_at/by`, `fuel_card_verified_at/by`
   - Driver signature: `eld_signature_typed_name`, `eld_signature_image_url`, `eld_signature_signed_at`
   - Return flow: `eld_/dash_cam_/bestpass_/fuel_card_/decal_awaiting_return_shipment` → false; `return_instructions_sent_at/by`, `equipment_return_completed_at`, `equipment_return_date`, `equipment_return_notes` → null

**Not touched:** application, profile, driver docs, ICA, pay setup, truck/plate, dispatch, PEI, notifications, or any other driver.

Part 2 (demo-account design) is paused per your instruction.

Switch to build mode to run this.
