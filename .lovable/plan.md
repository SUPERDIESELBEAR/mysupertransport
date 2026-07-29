## What's actually wrong

The data is correct. In the database, fuel card **900** has an open (not returned) assignment to Marcus Mueller's operator record, and his onboarding record also lists fuel card number 900.

The Deactivation wizard shows "No fuel cards are assigned to this driver" because of a bad query in the wizard, not missing data:

1. **It asks for columns that don't exist.** The wizard loads equipment with `select(id, device_type, serial_number, status, current_assignment_id, current_operator_name)` from the equipment items table. Those last two fields are *not* real columns — the Onboard Systems page computes them in the browser by joining the assignments table. The request is therefore rejected, the result comes back empty, and the step falls through to the "none assigned" message and marks itself skipped.
2. **It never filters by the driver.** Even if the columns existed, the query has no operator filter — it pulls every assigned item fleet-wide. So the step was never correctly scoped to the driver being deactivated.

## Fix

In `DeactivationWizardContent.tsx`:

- Replace the equipment fetch with a scoped, valid query: read open assignments for this operator (`equipment_assignments` where `operator_id = operatorId` and `returned_at is null`) joined to their equipment item (`id, device_type, serial_number, status`).
- Build the fuel-card list from that result, mapping the assignment row's id into `current_assignment_id` and the wizard's known operator name into `current_operator_name`, so the existing deactivate handler (which closes the assignment row and clears the fuel card number) keeps working unchanged.
- Add loud error handling: if the query fails, surface an error state in the Fuel Card step instead of silently rendering "No fuel cards are assigned," so a broken query can never masquerade as "nothing to do" again.
- Re-evaluate the step status from the scoped list: pending when the driver has an active card, completed when all are deactivated, skipped only when the query genuinely returns zero rows.

## Also worth checking in the same pass

The MO Plate step is already scoped by `operator_id`, so it is unaffected. No database or schema changes are needed.

## Result

Opening the wizard for Marcus Mueller will show fuel card 900 with a Deactivate action, and the step will no longer auto-skip.
