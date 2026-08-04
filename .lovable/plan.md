# Remove the IFTA Decal checklist item (keep the bolder stage titles)

Roll back the "IFTA Decal Issued" feature added in Stage 5 — Equipment, returning the equipment checklist to its previous three items (Decal Applied / ELD Installed / Fuel Card Issued). All typography work from the stage-ribbon and bold-subtitle pass stays exactly as it is.

## What changes for users

1. **Onboarding Pipeline → Stage 5 — Equipment**
   - The "IFTA Decal Issued" dropdown is removed from the Fuel Card block.
   - Stage 5 reads complete again when decal, ELD (or ELD-exempt), and fuel card are Yes.
   - The EQUIP dot returns to a 3-item count, and "IFTA Decal" is removed from the open-items list and the "Incomplete: Equip" chip.

2. **Driver app**
   - "IFTA Decal Issued" is removed from the Stage 5 status list and from the Smart Progress coordinator checklist (back to 3 items).

3. **Onboard Systems sign-off sheet**
   - "IFTA Decal" is removed as a selectable line item and from the sheet preview labels.

4. **Unchanged**
   - Bold stage titles, constrained stage ribbon width, and the shared bold section subtitles across all stages remain.

## Technical notes

- Code: revert IFTA references in `src/pages/staff/OperatorDetailPanel.tsx` (type, defaults, load/sync, save payload, four stage-complete checks, checklist entries, the Select control, and the auto-collapse conditions), `src/pages/staff/PipelineDashboard.tsx` (type fields, equip predicates, select list, mapping, open-items), `src/lib/equipmentCompletion.ts`, `src/pages/operator/OperatorPortal.tsx`, `src/components/operator/SmartProgressWidget.tsx`, `src/components/equipment/SignOffSheetPreviewModal.tsx` (and the create-sheet modal option if present).
- Database migration: drop `ifta_decal_issued` from `public.onboarding_status`, and remove the IFTA row from `pipeline_config`. The `ifta_decal` value on the `osas_device_type` enum cannot be dropped in Postgres without recreating the type; it will simply be left unused and unselectable in the UI. Any existing sign-off sheet line items of that type would be cleaned up first if present.
