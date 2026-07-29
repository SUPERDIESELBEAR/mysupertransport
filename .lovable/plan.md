## What's actually happening

Vehicle Hub's "Registration and 2290" section and the driver's inspection binder already store documents in the **same** place (`inspection_documents`, per-driver). The problem is they point at **different rows**:

| Document | Where it's used | Drivers with a record |
|---|---|---|
| `IRP Registration (cab card)` | Inspection binder only | 74 |
| `Registration` | Vehicle Hub Registration/2290 modal + a binder row under Lease Agreement | 5 |
| `Form 2290` | Both (already shared) | 35 |

So Robert Williams' IRP Registration lives under a name Vehicle Hub never reads, which is why unit 67 looks empty there. Form 2290 already syncs correctly — nothing to fix there.

Of the 5 drivers with both rows, the dates disagree (e.g. `2026-09-03` vs `2027-06-30`), so the merge needs a tie-break rule: **most recent upload wins** (your choice).

## The fix

**1. Retire the "Registration" document type**

One-time data migration, per driver:
- If the driver has only a `Registration` row → rename it to `IRP Registration (cab card)`.
- If the driver has both → keep whichever has the newer `uploaded_at`, copy its file + expiry onto the IRP row, delete the extra `Registration` row.
- Remove `Registration` from the binder's document order (`inspection_binder_order`) so the redundant row under Lease Agreement disappears.
- Update `v_compliance_items` to drop the `Registration` doc key (IRP already covered).

**2. Point Vehicle Hub at the IRP record**

`Registration2290Modal.tsx` currently reads/writes `name = 'Registration'`. Change its registration doc type to `IRP Registration (cab card)` (label stays user-friendly: "Registration / IRP Cab Card"). `FleetDetailDrawer.tsx` reads the same two names, so it picks up the change with a one-line constant update.

After this, a binder upload appears in Vehicle Hub and vice versa with no sync job — it's literally one record.

**3. Keep MO Plate Registry consistent**

There's already a trigger (`sync_mo_plate_expiry_to_irp`) that pushes `mo_plates.expires_at` into the IRP cab card row. Since Vehicle Hub now edits that same row, add a guard so the plate trigger only overwrites the binder expiry when the plate's expiry is **newer** than the document's `uploaded_at`-backed value — consistent with "most recent wins" and prevents a stale plate date from stomping a freshly uploaded cab card.

**4. Label cleanup**

Rename the display label to **"Registration (IRP Cab Card)"** in the binder, Vehicle Hub, and the Fleet Compliance summary so staff see one consistent name in all three places.

## Technical notes

- Files: `src/components/fleet/Registration2290Modal.tsx`, `src/components/fleet/FleetDetailDrawer.tsx`, `src/components/inspection/InspectionComplianceSummary.tsx`, `src/components/inspection/OperatorInspectionBinder.tsx`.
- Migrations: data merge on `inspection_documents`, update `inspection_binder_order` per-driver JSON array, redefine `v_compliance_items`, patch `sync_mo_plate_expiry_to_irp()`.
- `check-inspection-expiry` edge function already tracks `IRP Registration (cab card)` — no change needed, and the 5 merged drivers will start getting expiry reminders on the correct date.
- No storage files are moved; only the row that references them changes.
