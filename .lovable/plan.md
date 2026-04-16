

## Shipping Tracking Receipt for Self-Install Equipment

### My Opinion

**Strongly recommend building this.** It solves three real problems at once:

1. **Accountability** — proves the device left the shop and when. If a driver claims "never got it," there's a receipt with a tracking number, carrier, and ship date attached to the assignment record.
2. **Driver self-service** — the operator can see "ELD shipped via UPS, tracking 1Z…, delivered Tuesday" right in their portal instead of pinging staff.
3. **Audit trail** — every device assignment gets a verifiable hand-off artifact, just like the inspection binder gets a signed share token.

The data model already has the perfect home for it: `equipment_assignments` is the row that represents one hand-off of one device to one driver. Tracking info belongs on that row.

### Where I'd Place It

**Two integrated touchpoints — not a separate screen.**

**1. Inside `EquipmentAssignModal` (staff-side, primary entry)**
When staff assign an ELD / Dash Cam / BestPass / Fuel Card, add an optional **"Shipping & Tracking"** section below the Notes field:
- Toggle: `[ ] This device is being shipped to the operator (self-install)`
- When toggled on, reveal:
  - **Carrier** (select: UPS / FedEx / USPS / DHL / Other)
  - **Tracking Number** (text input)
  - **Ship Date** (date input, defaults today)
  - **Tracking Receipt Photo** (single image/PDF upload — the photo of the actual receipt from the shipping counter)

Staff can also assign the device first and add the receipt later (covered by point 2).

**2. Inside `EquipmentHistoryModal` (staff-side, follow-up entry + view)**
Each row in the history already shows assigned date, returned date, condition, notes. Add:
- Tracking summary chip: `📦 UPS · 1Z999AA1… · Shipped Apr 10` (clickable → opens the carrier's tracking page in a new tab)
- Thumbnail of the receipt photo (clickable → opens in the existing `FilePreviewModal`)
- For the **active** (currently-assigned) row only: an **"Add / Edit Tracking"** button so staff can attach the receipt after the fact when the device gets shipped a day or two after assignment.

**3. Inside the Operator Portal (driver-facing, read-only)**
In `TruckInfoCard.tsx` next to each device serial number, show a small badge when shipping info exists:
- `ELD Serial # · 1234567890`
- `📦 Shipped UPS · Track →` (links to carrier site) · `View receipt` (opens photo)

This is the "self-service" win — the driver checks their own portal for shipping status instead of texting the coordinator.

### Database Changes

Add five nullable columns to `equipment_assignments` (no breaking changes, no new table needed):

| Column | Type | Purpose |
|---|---|---|
| `shipping_carrier` | text | UPS / FedEx / USPS / DHL / Other |
| `tracking_number` | text | The tracking number itself |
| `ship_date` | date | When it was handed to the carrier |
| `tracking_receipt_url` | text | Path to the receipt image/PDF in storage |
| `tracking_receipt_uploaded_at` | timestamptz | Audit timestamp |

Plus a public RPC `get_equipment_shipping_for_operator(p_operator_id)` so the operator portal can read shipping info for **its own** active assignments without granting drivers full SELECT on `equipment_assignments` (current RLS is staff-only — we keep that intact).

### Storage

Reuse the existing **`operator-documents`** bucket (private, already RLS-protected, already supports the file types we need: PDF/JPG/PNG/HEIC). Path convention:
```
operator-documents/equipment-receipts/{operator_id}/{assignment_id}-{timestamp}.{ext}
```
Use `validateFile` (10 MB cap, image/PDF only) — already in the codebase.

### Files Touched

| File | Change |
|---|---|
| New migration | Add 5 columns to `equipment_assignments` + new RPC for operator read access |
| `src/components/equipment/EquipmentAssignModal.tsx` | Add "Shipping & Tracking" section with carrier / tracking # / ship date / receipt upload |
| `src/components/equipment/EquipmentHistoryModal.tsx` | Show tracking chip + receipt thumbnail per row; "Add/Edit Tracking" on active row |
| `src/components/operator/TruckInfoCard.tsx` | Show carrier link + "View receipt" beside each device serial when shipping info exists |
| `src/pages/operator/OperatorPortal.tsx` | Fetch shipping info via the new RPC, pass to `TruckInfoCard` |
| `src/lib/equipmentSync.ts` *(maybe)* | If staff assign via the operator detail panel's Stage 5, support attaching tracking there too |

### Open Questions Before I Build

1. **Carrier list** — Stick with UPS / FedEx / USPS / DHL / Other, or add any other carriers SUPERTRANSPORT actually uses?
2. **Driver visibility** — Should the operator see only the **currently-active** device's shipping info, or also see prior shipments in their device history (e.g., a replacement ELD that was shipped 6 months ago)?
3. **Notification on ship** — When staff attach a tracking receipt, should the driver get an in-app + email notification ("📦 Your ELD has shipped — tracking 1Z…")? Aligns with existing onboarding milestone notifications and removes another text-message-the-coordinator scenario.
4. **Required vs optional** — Should "self-install + shipped" be enforced for any device flagged as remote-installed, or always optional? My recommendation: always optional, since some devices are still hand-delivered at the shop.

