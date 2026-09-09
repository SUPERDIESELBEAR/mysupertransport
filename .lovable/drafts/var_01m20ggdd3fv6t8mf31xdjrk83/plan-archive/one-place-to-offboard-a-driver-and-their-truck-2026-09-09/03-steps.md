## The ten steps, after this change

1. **Reason & date** — unchanged, plus the typed-name confirmation and the "this driver still looks actively dispatched, park them instead?" warning, moved here from the separate termination button.
2. **Unit disposition** — defaults to *the truck leaves with the driver*. That answer keeps plate release, equipment return and ICA void as required steps. The other answers hold the unit vacant as they do now.
3. **DOT consultant notice** — unchanged; sends and stamps the notification date.
4. **Lease termination (Appendix C)** — signs and creates the document, shows the full document preview, and **sends it to insurance in place**, recording the send on the step. Skippable only with a reason.
5. **Equipment return** — assignment sheet, return instructions email, and the physical receipt confirmation all on one step, so nothing waits in the separate receipt control. Two additions here:
   - **Decal removal photos.** The return instructions now tell the driver to remove our logo and DOT/unit numbers from both sides of the truck and upload **two photos — driver's side and passenger side** — showing them gone. Both photos are required alongside the shipping receipt before the return counts as complete, and staff see them on this step.
   - **License plate.** When the driver has a plate assigned to them, that plate appears as a line on their Assignment Sheet and as a return item in the instructions, with the reminder to pull it off the truck and mail it back. Today the email mentions a plate only in passing and the assignment sheet doesn't list it at all.
6. **Fuel card** — unchanged.
7. **MO plate release** — unchanged; already auto-detects a plate released from the registry.
8. **ICA void** — marks the agreement void with a reason instead of deleting it; the record stays visible with a VOID stamp.
9. **Login retention** — actually applies the choice: keep sign-in, or disable it on finalize. Plain wording about what each means.
10. **Confirm & finalize** — a checklist of everything done and everything skipped with its reason, then finalize.

Every step already writes its state per driver, so leaving mid-run is safe. Steps completed outside the wizard show as already done rather than asking again.

## Technical notes

- `src/components/management/DeactivationWizardContent.tsx` is the single owner of the flow. Move `TerminationConsequenceDialog` into the `reason` step gate (typed-name via `nameMatches`, active signals via `looksActivelyWorking`, park handoff to `ParkDriverControl`). Remove the standalone termination launch from `OperatorDetailPanel.tsx` (`showTerminationConfirm` / `showTerminationBuilder`); the view modal and the Lease Terminations hub stay for reading and re-sending.
- Lease step: after inserting into `lease_terminations`, render `LeaseTerminationDocumentView` and invoke `send-lease-termination`, stamping `insurance_notified_at` — same call `LeaseTerminationViewModal` already makes.
- Equipment step: fold `equipment_return_confirmations` / `EquipmentReceiptControl` in beside the existing `onboard_assignment_sheets` flow so both records are satisfied from one screen.
- Decal photos: add a `decal_removal` section to the driver's Onboard Systems return upload (two required slots, driver side / passenger side) stored in the existing OSAS return storage path, with a staged additive migration adding `decal_photo_driver_side_url`, `decal_photo_passenger_side_url` and their uploaded timestamps to `onboard_assignment_sheets`. Add the instruction and the two-photo requirement to `supabase/functions/_shared/transactional-email-templates/equipment-return-instructions.tsx`, and make return completion require both photos plus the receipt.
- License plate on the sheet: `send-equipment-return-instructions/index.ts` already maps `license_plate` in `DEVICE_LABELS` and `RETURNABLE_TYPES`, but the item only shows if a `license_plate` row exists on `onboard_assignment_sheet_items`. Plate assignment lives in `mo_plate_assignments`, so the assignment-sheet builder should create a `license_plate` item (serial = plate number) whenever the operator has an open plate assignment, keeping it in sync when plates change. The email then lists it automatically.
- ICA void: replace the `ica_contracts` delete with a void stamp (`voided_at`, `void_reason`, `voided_by`) and keep the `onboarding_status.ica_status` reset and `ica_voided` audit row. Needs a staged additive migration adding those columns to `ica_contracts`; readers that count active contracts filter `voided_at is null`.
- Login retention: on finalize, when `keepLoginActive` is false, call an edge function using the service role to disable the auth user (ban / sign-out), and record the outcome on the audit row. Verify first whether `operators.is_active = false` already blocks sign-in; if it does, the step becomes an explicit statement of that rather than a new call.
- Unit disposition: default state `truck_leaves`; keep `vacant_units` insert for the other two answers.
- Resume: a progress banner on `OperatorDetailPanel.tsx` driven by `operator_offboarding_steps`, linking to `/management/deactivate/:id` at the first incomplete step. Also clear `is_departing` on finalize.
- Access: the wizard route and the start button gate on owner or management via `has_role`.
