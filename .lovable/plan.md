# Onboard Systems Assignment Sheet (OSAS) — Phased Build Plan

## Phase 0 — Already done: Database foundation

- Created `onboard_assignment_sheets` (one row per sign-off sheet) and `onboard_assignment_sheet_items` (line items per device).
- Added RLS policies: staff full control; operators can view/sign their own.
- Dropped the legacy `execute_equipment_asset_signature` function.

## Phase 1 — Backfill existing serials into inventory

Goal: make sure every serial that currently lives in free-text onboarding fields also exists in `equipment_items`/`equipment_assignments`, so removing the text fields later is safe.

- One-time migration that iterates `onboarding_status` rows with non-empty `eld_serial_number`, `dash_cam_number`, or `bestpass_number`.
- For each value, normalize the serial, create an `equipment_items` row if it doesn't exist, and create an active `equipment_assignments` row if the operator doesn't already have one for that device type.
- Skip anything already synced — this is a no-op safety pass.

## Phase 2 — Staff side: Onboard Systems Assignment Sheet

In the **Onboard Systems** menu:

- Add an **"Assignment Sheets"** tab/section.
- Add a **"Create Sign-off Sheet"** button that opens a modal.
- Build the `CreateSignOffSheetModal`:
  - Searchable driver dropdown.
  - Auto-populate read-only: Name, Unit #, Phone, Email, Truck details.
  - Assignment date picker (default today).
  - **ELD** dropdown: available ELD items from inventory.
  - **Dash Camera** dropdown: available dash cam items.
  - **BestPass** toggle: "Issue transponder (+$60.00)"; when enabled, dropdown of available BestPass items.
  - Built-in terms including $1,000 unreturned ELD charge and additional license-plate/equipment charges.
  - Save Draft or Send to Operator.
- Add an **Assignment Sheets table** showing Driver, Unit, Status, Date, Signed PDF link.
- Move the existing **Outbound Shipment Receipts** section to the bottom of the Onboard Systems page and default it collapsed.
- Create edge function `send-osas-to-operator`:
  - Validates the sheet, flips items to `assigned`, creates `equipment_assignments`, enqueues an app email with a deep link to the driver app.
- Add React transactional email template for the OSAS invite.

## Phase 3 — Driver side: review and sign

- Add a new **"My Onboard Systems"** page in the driver sidebar/app.
- Build the `OperatorSignOffSheetView`:
  - Shows read-only driver, truck, device, and terms details.
  - Driver checks an acknowledgment per device confirming serial numbers match.
  - Signature capture using the existing ICA signature component.
- On signature:
  - Mark sheet `signed`, store signature data URL/name/IP/timestamp.
  - Call `finalize-osas-signature` edge function to generate a branded PDF, save to `operator-documents`, and file in the driver hub.
- Same page also shows:
  - Signed OSAS copy.
  - Equipment Return section (return instructions, receipt upload).

## Phase 4 — Cleanup and remove old workflow

- Remove the old **Equipment Asset Sheet** section from the operator detail panel.
- Remove the serial-number input fields from:
  - Truck Details / Assigned Device Numbers on the operator detail panel.
  - Onboarding stage forms that accept `eld_serial_number`, `dash_cam_number`, `bestpass_number` as free text.
- Replace those inputs with read-only display of currently assigned serials from inventory.
- Delete the old `EquipmentAssetSheet.tsx` component.
- Remove the old `equipment_asset_sheet_ready_notified_at` column and related notification trigger from `onboarding_status`.
- Update `src/lib/staffHelp/help-index.ts` with new Onboard Systems / OSAS entries.
- Rename visible labels from "Equipment Asset Sheet" to "Onboard Systems Assignment Sheet".

## Open question resolved

**BestPass $60 fee:** display only on the sheet (no payroll deduction or auto-invoicing).
**Send minimum:** at least one device (ELD, dash cam, or BestPass) must be selected before sending.
**Existing sheets:** delete old sheets and run a backfill migration.
**Bulk backfill for already-onboarded operators:** deferred to a follow-up after the single-driver flow is proven.

## Suggested schedule

Build one phase at a time, then pause for testing before moving to the next. This keeps risk low and lets staff confirm the inventory data is intact before the driver-side flow goes live.