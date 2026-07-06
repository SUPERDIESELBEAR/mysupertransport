# Equipment Asset Sheet — v2 Refinements

Five targeted changes to `src/components/equipment/EquipmentAssetSheet.tsx` and the `equipment_receipts` schema. No new components; the sheet stays a single shared file rendered in driver and management modes.

## 1. Consolidated Shipment Receipts

Remove per-item Carrier / Tracking # / Upload Receipt UI from each `EquipmentLineRow`. Replace with two shipment-level blocks on the sheet:

- **Outbound Shipment Receipts** — rendered at the top of the sheet, above the equipment list.
- **Return Shipment Receipts** — rendered alongside the Equipment Return (Management) block near the bottom.

Each block shows:
- A form row with Carrier dropdown, Tracking # input, file picker, and Save button.
- A stacked list of previously uploaded receipts (Carrier · Tracking # · uploader label · date · file thumbnail/link opening `FilePreviewModal`).
- An **Add Another Receipt** button that reveals a fresh empty form row so multiple receipts stack without overwriting.

Data model: `equipment_receipts.equipment_line` becomes nullable (a shipment covers the whole box, not a single line). Existing rows are preserved; new consolidated uploads write `equipment_line = null`. The per-line list in the timeline groups nulls under "Shipment".

## 2. Carrier Dropdown

Replace the free-text Carrier input with a shadcn `Select`:
1. UPS
2. USPS
3. FedEx
4. Other → reveals an inline free-text field, stored in `carrier` as the typed value.

Applies to both outbound and return receipt forms.

## 3. Delivery Method per Equipment Item

Replace the two shipped/awaiting checkboxes on each `EquipmentLineRow` with a single mutually-exclusive selector (segmented control / radio group) with options:

- Shipped to Driver
- Installed at Orientation
- Installed On Site
- Awaiting Return Shipment
- Not Assigned (mirrors the existing assignment status — selecting this here also flips the row's assignment_state to `not_assigned`)

Stored in a new `onboarding_status.<line>_delivery_method` text column per line (enum-like: `shipped`, `orientation`, `on_site`, `awaiting_return`, `not_assigned`). Existing boolean flags are migrated: rows with `_shipped_to_driver = true` → `shipped`; `_awaiting_return_shipment = true` → `awaiting_return`; else `null`.

## 4. Driver Acknowledgment Signature Block (build-out)

The placeholder ("Waiting on the driver to sign") already exists in driver mode with a signature canvas. Verify and finalize:
- Typed full name input + signature canvas + Execute button (already wired to `handleExecute`).
- Server timestamp: `eld_signature_signed_at` is stamped by the existing trigger from `now()` — client never sends it. Confirmed present from prior migration.
- After execute: name, signature image, and date are permanently displayed and locked. All equipment serial inputs and delivery method selectors flip to read-only for both driver and management (already gated by `signed` — extend gate to cover the new delivery-method selector).
- Errors surface only as friendly toasts; raw Supabase errors stay in `console.error`.

Also mount the same block in management mode as read-only once signed (currently only rendered "Waiting on the driver to sign" for management pre-signature — keep that copy).

## 5. Driver-Side Return Receipt Upload

The Return Shipment Receipts block becomes visible in the driver's SUPERDRIVE portal when **any** equipment line has `delivery_method = 'awaiting_return'`. Driver can then upload return receipts (Carrier + Tracking + file), stacked identically to management uploads. `uploader_role` is stamped `driver`.

The Outbound Shipment Receipts block remains read-only for the driver — they view uploaded outbound receipts but cannot create them.

## Technical Details

### Migration
- `ALTER TABLE public.equipment_receipts ALTER COLUMN equipment_line DROP NOT NULL;`
- `ALTER TABLE public.onboarding_status ADD COLUMN eld_delivery_method text, ADD COLUMN dash_cam_delivery_method text, ADD COLUMN bestpass_delivery_method text, ADD COLUMN fuel_card_delivery_method text, ADD COLUMN decal_delivery_method text;`
- Backfill from existing `_shipped_to_driver` / `_awaiting_return_shipment` booleans.
- Extend the `onboarding_status` column-whitelist trigger to allow driver-side updates only via the sheet path (already whitelisted for existing sheet columns — add the five new `_delivery_method` columns).
- Extend RLS on `equipment_receipts`: driver INSERT allowed when `direction = 'return'` AND the operator has at least one line with `_delivery_method = 'awaiting_return'` (checked via a SECURITY DEFINER helper `public.operator_awaiting_return(_operator_id uuid)`).

### File changes
- `src/components/equipment/EquipmentAssetSheet.tsx` — new `<ShipmentReceiptsBlock direction="inbound|return" />` sub-component rendered twice; strip receipt/carrier/tracking props from `EquipmentLineRow`; add `<DeliveryMethodSelector />` per line; extend `uploadReceipt` to accept `line: EquipmentLine | null`.
- No new files.

### Verification
1. Confirm ELD/Dash Cam/BestPass/Fuel Card/Decal rows no longer show Carrier, Tracking, or Upload controls.
2. Add two outbound receipts via "Add Another Receipt" — both persist and list separately.
3. Carrier dropdown order UPS → USPS → FedEx → Other; picking Other reveals a text input that saves as the carrier value.
4. Toggle delivery method on two lines; confirm only one option can be active per line and Not Assigned clears serials.
5. As a test driver, complete signature; verify `eld_signature_signed_at` is server-stamped and delivery method + serials go read-only for both driver and management.
6. Flip one line to Awaiting Return Shipment; log in as the driver and confirm the Return Shipment Receipts block appears and accepts an upload tagged `Driver`.
7. Confirm no raw DB error text is ever shown; forced failure (e.g., disable network) surfaces the friendly toast only.
