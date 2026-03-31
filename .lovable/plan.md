

## Harden All Save/Update Functions — Capture Errors App-Wide

### Problem
Multiple places across the app call `await supabase.from(...).update(...)` without checking the result. If the database update fails, the UI still proceeds as if it succeeded — updating local state, showing success toasts, and hiding the real error.

### What Gets Fixed

| # | File | Location | Issue |
|---|------|----------|-------|
| 1 | `OperatorDetailPanel.tsx` | `markReceivedHandler` (~line 3650) | `onboarding_status` update result ignored |
| 2 | `OperatorDetailPanel.tsx` | Truck photos `onMarkReceived` (~line 3808) | Same — result ignored |
| 3 | `ICABuilderModal.tsx` | Save draft (~line 252) | `onboarding_status` update result ignored |
| 4 | `ICABuilderModal.tsx` | Save & send (~line 307) | `onboarding_status` update result ignored |
| 5 | `EquipmentReturnModal.tsx` | Equipment return (~line 61) | `equipment_items` update result ignored |
| 6 | `MoPlateRegistry.tsx` | Plate return (~lines 138-144) | Both `mo_plate_assignments` and `mo_plates` update results ignored |

### Fix Pattern

Every unchecked `await supabase.from(...).update(...)` becomes:

```ts
const { error: updateErr } = await supabase.from('table').update(data).eq('id', id);
if (updateErr) throw updateErr;  // caught by existing try/catch
```

Since all of these are already inside `try/catch` blocks with error toasts, throwing on failure is all that's needed — the existing catch handler will display the error and prevent local state from being updated incorrectly.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Capture + throw on error for 2 "Mark Received" updates |
| `src/components/ica/ICABuilderModal.tsx` | Capture + throw on error for 2 `onboarding_status` updates |
| `src/components/equipment/EquipmentReturnModal.tsx` | Capture + throw on error for `equipment_items` update |
| `src/components/mo-plates/MoPlateRegistry.tsx` | Capture + throw on error for both assignment and plate updates |

