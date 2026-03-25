
## MO Registration & License Plate Tracker — Revised Plan

### Overview
Same as before, with one addition: a **Lost/Stolen** status and its replacement workflow. When a plate is reported lost or stolen, staff mark it accordingly. Missouri re-issues the same plate number as a replacement. The registry tracks this as a continuous lifecycle on the same plate record, with the lost/stolen event logged in the history timeline.

---

### Database — 2 new tables (unchanged schema, updated status enum)

**`mo_plates`** — status column now includes 5 values:
```
'available' | 'assigned' | 'lost_stolen' | 'retired'
```

**`mo_plate_assignments`** — history table (unchanged):
```
id, plate_id, operator_id (nullable), driver_name, assigned_at,
returned_at, notes, assigned_by, returned_by
```

A "lost/stolen" event is recorded as a special assignment row with `driver_name = 'LOST/STOLEN'` and `returned_at = NULL` until the replacement arrives (or the row can be closed when the replacement is received). An optional `event_type` text column can differentiate assignment rows from event rows — this keeps the timeline coherent.

Revised `mo_plate_assignments` schema:
```
...
event_type  text  -- 'assignment' | 'lost_stolen' | 'replacement_received'
```

---

### New Files (unchanged)

- `src/components/mo-plates/MoPlateRegistry.tsx`
- `src/components/mo-plates/MoPlateFormModal.tsx`
- `src/components/mo-plates/MoPlateAssignModal.tsx`
- `src/components/mo-plates/MoPlateHistoryModal.tsx`

---

### UI Design — Plate Card Actions

Each plate card has action buttons that adapt based on current status:

**Status: Available**
- `Assign` (blue)
- `Edit` (ghost)
- `History` (ghost)
- `Mark Lost/Stolen` (destructive ghost — small)
- `Retire` (ghost — small)

**Status: Assigned**
- `Return` (outline)
- `Edit` (ghost)
- `History` (ghost)
- `Mark Lost/Stolen` (destructive ghost — small)

**Status: Lost/Stolen**
- `Replacement Received` (green — primary action) — closes the lost/stolen event, sets plate back to `available`, logs a "Replacement received" history entry
- `History` (ghost)
- `Edit` (ghost)

**Status: Retired**
- `History` (ghost)
- `Reactivate` (ghost — management only)

---

### Lost/Stolen Workflow

1. Staff clicks **Mark Lost/Stolen** on any plate (available or assigned)
2. A small confirmation dialog appears with an optional notes field ("Reported lost on route 44, driver John Smith")
3. On confirm:
   - If currently assigned: the open assignment row is closed (`returned_at = now()`)
   - A new `mo_plate_assignments` row is inserted with `event_type = 'lost_stolen'`, no `operator_id`, notes from the dialog, `returned_at = NULL`
   - `mo_plates.status` is set to `'lost_stolen'`
4. Plate card shows **Lost/Stolen** badge (red) with the date reported
5. When replacement arrives, staff clicks **Replacement Received**:
   - Closes the lost/stolen event row (`returned_at = now()`)
   - Inserts a new `mo_plate_assignments` row with `event_type = 'replacement_received'` and a note ("Replacement plate received from MO — same number")
   - Sets `mo_plates.status = 'available'`
   - Plate is now ready to be assigned again

---

### History Timeline — Event Types

The history modal shows a unified vertical timeline for all event types:

```
● [blue]   ASSIGNED            → John Smith    May 1 2024 – Aug 12 2024
● [muted]  RETURNED            → (same row, closed)
● [red]    LOST / STOLEN       → Reported Aug 13 2024 — "Lost during relay"
● [green]  REPLACEMENT REC'D   → Aug 28 2024 — "New plate from MO"
● [blue]   ASSIGNED            → Maria Gonzalez  Sep 3 2024 – present
```

---

### Status Badge Colors

| Status | Badge Color |
|---|---|
| Available | Green |
| Assigned | Blue |
| Lost/Stolen | Red |
| Retired | Muted gray |

---

### Management Portal Integration

- Add `'mo-plates'` to the `ManagementView` union type in `ManagementPortal.tsx`
- Add nav item under the **Admin** divider (after Equipment)
- Render `<MoPlateRegistry />` when view is `'mo-plates'`

---

### Technical Details

- No edge functions needed — all CRUD is direct queries
- `mark_lost_stolen` and `replacement_received` are client-side functions that run 2–3 sequential Supabase mutations
- RLS: `is_staff()` for SELECT/INSERT/UPDATE; `has_role(management)` for DELETE
- Driver dropdown for assignment pulls from the same `operators` + `applications` join used in Equipment Inventory
- Migration creates both tables + RLS policies in a single SQL file
