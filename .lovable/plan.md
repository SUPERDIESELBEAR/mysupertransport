

## Two-Way Sync: MO Plate Registry ↔ Pipeline Stage 4

### Problem
When a plate is assigned to an operator in the MO Plate Registry, the operator's onboarding status (`mo_reg_received`) is not updated. Staff must manually go to the Pipeline and mark "MO Registration Received = Yes." There is also no reverse sync — when `mo_reg_received` is set to "yes" in the Pipeline, the plate registry is unaware.

### Solution
Add automatic sync in the MO Plate Assign flow: when a plate is assigned to an operator (with a linked `operator_id`), set their `onboarding_status.mo_reg_received` to `'yes'`. When a plate is returned/unassigned, revert it to `'not_yet'`.

### Changes

**1. `src/components/mo-plates/MoPlateAssignModal.tsx` — Update onboarding status on assign**
- After successfully inserting the assignment and updating plate status, if `selectedOperatorId` is set (not manual name), update `onboarding_status` for that operator:
  - Set `mo_reg_received = 'yes'`
  - This completes Stage 4 automatically

**2. `src/components/mo-plates/MoPlateRegistry.tsx` — Update onboarding status on return**
- In the "Return Plate" handler, after closing the assignment, look up the `operator_id` from the active assignment
- If an `operator_id` exists and the operator has no other active plate assignments, set `onboarding_status.mo_reg_received = 'not_yet'`

**3. `src/pages/staff/OperatorDetailPanel.tsx` — Reverse sync (Pipeline → Registry) is NOT needed**
- The Pipeline Stage 4 `mo_reg_received` field is a dropdown that staff already control manually
- Adding reverse sync (auto-creating plates from the Pipeline) would be overengineering — plates are physical assets that must be explicitly registered
- The value of syncing is one-directional: Registry → Pipeline

### Files to change
| File | Change |
|------|--------|
| `src/components/mo-plates/MoPlateAssignModal.tsx` | Set `mo_reg_received = 'yes'` after assign |
| `src/components/mo-plates/MoPlateRegistry.tsx` | Set `mo_reg_received = 'not_yet'` on plate return (if no other active plates) |

### No migration needed
The `onboarding_status` table already has the `mo_reg_received` column with the correct enum type.

