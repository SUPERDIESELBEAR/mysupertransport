# Equipment Asset Sheet — Signature, Status, Return & Shipping Receipts

## Recommendation on where it lives

There is no "Equipment Asset Sheet" screen today. The closest surface is the shared **Truck & Equipment card** (`TruckInfoCard`) — which already renders on both the management operator detail and the driver's SUPERDRIVE portal. I recommend building the Asset Sheet as **one component** that mounts in **two places**:

1. **Driver (SUPERDRIVE portal)** — inside `OperatorPortal`, right below the existing Truck & Equipment card. Driver sees their equipment list, signs once, and (only when applicable) uploads a shipping receipt.
2. **Management (Staff Operator Detail Panel)** — inside `OperatorDetailPanel`, replacing the read-only device grid on `TruckInfoCard` with the same Asset Sheet in "management mode" (edit status, edit serials, log return date, upload receipts, view the signed block).

Same data, one source of truth, role-gated controls.

## Scope

### Part 1 — ELD electronic signature (one per driver)

- New driver signature block on the Asset Sheet, mirroring `OperatorICASign` (typed name + finger-drawn signature canvas + Execute button).
- Executed date is stamped by a Postgres trigger from `now()` (server time), never from the client.
- Once signed: typed name, signature image URL, and signed timestamp are read-only for everyone (driver + management). All equipment rows in the ELD section lock to read-only.
- Signature image uploaded to `operator-documents` bucket under `equipment-asset-sheet/{operator_id}/signature-{timestamp}.png` via the existing pattern.
- Friendly error handling: wrap the save in try/catch; on failure show a toast "Couldn't save your signature. Please try again." — raw Supabase error text is only logged to console, never surfaced to the driver. Uses the same column-whitelist trigger pattern the ICA flow settled on.

### Part 2 — Per-equipment assignment status (all equipment types)

For each equipment line (ELD, Dash Cam, BestPass, Fuel Card, Decal, etc.) management picks one of:

- **Assigned Prior to Onboarding** — serial/number fields editable now, saved to `onboarding_status`.
- **Assigned During Onboarding** — same, tagged with a different status.
- **Not Assigned** — row stays visible, fields blank + greyed, badge "Not Assigned".

Management can switch between the three states any time **before** the driver signs. After signature, all rows lock. Status + serial edits save immediately (existing `TruckInfoCardEditPayload` save path is extended).

### Part 3 — Equipment return date (management only)

Below the signature block, a management-only section with:

- `Equipment Return Date` date picker (shadcn Datepicker with `pointer-events-auto`).
- Optional notes textarea.
- Saves to `onboarding_status.equipment_return_date` + `equipment_return_notes`.
- Hidden from the driver's view entirely. Visible in Driver Hub / Onboarding History.

### Part 4 — Shipping receipt uploads (management + driver)

- Upload field labeled "Shipping Receipt" accepting image + PDF (uses `validateFile`).
- Optional carrier dropdown + tracking number input alongside upload.
- **Management** can always upload (inbound or return shipments) per equipment line.
- **Driver auto-visibility rule:** the driver only sees the upload for a given equipment line **when management has flagged that line as shipped** (carrier + tracking present OR management toggled a "Shipped to driver" checkbox on that row). When that condition is not met, the block is hidden from the driver. On the driver's departure flow (equipment return), management can toggle "Awaiting return shipment" on the row which re-exposes the upload to the driver for a return receipt.
- Each receipt entry stored long-term as its own row in a new `equipment_receipts` table with: `operator_id`, `equipment_line` (eld/dash_cam/bestpass/fuel_card/decal), `direction` (inbound/return), `carrier`, `tracking_number`, `file_url`, `uploaded_by` (user id), `uploader_role` (management/driver), `uploaded_at`.
- Timeline display on the Asset Sheet and in Driver Hub / Onboarding History shows: upload date, uploader label ("Management — Jane D." vs "Driver"), carrier + tracking (if entered), and a thumbnail (images) or file icon (PDFs) that opens `FilePreviewModal`.

## Data model

New / changed columns on `onboarding_status`:
- `eld_signature_typed_name text`
- `eld_signature_image_url text`
- `eld_signature_signed_at timestamptz` (set only by trigger from `now()`)
- `equipment_return_date date`
- `equipment_return_notes text`
- Per equipment line assignment state: `eld_assignment_state`, `dash_cam_assignment_state`, `bestpass_assignment_state`, `fuel_card_assignment_state`, `decal_assignment_state` — enum `equipment_assignment_state` with values `prior`, `during`, `not_assigned`.
- Per equipment line shipment flags: `<line>_shipped_to_driver boolean`, `<line>_awaiting_return_shipment boolean`.

New table `public.equipment_receipts` with full GRANT + RLS block per project conventions (management can insert for any operator; driver can insert only for their own `operator_id`; all can SELECT their own rows; service_role full access).

Trigger `set_eld_signature_signed_at` on `onboarding_status`: when `eld_signature_typed_name` and `eld_signature_image_url` transition from null to set, stamp `eld_signature_signed_at = now()`. Also blocks updates to signature columns once `eld_signature_signed_at IS NOT NULL` (mirrors ICA lock pattern) so no client can rewrite the date or overwrite the signature.

RLS on `onboarding_status`: extend existing update policy to whitelist the new columns for the driver (only their own row, only when unsigned) and management. Follows the same column-whitelist trigger the ICA flow ended on.

## Files touched

- New: `src/components/equipment/EquipmentAssetSheet.tsx` (shared component, `mode: 'driver' | 'management'`).
- New: `src/components/equipment/EquipmentReceiptsList.tsx` (timeline display, reused by Driver Hub / Onboarding History).
- New: `src/components/equipment/ELDSignatureBlock.tsx` (extracted signature canvas + typed name + Execute button, patterned on `OperatorICASign`).
- Edit: `src/pages/operator/OperatorPortal.tsx` — mount `EquipmentAssetSheet` in driver mode below `TruckInfoCard`.
- Edit: `src/pages/staff/OperatorDetailPanel.tsx` — mount `EquipmentAssetSheet` in management mode next to the existing Truck & Equipment card; wire it to the existing `status` state and save handlers.
- Edit: `src/components/drivers/DriverHubView.tsx` — surface receipts + signed block + return date in the driver's long-term history.
- Migration: new columns + `equipment_receipts` table + trigger + RLS/GRANTs.

## Verification

1. Sign in as a test driver in preview: type name, draw signature, tap Execute → confirm success toast, block locks, signed_at reflects server time (compare to `now()` in DB).
2. As management: cycle each equipment row through Prior / During / Not Assigned; edit serials in Prior and During; confirm Not Assigned hides values but keeps the row.
3. After driver signs: confirm management can no longer edit ELD-section serials or status.
4. As management: set `equipment_return_date`; confirm it appears in Driver Hub but not in the driver's SUPERDRIVE portal.
5. As management: mark ELD as "Shipped to driver" with carrier + tracking + receipt. Reload driver portal — receipt upload block appears on the ELD row. Upload receipt as driver → confirm row appears with uploader label "Driver".
6. Upload the same receipt as management → confirm row appears with uploader label "Management — <name>".
7. Both receipts visible in Driver Hub / Onboarding History timeline with correct labels, dates, thumbnails.
8. Force a save error (e.g. offline) during signature execute → confirm friendly toast, no raw SQL/Supabase text on screen.
