## Technical notes

**Save-as-you-go**
- `DeactivationWizardContent.tsx` currently upserts all ten `operator_offboarding_steps` rows only inside `handleFinalize`. Extract that upsert into a `persistStep(key, {completed, skipped, skipped_reason})` helper and call it from `updateStepStatus` whenever a step moves to `completed` or `skipped`, plus on Next. `handleFinalize` keeps its full upsert as the closing write, so behaviour on finish is unchanged.
- Hydration on load already exists (`savedSteps` → `setSteps`). Keep it, and stop the mount-effect from resetting derived flags (`setSafetySent(false)` etc.) when the underlying record says otherwise — derive `safety_advisor_notified_at`, `insurance_notified_at`, ICA `voided_at`, open `equipment_assignments`/`mo_plate_assignments` into initial step state so externally-completed work shows as done.

**Resume entry point**
- `src/pages/staff/OperatorDetailPanel.tsx`: a banner above the Deactivate button when any `operator_offboarding_steps` row exists and the operator is still active — "Offboarding in progress — N of 10 done", with **Resume** linking to `/management/deactivate/:operatorId`. The wizard opens at the first step whose status is neither completed nor skipped (replaces the unconditional `setCurrentStep('reason')`).

**Backfill for the three drivers**
- One data write (no schema change) inserting `operator_offboarding_steps` rows for operators `28a00800…` (Trovino), `05261d2c…` (Willie), `eaedf328…` (Bilal), marking only the steps their audit history proves: reason, DOT notice, lease termination (Trovino, Willie), ICA void (Trovino, Willie). Nothing is marked done that did not happen; Bilal's DOT notice stays open because his 08/05 email was a test send.
- Trovino's duplicate `lease_terminations` row from 09/03 gets a void stamp with a reason; the 09/04 sent one stays.

**Where the guide lives**
- A collapsible "How this works — start here" panel at the top of the wizard screen (`DeactivationPage.tsx`), holding the ten steps and the start rule.
- The same text as a resource in the Staff Help / Resource Library, seeded through `resource_documents` so staff can find it without opening a driver.

**Unchanged:** the ten steps and their order, the intent gate, the unit disposition options and `vacant_units` behaviour, void-not-delete on the ICA, and the rule that the wizard is the only start point.
