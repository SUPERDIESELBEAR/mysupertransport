# IFTA Decal Issued — new Stage 5 equipment checklist item

## What gets added

A new yes/no field, **IFTA Decal Issued**, tracked per driver alongside the fuel card. IFTA decals ship with the fuel card, so it sits directly under the Fuel Card group in Stage 5 — Equipment and becomes part of what makes Stage 5 complete.

## Where it shows up

1. **Onboarding Pipeline → driver detail → Stage 5 — Equipment**
   - New "IFTA Decal Issued" dropdown (Yes / No) in the Fuel Card block, right below "Fuel Card Issued".
   - Stage 5 auto-collapse logic updated to include it, same as the other fields.

2. **Stage 5 completion (required)**
   - The equipment checklist ("Decal Applied / ELD Installed / Fuel Card Issued") gains "IFTA Decal Issued".
   - The pipeline EQUIP dot changes from a 3-item to a 4-item count, and the "Incomplete: Equip" chip and open-items list gain "IFTA Decal".
   - Stage 5 only reads complete when decal, ELD (or ELD-exempt), fuel card, and IFTA decal are all Yes.

3. **Onboard Systems sign-off sheet**
   - IFTA Decal added as a selectable line item on the assignment/sign-off sheet the driver signs for received equipment, and shown on the sheet preview/PDF.

4. **Driver app equipment view**
   - "IFTA Decal Issued" appears in the driver's Stage 5 status list next to Decal Applied / ELD Installed / Fuel Card Issued, and in the Smart Progress widget's coordinator checklist.

## Technical notes

- Database migration: add `ifta_decal_issued` (yes/no text, default `'no'`) to `public.onboarding_status`. Add `ifta_decal` to the `osas_device_type` enum for sign-off sheet line items.
- Code touchpoints: `src/pages/staff/OperatorDetailPanel.tsx` (field UI, status type, save payload, stage-complete checks near lines 3736 / 4506 / 5474 / 5649), `src/lib/equipmentCompletion.ts` (`isEquipmentInstallComplete`), `src/pages/staff/PipelineDashboard.tsx` (equip-complete predicate, stage label, open-items list), `src/pages/operator/OperatorPortal.tsx` and `src/components/operator/SmartProgressWidget.tsx` (driver view), `src/components/equipment/CreateSignOffSheetModal.tsx` + `SignOffSheetPreviewModal.tsx` (device label + option).
- The IFTA decal is a paper decal, not inventory-tracked hardware, so no serial-number field and no `equipment_items` rows — checklist item only.