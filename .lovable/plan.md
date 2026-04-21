

## Short answer

**No** — shipping carrier, tracking number, ship date, and tracking receipt do **not** currently sync into the applicant's profile in the pipeline (the Operator Detail Panel that Staff and Management open from the Pipeline / Driver Hub).

### Where the data lives today

- **Stored in**: `equipment_assignments` table (`shipping_carrier`, `tracking_number`, `ship_date`, `tracking_receipt_url`).
- **Visible in**: 
  - Equipment Inventory (staff/management) — via `EquipmentAssignModal` and `EquipmentHistoryModal`.
  - Operator Portal — `TruckInfoCard` shows a "Shipped UPS · 1Z999…" chip + receipt link beside each device serial.
- **Missing in**: The Operator Detail Panel (the applicant/operator profile drawer used in the Pipeline). It renders `<TruckInfoCard>` but only passes `truckInfo` and `deviceInfo` — the `shippingInfo` prop is omitted, so no tracking chip ever shows.

### Plan — sync shipping into the applicant profile

Mirror the same one-line shipping chip the operator already sees, on the staff/management side. No new schema, no new RPC if one already exists for the operator portal — we'll reuse the same fetch.

1. **Reuse the operator-side fetch**
   - Find the call in `OperatorPortal.tsx` (around line 194) that returns `EquipmentShippingInfo[]` per device. It already exists and is RLS-safe for staff (staff can view `equipment_assignments` directly).
   - Extract it into `src/lib/equipmentSync.ts` as `fetchOperatorEquipmentShipping(operatorId)` so both portals share one source of truth.

2. **Wire it into the Operator Detail Panel** (`src/pages/staff/OperatorDetailPanel.tsx`)
   - Add `equipmentShipping` state, fetch on mount whenever `operatorId` changes (and after EquipmentAssignModal saves, via the existing refresh hook).
   - Pass it to the existing `<TruckInfoCard>` at line 3012:
     ```tsx
     <TruckInfoCard
       truckInfo={icaTruckInfo}
       deviceInfo={{ ... }}
       shippingInfo={equipmentShipping}
       onEdit={handleTruckDeviceEdit}
       onTruckEdit={handleTruckInfoEdit}
     />
     ```
   - This automatically lights up the same shipping chips (Carrier · tracking# · receipt preview) the operator sees, since `TruckInfoCard` already supports the prop.

3. **Coverage**
   - Staff Portal → Pipeline → open applicant → Truck & Equipment card now shows shipping per device.
   - Management Portal → same panel is reused → gets it automatically.
   - No changes needed in `ApplicationReviewDrawer` (that drawer is for the *application* stage, before equipment is assigned — equipment doesn't apply there).

### What stays unchanged

- Permissions (staff already have read access via existing RLS on `equipment_assignments`).
- Edit flow remains in Equipment Inventory's `EquipmentAssignModal` / `EquipmentHistoryModal` — the profile view is read-only display, matching the existing pattern.
- Operator portal display and Equipment Inventory views stay as-is.

### After deploying

1. Staff opens any operator from Pipeline → Truck & Equipment card now shows "Shipped UPS · 1Z999…" with a clickable carrier link and receipt preview, beside each ELD / Dash Cam / BestPass / Fuel Card serial — exactly what the operator sees.
2. Same in Management Portal (uses the same panel).
3. Updates made in Equipment Inventory flow through on next open.

