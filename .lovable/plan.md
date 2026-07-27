# Plan: Guided Driver Deactivation & Delease Workflow

## Current State
Driver offboarding is a set of independent, manually-triggered modules that do not talk to each other. Deactivating a driver (`operators.is_active = false`) fires a trigger that only resets dispatch state and pings the onboarding coordinator. Everything else — lease termination (Appendix C), equipment return, OSAS return, fuel-card deactivation, MO-plate release, ICA void — is a separate manual action staff must remember to perform. There is no unified offboarding checklist or wizard, no true `deactivated_at` audit timestamp, and no staff-facing step to confirm physical equipment return after the driver uploads a shipping receipt.

## Goal
Create a single, guided, step-by-step staff workflow that walks a staff member through the full deactivation and delease process, ensures no required step is missed, and sends the OSAS return instructions automatically where appropriate.

## Proposed Solution
Introduce a new **Deactivation & Delease Wizard** launched from the driver action menu in the management portal. The wizard will be a multi-step modal that:
1. Captures the deactivation reason and effective date.
2. Runs the deactivation and required safety-advisor notification.
3. Generates/sends the lease termination (Appendix C) if the driver has an active ICA/lease.
4. Triggers the OSAS return instructions and equipment return flow.
5. Handles fuel-card deactivation, MO-plate release, and ICA void in sequence.
6. Records a real `deactivated_at` audit timestamp and confirms login-retention policy.

## Implementation Steps

### 1. Database schema additions
- Add `deactivated_at timestamptz` to `operators` (true audit timestamp, distinct from `updated_at`).
- Add `deactivation_reason text` and `deactivated_by uuid references auth.users(id)` to `operators`.
- Add an `operator_offboarding_steps` tracking table (or JSONB progress column on `operators`) to record completion of each wizard step: safety_advisor_notified, lease_termination_sent, equipment_return_requested, fuel_card_deactivated, mo_plates_released, ica_voided, login_retained.
- Add appropriate RLS policies and GRANTs (authenticated read/write, service_role all).
- Update `handle_operator_deactivated()` trigger to stamp `deactivated_at` when `is_active` flips true → false, and clear it if reactivated.

### 2. New component: `DeactivationWizard` (`src/components/management/DeactivationWizard.tsx`)
A full-screen or large modal wizard with the following steps:

#### Step 1 — Reason & Date
- Select deactivation reason (dropdown or radio): resigned, terminated, laid off, medical, other.
- Effective date picker (default today, US Central noon anchor).
- Display a summary of the driver, truck, and active assignments.

#### Step 2 — Confirm Deactivation & Notify Safety Advisor
- Toggle `operators.is_active` false (this triggers the existing `handle_operator_deactivated` dispatch reset + notification).
- Immediately surface the existing `NotifySafetyAdvisorDialog` content inline as a required sub-step; do not allow advancing until the safety-advisor email is sent.
- On send, call `send-deactivation-notice` edge function and mark step complete.

#### Step 3 — Lease Termination (Appendix C)
- Check if the operator has an active `ica_contracts` row.
- If yes, embed the existing `LeaseTerminationBuilderModal` flow inline: pre-fill operator/truck data, let staff pick reason/effective date/notes, sign, and save to `lease_terminations`.
- After saving, offer a “Send to Insurance” button that invokes the existing `send-lease-termination` edge function and stamps `insurance_notified_at`.
- If no active ICA, allow skipping this step with a clear “No active lease” badge.

#### Step 4 — OSAS / Equipment Return
- Query the operator’s latest `onboard_assignment_sheets` row.
- If a sheet exists, show a summary of assigned equipment (ELD, Dash Camera, BestPass, Fuel Card) and a **“Send Return Instructions”** button that calls the existing `send-equipment-return-instructions` edge function, setting `return_requested_at` and emailing the driver.
- If already requested, show a “Resend” option and a readout of the driver’s uploaded return receipt(s) from `equipment_receipts`.
- Add a new staff checkbox: **“Equipment physically received and inspected”** that, when checked, stamps `return_completed_at` on the sheet and clears assigned equipment fields on `onboarding_status`.

### 5. Fuel Card Deactivation
- Check if a fuel card is assigned via `equipment_assignments` / `onboarding_status.fuel_card_number`.
- If yes, show the fuel-card details and a **“Deactivate Fuel Card”** button that reuses the existing `FuelCardDeactivateModal` logic (or calls the same update path) and marks the step complete.

