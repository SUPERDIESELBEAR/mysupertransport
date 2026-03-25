
## What exists today

**Operator-facing portal** (`OperatorPortal.tsx` lines 1022–1088): A "My Equipment Info" card already shows `eld_serial_number`, `dash_cam_number`, `bestpass_number`, and `fuel_card_number` — but only once those fields are populated. Truck details (year/make/model/VIN/plate) from `ica_contracts` are not shown at all.

**Staff/Management "Operator Detail Panel"** (`OperatorDetailPanel.tsx`): Equipment device numbers are buried inside the Stage 5 admin section as editable inputs. There is no combined "Truck & Equipment" summary card anywhere in the panel.

**Management Portal** (`ManagementPortal.tsx`): Renders `OperatorDetailPanel` directly — it shares the same component as Staff, so any change to the panel appears in both places automatically.

---

## Plan

### 1. Add a `TruckInfoCard` component
Create `src/components/operator/TruckInfoCard.tsx` — a shared read-only display card showing two grouped sections:

```text
┌─────────────────────────────────────┐
│  🚛  Truck & Equipment              │
├─────────────────────────────────────┤
│  TRUCK INFO (from ICA)              │
│  Year / Make / Model  VIN           │
│  License Plate        Plate State   │
│  Unit Number          Trailer #     │
├─────────────────────────────────────┤
│  DEVICES & CARDS                    │
│  ELD Serial #         Dash Cam #    │
│  BestPass #           Fuel Card #   │
└─────────────────────────────────────┘
```

Fields shown only when populated. If nothing is filled in yet, the card is hidden entirely.

---

### 2. Update the Operator Portal
**File:** `src/pages/operator/OperatorPortal.tsx`

- Extend the `fetchData` query to also fetch the operator's `ica_contracts` record (truck_year, truck_make, truck_model, truck_vin, truck_plate, truck_plate_state, trailer_number).
- Add a `icaTruckInfo` state object.
- **Replace** the existing inline "My Equipment Info" card (lines 1022–1088) with `<TruckInfoCard>`, passing both `onboardingStatus` fields and `icaTruckInfo`.

---

### 3. Update the Operator Detail Panel (Staff / Management)
**File:** `src/pages/staff/OperatorDetailPanel.tsx`

- Extend the existing `ica_contracts` query (already used for draft status) to also pull truck fields.
- Add an `icaTruckInfo` state object populated on data load.
- Insert `<TruckInfoCard>` as a **new collapsible stage section** titled "Truck & Equipment Info" placed between Stage 5 (Equipment) and Stage 6 (Insurance) in the stage list — or as a standalone non-collapsible summary card near the top of the panel beside the progress bar. The top summary card placement is preferred since it gives coordinators an at-a-glance reference without scrolling into stage 5.

---

### 4. Editable fields (staff only)
The `TruckInfoCard` component will accept an optional `onEdit` prop. When provided (staff/management view), a small "Edit" icon button appears in the card header opening an inline edit popover for the device numbers (unit #, ELD, dash cam, BestPass, fuel card). Truck details (year/make/model/VIN/plate) remain read-only in this card since they are managed through the ICA builder.

---

### Files to change
| File | Change |
|---|---|
| `src/components/operator/TruckInfoCard.tsx` | **New** shared display card |
| `src/pages/operator/OperatorPortal.tsx` | Fetch ICA truck fields; replace inline card with `TruckInfoCard` |
| `src/pages/staff/OperatorDetailPanel.tsx` | Fetch ICA truck fields; add `TruckInfoCard` to summary area |

No database migration needed — all data already exists in `ica_contracts` and `onboarding_status`.

---

### Portals affected
- **Staff Portal** — Driver Hub → Operator Detail Panel ✓
- **Management Portal** — Driver Hub → same `OperatorDetailPanel` component ✓
- **Operator Portal** — "My Progress" tab, below the stage cards ✓
