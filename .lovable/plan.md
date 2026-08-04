# Make IFTA Decal a tracking-only field (not a completion requirement)

Keep the "IFTA Decal Issued" Yes/No dropdown in Stage 5 — Equipment exactly where it is, next to Fuel Card Issued. Remove it from every place that treats it as a requirement, so it no longer blocks Stage 5, Go Live, or progress percentages.

## What changes

1. **Stage 5 — Equipment (Onboarding Pipeline)**
   - The IFTA Decal Issued dropdown stays. Staff can set Yes or No at any time.
   - Stage 5 counts as complete again when Decal Applied, ELD Installed (or ELD-exempt), and Fuel Card Issued are Yes — IFTA is not part of that check.
   - The Equip dot goes back to a 3-item count ("2/3 done", not "2/4").
   - The Stage 5 auto-collapse behavior ignores IFTA.

2. **Pipeline list**
   - The "Open: IFTA Decal" chip disappears from driver rows. IFTA is removed from the open-items list, the "Incomplete: Equip" filter, and the Active — Open Onboarding Items grouping, so the 42 drivers currently flagged for it drop off that list.

3. **Driver app**
   - "IFTA Decal Issued" is removed from the driver-facing Stage 5 status list and from the Smart Progress coordinator checklist, so it never shows a driver as incomplete or lowers their progress percentage. (Staff-only tracking.)

4. **Go Live**
   - No change needed beyond the above — once IFTA is out of the Stage 5 completion rule, it no longer gates Go Live.

## Technical notes

- `src/lib/equipmentCompletion.ts`: drop `ifta_decal_issued` from `isEquipmentInstallComplete` (keep the field on the type so the value can still be read/written).
- `src/pages/staff/OperatorDetailPanel.tsx`: keep the state field, load, save payload, and the Select control; remove `ifta_decal_issued` from the stage-complete expressions and the equip dot count/tooltip (lines ~2808, 3767, 3792, 3901-3902, 4538-4542, 4685-4689, 5526-5549) and from the auto-collapse conditions.
- `src/pages/staff/PipelineDashboard.tsx`: remove IFTA from the equip-complete predicates (~146, 176, 507) and the open-items push (~2137); keep the column in the select/mapping so the value is still available.
- `src/pages/operator/OperatorPortal.tsx` (~805, 900) and `src/components/operator/SmartProgressWidget.tsx` (~145, 157): remove the IFTA entries from driver-facing checklists and counts.
- No database migration and no data changes — the `ifta_decal_issued` column and existing values stay as-is.