### 6. MO Plate Release
- Query `mo_plate_assignments` for plates assigned to this operator.
- Show each plate with a **“Release / Return”** button that invokes the existing `MoPlateAssignModal` return flow and stamps `returned_at`/`returned_by`.
- Mark step complete when all assigned plates are released.

### 7. ICA Void
- Check if an active `ica_contracts` row remains.
- If yes, show a **“Void ICA / Remaining Contracts”** button that reuses the existing `handleVoidICA` logic from `OperatorDetailPanel` (or extracts it into a shared helper) and marks step complete.
- If no active ICA/contract, show “No active contracts” badge.

### 8. Final Review & Login Retention
- Display a checklist of completed steps and any skipped steps with reasons.
- Show the driver’s portal login status and a confirmation message: “Driver login remains active so they can upload return receipts and view final documents.”
- Provide a **“Finish Deactivation”** button that finalizes the wizard and logs a single `audit_log` entry (`driver_deactivation_completed`) with the full step payload.

### 3. Launch points & navigation
- Add a **“Deactivate & Delease…”** menu item to the driver action menu in `OperatorDetailPanel.tsx` and in `FleetRoster.tsx` driver cards.
- Remove or hide the existing standalone deactivation toggle from the header when the wizard is enabled; the wizard becomes the only path to set `is_active = false`.
- Ensure the wizard can be resumed if closed mid-flow by reading the progress table/column.

### 4. Edge-function / backend updates
- Create or update an edge function `finalize-deactivation` that:
  - Accepts the operator ID and step completion payload.
  - Verifies the caller has staff/management role.
  - Stamps `deactivated_at`, `deactivation_reason`, `deactivated_by`.
  - Writes the consolidated `audit_log` entry.
- Update the existing `send-equipment-return-instructions` function to optionally accept a source parameter (`wizard`) for audit context.
- Ensure `mark_equipment_return_completed()` trigger fires from the new staff confirmation path (or add a helper to set `return_completed_at` directly).

### 5. UI/UX polish
- Each step shows a clear status indicator: not started, in progress, complete, skipped (with reason), or not applicable.
- Steps are disabled until prerequisites are met (e.g., cannot void ICA before lease termination is signed, cannot release plates before the driver is deactivated).
- Mobile-responsive layout: stepper collapses to a dropdown on small screens; action buttons are full-width.
- Confirm destructive actions with a second click or typed confirmation (e.g., “Type driver name to confirm deactivation”).

### 6. Verification & audit
- Add a new read-only **Offboarding History** section on the driver detail page showing each step, who completed it, and when.
- Add a management report filter (or extend `TerminationsView`) to list drivers who completed the wizard and those stuck mid-flow.

## Files to create or modify
- Create: `src/components/management/DeactivationWizard.tsx`
- Create: `src/components/management/DeactivationStep.tsx` (shared step shell)
- Create: `src/components/management/OffboardingHistoryPanel.tsx`
- Create/Update: `supabase/functions/finalize-deactivation/index.ts`
- Modify: `src/components/operator/OperatorDetailPanel.tsx` (add launch menu, hide raw toggle, extract `handleVoidICA` if needed)
- Modify: `src/components/fleet/FleetRoster.tsx` (add launch menu item)
- Modify: `src/components/equipment/EquipmentReturnModal.tsx` or reuse logic for staff return confirmation
- Modify: `src/components/fuel/FuelCardDeactivateModal.tsx` or reuse logic
- Modify: `src/components/mo-plates/MoPlateAssignModal.tsx` or reuse logic
- Modify: `src/components/ica/LeaseTerminationBuilderModal.tsx` to support inline/wizard mode
- Modify: migration file(s) for `operators` schema additions and trigger update

## Open questions resolved by this plan
- There is no separate “return OSAS” record; the wizard will reuse the existing `onboard_assignment_sheets` row and its `return_requested_at` / `return_completed_at` columns, plus the existing `send-equipment-return-instructions` edge function.
- There is no staff “confirm physical arrival” step; the wizard adds one that stamps `return_completed_at` on the OSAS sheet.
- There is no true `deactivated_at`; the plan adds a dedicated column.
- Driver login remains active intentionally; the final step explicitly confirms this policy so staff do not assume it is revoked.

## Success criteria
- A staff member can open one wizard from a driver card and complete the entire deactivation/delease flow without leaving the modal.
- Every required step is blocked until prerequisites are met, and every completed step is auditable.
- The OSAS return instructions are sent automatically from the wizard, and the driver can upload the return receipt through the existing operator portal flow.
- The management team can see a clear offboarding history for each driver.