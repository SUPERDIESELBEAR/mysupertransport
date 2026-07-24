# Onboard Systems Assignment Sheet (OSAS) — Rebuild Plan

Rework the current Equipment Asset Sheet into a standalone document generator that lives inside **Onboard Systems**, pulls all serials from inventory, and is sent to the driver for review + signature.

---

## 1. Rename & relocate

- Rename **Equipment Asset Sheet → Onboard Systems Assignment Sheet (OSAS)** everywhere (staff UI, driver UI, emails, help index, notifications).
- Remove the current OSAS section from the operator detail panel (Stage-side placement).
- Add a new **"Assignment Sheets"** tab/section inside the **Onboard Systems** menu with:
  - Primary action button: **"Create Sign-off Sheet"**.
  - Table of existing sheets (driver, unit, status: Draft / Sent / Signed, created date, signed date, PDF link).

## 2. Scope reduction

- Only three devices tracked on OSAS: **ELD Unit, Dash Camera, BestPass** (BestPass optional).
- Remove Fuel Card and any other device rows from OSAS (fuel cards remain managed in Onboard Systems inventory, just not on this sheet).
- **Remove the "Verified by staff" checkbox** and its signature gate.
- **Remove the "Return Shipment Receipts" section** entirely from the OSAS.

## 3. Inventory as the single source of truth for serials

- Remove all serial-number **input fields** from:
  - Truck Details / Assigned Device Numbers on the operator detail panel.
  - Any onboarding stage forms that currently accept `eld_serial_number`, `dash_cam_number`, `bestpass_number` as free text.
- Replace with **read-only display** of the serial(s) currently assigned via `equipment_assignments` (source: Onboard Systems).
- All new serial numbers must be added in **Onboard Systems → Add Device** first, then selected on the OSAS via dropdown of `status='available'` items filtered by device type.

## 4. Create Sign-off Sheet flow (staff)

Modal / drawer opened from the "Create Sign-off Sheet" button:

1. **Driver dropdown** — searchable list of active operators.
2. Auto-populate (read-only):
   - Name, Unit #, Phone, Email
   - Truck details (Year, Make, VIN, Plate, State, Trailer #)
3. **Assignment date** picker (defaults to today).
4. **ELD Unit** — dropdown of available ELDs from inventory.
5. **Dash Camera** — dropdown of available dash cams.
6. **BestPass (optional)** — toggle "Issue BestPass transponder (+$60.00)"; when on, dropdown of available BestPass units.
7. Standard OSAS terms are auto-rendered, including:
   - "Unreturned ELD equipment will be assessed a **$1,000.00** replacement charge."
   - "Additional charges may be incurred for unreturned license plates or other issued equipment."
   - BestPass transponder fee ($60.00) shown as a line item when selected.
8. **Save Draft** or **Send to Operator**.

Sending marks the sheet `sent`, creates matching `equipment_assignments` rows (flipping inventory items to `assigned`), and emails the operator a link that deep-links into the SUPERDRIVE app.

## 5. Driver review & signature flow

- In-app OSAS view under a new **"Onboard Systems"** entry in the driver sidebar (also linkable from the email).
- Driver sees populated details, serial numbers, terms, and BestPass line if any.
- Driver **confirms serial numbers match** the physical devices (single acknowledgment checkbox per device) and signs.
- On signature: sheet status → `signed`, signed PDF generated and saved to `operator-documents` (bucket already exists) and displayed under Onboard Systems for both staff and driver.

## 6. Driver-side equipment center

New driver-side page under the sidebar (working title **"My Onboard Systems"**) containing:
- Signed OSAS (view / download).
- **Equipment Return (Management)** section — return instructions, upload receipt (existing `equipment_receipts` logic reused).
- Staff can trigger **Send Return Instructions** email to the driver from the staff OSAS view.

## 7. Outbound Shipment Receipts (staff)

- Move the existing **Outbound Shipment Receipts** section to the **bottom** of the Onboard Systems page and default it **collapsed** (rarely used since equipment is typically installed on-site at orientation).

## 8. Suggested additional improvements

- **Version history** for OSAS (so re-issued sheets — e.g. after a device swap — are audit-tracked).
- **Auto-revoke on deactivation**: when a driver is deactivated, prompt staff to generate a **Return OSAS** listing all currently assigned devices with return deadlines.
- **PDF export** with SUPERTRANSPORT branding for both signed OSAS and return receipts.
- **Signed OSAS auto-filed** to Driver Hub → Documents alongside the ICA.
- **Reminder cadence**: if an OSAS sits `sent` unsigned for 3 days, auto-remind the driver.

---

## Technical notes

**New table** `onboard_assignment_sheets`
- `id`, `operator_id`, `unit_number`, `assignment_date`, `status` (`draft|sent|signed|void`), `sent_at`, `signed_at`, `signed_pdf_url`, `bestpass_fee_cents` (nullable), `terms_version`, `created_by`, timestamps.
- Standard GRANTs + RLS: staff full access, operator select/update-signature-only on own rows.

**New table** `onboard_assignment_sheet_items`
- `id`, `sheet_id`, `device_type` (`eld|dash_cam|bestpass`), `equipment_id` FK → `equipment_items`, `serial_snapshot`, `driver_confirmed_at`.

**Reuse:**
- `equipment_items` / `equipment_assignments` (assignment created on send).
- `equipment_receipts` for return uploads.
- `operator-documents` bucket for signed PDFs.
- Existing signature capture component from ICA flow.

**Edge functions:**
- `send-osas-to-operator` — enqueues app email with deep link.
- `finalize-osas-signature` — generates PDF, saves to storage, files under Driver Hub.
- `send-osas-return-instructions` — reuses existing `equipment-return-instructions` template.

**Files to edit (major):**
- `src/components/equipment/EquipmentAssetSheet.tsx` → delete/replace.
- `src/components/equipment/EquipmentInventory.tsx` → add "Assignment Sheets" tab, "Create Sign-off Sheet" button, collapsed Outbound Receipts.
- `src/pages/staff/OperatorDetailPanel.tsx` → remove serial inputs + old asset-sheet section, replace with read-only summary linking to OSAS.
- `src/pages/operator/OperatorPortal.tsx` → add "My Onboard Systems" route/section.
- `src/lib/staffHelp/help-index.ts` → update entries.
- Migrations for the two new tables + RLS + GRANTs.

---

## Open questions before I build

1. **BestPass fee ($60):** is that a one-time charge invoiced separately, or should it be recorded as a payroll deduction automatically?
2. **Existing signed asset sheets** (Emma Mueller etc.): archive as-is, or migrate into the new `onboard_assignment_sheets` table?
3. **ELD/Dash Cam required** to send a sheet? (I'll assume yes — BestPass optional — unless you say otherwise.)
